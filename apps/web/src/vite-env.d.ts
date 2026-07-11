/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SHADOWING_VIDEO_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
