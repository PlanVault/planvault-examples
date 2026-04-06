/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PLANVAULT_BASE_URL: string
  readonly VITE_PLANVAULT_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
