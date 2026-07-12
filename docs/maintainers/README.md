# Maintainer Documentation

Use this index to distinguish the current implementation from the target MVP,
accepted decisions, and historical evidence.

## Source of truth by question

| Question | Source |
| --- | --- |
| What works in the repository now? | Root [README](../../README.md) |
| What is complete and what remains? | [MVP implementation plan](plans/shadowing-recorder-mvp-implementation.md) |
| What must the public MVP do? | [MVP requirements](requirements/shadowing-recorder-mvp.md) |
| How must runtime state, media, and failures behave? | [Technical design](design/shadowing-recorder-technical-design.md) |
| Which stack and repository direction are accepted? | [MVP technology stack](plans/shadowing-recorder-mvp-technology-stack.md) |
| What blocks public launch on privacy or YouTube policy? | [YouTube embed and privacy rules](rules/youtube-compliance-and-privacy.md) |
| How is Cloudflare production configured, deployed, verified, and rolled back? | [Cloudflare rollout runbook](release/cloudflare-rollout.md) |
| How is the current build verified on real devices? | [Real-device test guide](testing/locally-hosted.md) |
| What did the fixed-video Stage 1 run prove? | [Stage 1 browser evidence](stage-1-browser-matrix.md) |

The requirements and technical design describe the target MVP and therefore
include behavior that is not implemented yet. The implementation plan records
that gap. Do not mark a requirement complete merely because an initial or
latest-recording-only slice exists.

## Architecture decisions

- [ADR 0001: Single-service deployment](decisions/0001-single-service-deployment-topology.md)
  is preserved but superseded.
- [ADR 0002: Current mainstream browsers](decisions/0002-current-mainstream-browser-support.md)
  defines the rolling support matrix.
- [ADR 0003: Canonical application origin](decisions/0003-canonical-application-origin.md)
  is preserved but superseded.
- [ADR 0004: Static web deployment](decisions/0004-static-web-deployment.md)
  selects the browser-only production topology.
- [ADR 0005: Cloudflare Workers Static Assets and canonical origin](decisions/0005-cloudflare-workers-static-assets.md)
  implements ADR 0004 and is the current hosting and origin decision.

Historical evidence records what passed at a particular implementation and
date. Preserve its commands, test counts, and findings as evidence; add a clear
historical note when the current repository moves on. Current browser/device
procedures belong in `testing/`, release procedures in `release/`, and neither
belongs in an old evidence record.

## Updating documentation

- Update the root README and implementation plan with each implemented behavior
  change.
- Update requirements when product scope or acceptance changes.
- Update the technical design when target runtime semantics or failure handling
  changes.
- Add or supersede an ADR when an accepted architecture decision changes.
- Review the privacy rules before any public launch or any audience, tracking,
  persistence, backend, account, upload, sharing, or third-party data-flow
  change.
- Record real-browser results without committing test-video details,
  credentials, learner audio, or sensitive screenshots.
