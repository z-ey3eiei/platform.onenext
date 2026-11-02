/**
 * Runtime configuration, read from Vite env vars (VITE_* only).
 * Anything secret must stay server-side; VITE_* ships to the browser.
 */

/** Join a base URL and a path without creating or losing a slash. */
export function joinUrl(base: string, path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const trimmedBase = base.replace(/\/+$/, '')
  const trimmedPath = path.replace(/^\/+/, '')
  if (!trimmedBase) return `/${trimmedPath}`
  if (!trimmedPath) return trimmedBase
  return `${trimmedBase}/${trimmedPath}`
}

const rawApiUrl = import.meta.env.VITE_API_URL ?? ''

export const config = {
  appName: import.meta.env.VITE_APP_NAME ?? 'My Web',
  apiUrl: rawApiUrl.replace(/\/+$/, ''),
  apiStatusUrl: joinUrl(rawApiUrl, 'status'),
  isProd: import.meta.env.PROD,
} as const

export type AppConfig = typeof config

/** Warn loudly in CI/dev instead of failing silently at runtime. */
export function missingConfigKeys(): string[] {
  return rawApiUrl ? [] : ['VITE_API_URL']
}
