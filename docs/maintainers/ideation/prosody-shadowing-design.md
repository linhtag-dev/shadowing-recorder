# TTS Shadowing and Prosody Feedback

Status: Draft  
Last updated: 2026-07-11

Related MVP: [Shadowing Recorder MVP requirements](../requirements/shadowing-recorder-mvp.md). The MVP intentionally excludes TTS and automated prosody feedback.

## 1. Overview

The application helps a learner practise speaking by shadowing a text-to-speech reference.

The core interaction is:

1. The application receives a paragraph.
2. It reads the paragraph aloud using text-to-speech (TTS).
3. The learner listens and shadows the reference.
4. The application records the learner's attempt.
5. The learner can replay the reference and their recording.
6. Optionally, the application compares the recordings and gives prosody feedback.

For this use case, Kokoro is the recommended default for reference generation. It is small, fast, commercially usable under Apache-2.0, and provides a collection of preset voices. ElevenLabs can be offered as an optional managed or premium reference provider when higher expressiveness, a wider voice catalogue, or API-based operation is valuable. Neither provider needs to clone or analyse the learner's voice; analysis belongs in a separate prosody-comparison pipeline.

## 2. Goals and non-goals

### Goals

- Generate a clear and consistent spoken reference from a paragraph.
- Let the learner listen, record, replay, and retry with little delay.
- Compare timing and pitch patterns without penalising natural differences in voice range or loudness.
- Give a small number of specific, actionable suggestions.
- Suppress feedback when recording or alignment quality is too low.
- Support gradual expansion from simple timing feedback to word- and syllable-level analysis.
- Allow the reference-TTS provider to change without changing the recording or prosody-analysis pipeline.

### Non-goals

- Voice cloning.
- Judging a learner by how closely their vocal identity resembles the TTS voice.
- Treating one TTS rendering as the only correct way to speak a paragraph.
- Diagnosing speech or language disorders.
- Producing a reliable regional-accent score from prosody alone.

## 3. Important terminology

- **Shadowing:** listening to a spoken model and repeating it with minimal delay or immediately afterward.
- **Prosody:** speech timing, rhythm, stress or prominence, pitch and intonation, speaking rate, and pauses.
- **Segmental pronunciation:** the production of individual consonants and vowels. This is related to accent but is separate from prosody.
- **Forced alignment:** matching a known transcript to audio to estimate the start and end of its words and phonemes.
- **Prominence:** how strongly a word or syllable stands out from its neighbours through pitch, intensity, or duration.

## 4. Proposed system

```text
                                   +-------------------------+
Paragraph -> text preparation ---> | Reference TTS provider  |
                                   | Kokoro or ElevenLabs    |
                                   +------------+------------+
                                               |
                                               v
                                        reference audio
                                               |
                                               v
                                      forced alignment
                                               |
                                               v
                                      reference features --+
                                                           |
                                                           v
Microphone -> recording -> quality checks -> alignment -> comparison -> feedback
                                                 |             ^
                                                 v             |
                                          learner features ----+
```

The reference and learner recordings are aligned independently to the same text. Their acoustic features are then compared at corresponding phrase, word, or syllable locations. Raw waveforms should not be compared directly because differences in speaker identity, microphone, room acoustics, and recording gain would dominate the result.

## 5. Reference generation with Kokoro

### Why Kokoro fits

[Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) is an 82-million-parameter open-weight TTS model. Its weights use the Apache-2.0 licence, and its small size makes local or low-cost deployment practical. It generates natural prosody from text and offers multiple preset voices.

The official [Kokoro voice catalogue](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md) includes American and British English voices, as well as voices for several other languages. The catalogue also notes that voice quality varies and that very short or very long inputs can perform worse.

### Recommended use

- Choose a high-quality voice for each supported target accent, such as one American English voice and one British English voice.
- Keep the chosen voice stable across practice sessions so that changes in the reference do not confuse progress comparisons.
- Avoid voice blending for the initial product; it introduces another variable without improving the learning objective.
- Preserve the punctuation supplied to Kokoro because punctuation influences pauses and phrasing.
- Use phoneme input only when a word's default pronunciation needs correction.
- Record the exact model version, voice, language, speed, text, and text hash used to create every reference.
- Cache generated references so the same exercise always produces the same audio.

