/// <reference types="vite/client" />

/**
 * Type the env vars this app actually uses. Without this, `import.meta.env.X`
 * falls back to `any` and typed linting can't catch typos in env names.
 */
interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