### Chunking strategy

Generate as much coherent context as Kokoro can handle naturally, then divide the generated audio into practice units using alignment timestamps. Generating every sentence independently can give each sentence an artificial isolated-sentence contour.

The Kokoro voice documentation reports that many voices perform best around 100–200 tokens, may be weak on very short utterances, and may rush very long utterances. A practical policy is therefore:

- Generate a normal paragraph in one pass when it is within a comfortable length.
- Split long text at sentence or clause boundaries into coherent multi-sentence chunks.
- Align the resulting audio and expose shorter phrase or sentence loops in the interface.

### Limitation

Kokoro predicts a plausible delivery; it does not supply a universally correct delivery. If the product requires a specific regional accent, teaching style, or carefully curated emphasis, a recorded human reference or an accent-specific fine-tuned model may be more appropriate.

## 6. Optional managed reference generation with ElevenLabs

### When ElevenLabs fits

ElevenLabs can be considered as a proprietary, cloud-hosted alternative for generating reference speech. It may be useful when the product values a broad voice catalogue, expressive delivery, a managed API, or fast experimentation more than local deployment and open-source control.

The current [ElevenLabs model catalogue](https://elevenlabs.io/docs/overview/models) identifies three relevant models:

- **Eleven Multilingual v2:** the preferred starting point for general language practice because it is positioned for natural, stable, long-form generation.
- **Eleven v3:** a more expressive model with delivery and emotion tags. It is suitable for advanced or dramatic shadowing exercises, but its higher variability and latency make it less suitable as the default neutral reference.
- **Eleven Flash v2.5:** a lower-latency and lower-cost option for interactive generation. ElevenLabs reports about 75 ms of model latency, excluding application and network latency.

Voice selection should match the language and target region. Voice cloning is unnecessary for this product and should remain out of scope unless a future exercise has a clear pedagogical need, documented speaker permission, and appropriate legal review.

### Kokoro and ElevenLabs comparison

| Consideration | Kokoro | ElevenLabs |
| --- | --- | --- |
| Deployment | Local or self-hosted | Proprietary cloud API |
| Licence or terms | Apache-2.0 model weights | Commercial service terms |
| Reference delivery | Natural preset voices | Potentially more expressive, with a broader managed voice catalogue |
| Controls | Voice, speed, punctuation, and phoneme input | Voice, speed, stability, style, pronunciation controls, and v3 delivery tags |
| Operating cost | Local compute and hosting | Subscription or metered API usage |
| Network dependency | None when deployed locally | Required |
| Privacy | Reference generation can remain local | Input text and output audio are processed by a third party |
| Reproducibility | Model and runtime can be pinned | Generation is non-deterministic and provider models may change |
| Built-in alignment | No | Optional word- and character-level forced-alignment API |

Quality should be evaluated for **shadowability**, not naturalness alone. An expressive performance may sound impressive while being too variable or theatrical for a learner to imitate comfortably.

### Provider-neutral integration

Reference synthesis should sit behind an internal interface such as:

```text
synthesize(text, voice, language, settings)
    -> audio
    -> provider metadata
    -> optional timestamps
```

The stored metadata should include:

- Provider and model ID.
- Model version when available.
- Voice ID and target accent or region.
- Speed, stability, style, and other provider settings.
- Input text and text hash.
- Generation date and output format.
- Any provider-supplied alignment or seed information.

ElevenLabs documents that its voice settings define ranges of randomisation rather than guaranteeing identical output. Each accepted exercise reference must therefore be generated once, reviewed when appropriate, stored, and reused for every attempt. It should not be regenerated when the learner presses replay or retry. See the [ElevenLabs TTS product guide](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech) for the documented stability and variability behaviour.

### Alignment and learner-data privacy

The [ElevenLabs Forced Alignment API](https://elevenlabs.io/docs/api-reference/forced-alignment/create) accepts text and audio and returns character and word timestamps plus alignment loss. It can simplify a word-level prototype, but it does not replace phoneme or syllable alignment for detailed stress analysis.

The preferred privacy boundary is:

- Send exercise text to ElevenLabs only when generating a reference.
- Store the returned reference audio in the application's own cache.
- Keep learner recordings inside the application's existing analysis infrastructure.
- Use Montreal Forced Aligner or another controlled backend for learner alignment.

If learner recordings are sent to ElevenLabs for alignment or transcription, the product must disclose this clearly and review its retention configuration. ElevenLabs states that data is retained by default and that [Zero Retention Mode](https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode) is available only to qualifying Enterprise customers. Its [commercial-use guidance](https://help.elevenlabs.io/hc/en-us/articles/13313564601361-Can-I-publish-the-content-I-generate-on-the-platform) also states that free-plan output does not include commercial rights, while paid plans include commercial usage subject to applicable terms.

## 7. Learner recording experience

The recording flow should include:

- Microphone permission and input-device selection.
- A short level check before the first attempt.
- Optional headphones to prevent reference audio leaking into the recording.
- A visible count-in or clear start cue.
- Immediate replay of the learner and reference recordings.
- A retry action that does not require regenerating the reference.
- Optional phrase-level looping for difficult sections.

Store or transmit mono PCM audio for analysis. Browser recordings can be captured at the device's native rate and resampled consistently on the analysis side.

Before analysis, check for:

- Empty or extremely short recordings.
- Excessive leading or trailing silence.
- Clipping.
- Low speech level or poor signal-to-noise ratio.
- Reference-audio leakage.
- A large mismatch between expected and observed speaking duration.

When quality is insufficient, request another recording instead of producing unreliable feedback.

## 8. Content validation and alignment

The system already knows the target paragraph, so forced alignment is more useful than unconstrained transcription.

[Montreal Forced Aligner](https://montreal-forced-aligner.readthedocs.io/en/v3.4.0/user_guide/) can align a transcript at word and phoneme level using a pronunciation dictionary and acoustic model. It is the preferred backend when syllable stress and detailed rhythm are required.

[WhisperX](https://github.com/m-bain/whisperX) provides word-level timestamps using a wav2vec2 alignment stage and is a simpler option for an early word-level prototype. Word alignment is sufficient for speaking rate, pause placement, phrase intonation, and approximate word prominence; phoneme alignment is needed for detailed syllable-level feedback.

A forced aligner may assign plausible timestamps even when a learner omits or changes words. The pipeline should therefore:

1. Estimate whether the spoken content covers the expected text using ASR or CTC alignment confidence.
2. Mark omitted, inserted, or low-confidence sections.
3. Run prosody comparison only on confidently matched regions.
4. Treat content accuracy and prosody as separate feedback categories.

## 9. Acoustic features

[Parselmouth](https://parselmouth.readthedocs.io/en/stable/) exposes Praat's pitch and intensity analysis in Python. It is a suitable initial feature extractor. [torchcrepe](https://github.com/maxrmorrison/torchcrepe) is an alternative pitch tracker when a neural F0 estimator is useful.

| Category | Features | Example feedback |
| --- | --- | --- |
| Speaking rate | Voiced duration, words per second, syllables per second | “Your second clause was faster than the reference.” |
| Pauses | Location and duration of internal pauses | “Try a slightly longer pause after ‘however’.” |
| Word timing | Word and syllable duration relative to their phrase | “Hold ‘really’ a little longer.” |
| Intonation | Relative F0 contour, pitch range, phrase slope, final boundary movement | “Let the pitch fall at the end of the statement.” |
| Prominence | Local pitch excursion, intensity contrast, and duration | “The reference places more emphasis on ‘important’.” |
| Fluency | Unexpected gaps, repetitions, and restarts | “The pause inside this phrase interrupted its rhythm.” |

Segmental pronunciation feedback, such as identifying a substituted consonant or vowel, should be designed as a separate feature even if it shares the same alignment data.

## 10. Speaker-normalised comparison

### Pitch

Absolute pitch must not be compared between speakers. Convert each speaker's voiced F0 values to semitones relative to that speaker's median:

```text
relative_pitch = 12 * log2(F0 / median_F0)
```

This preserves pitch movement while reducing the effect of differences in age, sex, physiology, or habitual pitch range. Remove unvoiced frames and guard against octave-tracking errors before comparison.

### Intensity

Recording level and microphone automatic gain control make absolute loudness unreliable. Compare intensity relative to each speaker's local or utterance-level mean, and give less weight to energy when recording conditions are unstable.

### Timing

Compare timing at aligned linguistic units rather than at equal waveform timestamps. Useful measurements include:

- Phrase-duration ratio.
- Word-duration ratio.
- Pause-duration difference.
- Relative position of a word within its phrase.
- Duration contrast between a prominent syllable and neighbouring syllables.

Dynamic time warping can align pitch contours inside a matched phrase, but it should not erase the very timing differences the rhythm score is intended to measure. Keep contour-shape and timing scores separate.

## 11. Feedback policy

Feedback should be specific, evidence-based, and limited to the most useful observations.

Recommended policy:

- Report at most one to three improvements after an attempt.
- Attach feedback to a phrase or word that the learner can replay.
- Prefer relative language such as “closer to the reference” over “correct” or “incorrect.”
- Include positive confirmation when an aspect matches well.
- Do not produce detailed feedback for low-confidence alignments.
- Do not penalise harmless differences in vocal range, timbre, or microphone level.
- Allow multiple acceptable deliveries rather than demanding a perfect contour match.

Example feedback:

- “Your overall pace was close to the reference.”
- “The pause after ‘on the other hand’ was about half as long as the reference pause.”
- “The reference emphasises ‘first’; your strongest emphasis was on ‘result’.”
- “Try a falling pitch over the final three words.”

An LLM may turn structured measurements into friendly wording, but it should not invent the measurements or decide correctness from raw audio. The analysis service should provide the evidence, location, confidence, and permitted feedback category.

## 12. Suggested analysis output

The analysis layer should return structured data that can support both the interface and later evaluation:

```json
{
  "attempt_id": "attempt_123",
  "reference_id": "reference_456",
  "quality": {
    "recording_ok": true,
    "alignment_confidence": 0.93,
    "matched_word_fraction": 0.98
  },
  "summary": {
    "speaking_rate_ratio": 1.12,
    "pause_similarity": 0.84,
    "intonation_similarity": 0.78,
    "prominence_similarity": 0.81
  },
  "observations": [
    {
      "type": "pause_duration",
      "word_after": "however",
      "start_seconds": 2.34,
      "reference_seconds": 0.42,
      "learner_seconds": 0.18,
      "confidence": 0.95
    }
  ],
  "feedback": [
    {
      "message": "Try a slightly longer pause after ‘however’.",
      "start_seconds": 2.34,
      "end_seconds": 3.10
    }
  ]
}
```

Similarity values should not be presented to users until their interpretation has been calibrated against human judgments.

## 13. Staged implementation

### Stage 1: Shadowing loop

- Paragraph input.
- A provider-neutral reference-TTS interface.
- Kokoro as the default provider and ElevenLabs as an optional managed provider.
- Reference generation, metadata capture, review, and caching.
- Reference playback.
- Learner recording, playback, and retry.
- Basic recording-quality validation.

### Stage 2: Coarse prosody feedback

- Word-level alignment.
- Overall and phrase-level speaking rate.
- Pause placement and duration.
- Phrase-level pitch contour and final rise or fall.
- Rule-based feedback with confidence gating.

### Stage 3: Detailed stress and rhythm

- Phoneme and syllable alignment.
- Lexical-stress information from the pronunciation dictionary.
- Syllable prominence derived from pitch, intensity, and duration.
- Word-level replay and visual highlighting.

### Stage 4: Calibration and personalisation

- Compare automatic observations with trained human raters.
- Tune thresholds by language, target accent, voice, device, and learner level.
- Run blinded comparisons of Kokoro, ElevenLabs, and selected human references for naturalness, accent fit, consistency, and ease of shadowing.
- Track changes against the learner's own history without treating the TTS speaker's vocal range as the target.
- Consider learned prosody representations only after the interpretable baseline is reliable.

## 14. Evaluation

The system should be evaluated on more than model-level similarity scores.

Measure:

- Word- and phoneme-boundary accuracy.
- Pitch-tracking failure and octave-error rates.
- Agreement between automated observations and human prosody annotations.
- False-feedback rate, especially feedback attached to the wrong word.
- Feedback suppression rate for low-quality recordings.
- Analysis latency.
- Reference-generation latency, failure rate, and cost by provider.
- Reference naturalness, accent fit, consistency, and ease of shadowing by provider and voice.
- Learner comprehension and perceived usefulness.
- Performance across different vocal ranges, accents, microphones, rooms, and device types.

Use consented recordings from diverse speakers. Human raters should judge whether each proposed message is both acoustically supported and pedagogically useful.

## 15. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| The TTS reference has unnatural emphasis | Curate voices and exercises; permit a human-recorded reference when needed. |
| Forced alignment hides an omitted word | Validate content and alignment confidence before prosody scoring. |
| Pitch tracking produces octave jumps | Smooth contours, constrain plausible ranges, and suppress low-confidence regions. |
| Microphone gain distorts intensity | Normalise intensity and give it less weight than timing and pitch. |
| Valid alternate prosody is penalised | Frame results as reference matching and use tolerant, calibrated thresholds. |
| Accent bias is presented as ability | Separate accent, pronunciation, and prosody; avoid a single authoritative accent score. |
| Too much feedback overwhelms learners | Prioritise one to three replayable, actionable observations. |
| Voice recordings create privacy risk | Obtain consent, minimise retention, provide deletion, and prefer local processing where practical. |
| A cloud TTS provider is slow or unavailable | Cache all accepted references and retain Kokoro as a local fallback. |
| Provider updates or random generation change a reference | Store the exact accepted audio and all available provider metadata; never regenerate an active exercise implicitly. |
| Managed TTS costs grow unexpectedly | Track characters, generations, cache hits, and cost per completed exercise; enforce budgets and reuse audio. |
| Learner audio is unintentionally sent to a third party | Keep TTS and learner analysis behind separate interfaces and require an explicit privacy review before enabling external alignment. |
| Commercial rights or service terms change | Use an eligible paid plan, record the governing terms, and review provider terms periodically. |

## 16. Initial recommendation

Use the following stack for the first implementation:

- **Reference abstraction:** expose one internal synthesis interface so reference generation is not coupled to a single provider.
- **Default reference TTS:** Kokoro-82M with one curated voice per target accent.
- **Optional managed reference TTS:** Eleven Multilingual v2 as the first premium candidate; use Eleven v3 only for deliberately expressive exercises and Flash v2.5 when immediate generation is the priority.
- **Reference persistence:** cache the accepted audio and complete generation metadata; do not regenerate it between learner attempts.
- **Alignment:** word-level alignment for the MVP; Montreal Forced Aligner when syllable detail is introduced.
- **Acoustic analysis:** Parselmouth/Praat for F0 and intensity, plus aligned word durations and pauses.
- **Comparison:** speaker-normalised, linguistically aligned features rather than raw audio similarity.
- **Feedback:** deterministic rules that select the largest confident differences.
- **Optional language generation:** an LLM may rewrite structured observations, subject to strict grounding and templates.

Use ElevenLabs initially for reference generation only; keep learner recordings and prosody analysis in the application's controlled infrastructure. The highest-value first feedback is likely to come from speaking rate, pauses, and phrase-final intonation. Detailed syllable stress should follow only after alignment and confidence handling have been validated.

## 17. References

- [Kokoro-82M model card](https://huggingface.co/hexgrad/Kokoro-82M)
- [Kokoro voice catalogue](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md)
- [ElevenLabs model catalogue](https://elevenlabs.io/docs/overview/models)
- [ElevenLabs TTS product guide and voice settings](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech)
- [ElevenLabs Forced Alignment API](https://elevenlabs.io/docs/api-reference/forced-alignment/create)
- [ElevenLabs Zero Retention Mode](https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode)
- [ElevenLabs commercial-use guidance](https://help.elevenlabs.io/hc/en-us/articles/13313564601361-Can-I-publish-the-content-I-generate-on-the-platform)
- [Montreal Forced Aligner user guide](https://montreal-forced-aligner.readthedocs.io/en/v3.4.0/user_guide/)
- [WhisperX](https://github.com/m-bain/whisperX)
- [Parselmouth documentation](https://parselmouth.readthedocs.io/en/stable/)
- [torchcrepe](https://github.com/maxrmorrison/torchcrepe)
