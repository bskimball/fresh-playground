export type ThemePreference = "light" | "dark" | "system"

const themeIcons = {
  system: "M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM8 21h8m-4-4v4",
  light:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5",
  dark: "M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z",
} as const

export const THEME_EVENT = "playground:theme-change"

export const parseTheme = (value: string | null | undefined): ThemePreference =>
  value === "light" || value === "dark" ? value : "system"

export const nextTheme = (mode: ThemePreference): ThemePreference =>
  mode === "system" ? "light" : mode === "light" ? "dark" : "system"

export const themeLabel = (mode: ThemePreference) =>
  `Appearance: ${mode}. Switch to ${nextTheme(mode)}`

export const hasThemeCookie = (cookie: string): boolean =>
  cookie
    .split(";")
    .map((part) => part.trim())
    .some((part) => part.startsWith("theme="))

export const themeFromCookie = (cookie: string) =>
  parseTheme(
    cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("theme="))
      ?.slice(6),
  )

export const readDocumentTheme = (): ThemePreference => {
  if (typeof document === "undefined") return "system"
  if (hasThemeCookie(document.cookie)) {
    return themeFromCookie(document.cookie)
  }
  return parseTheme(document.documentElement.dataset.appearance)
}

const syncThemeDomState = (next: ThemePreference) => {
  if (typeof document === "undefined") return
  document.documentElement.dataset.appearance = next
  if (next === "system") document.documentElement.removeAttribute("data-theme")
  else document.documentElement.dataset.theme = next

  for (const wrapper of document.querySelectorAll<HTMLElement>("[data-astryx-theme]")) {
    if (next === "system") wrapper.removeAttribute("data-theme")
    else wrapper.dataset.theme = next
  }

  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove())
  for (const mode of next === "system" ? (["light", "dark"] as const) : [next]) {
    const meta = document.createElement("meta")
    meta.name = "theme-color"
    meta.content = mode === "dark" ? "#20231e" : "#f7f5ee"
    if (next === "system") meta.media = `(prefers-color-scheme: ${mode})`
    document.head.append(meta)
  }

  const root = document.querySelector<HTMLElement>('[data-island="theme-toggle"]')
  if (root) {
    const button = root.querySelector<HTMLButtonElement>("button")
    if (button) button.setAttribute("aria-label", themeLabel(next))
    const path = root.querySelector<SVGPathElement>("svg path")
    if (path) path.setAttribute("d", themeIcons[next])
  }

  window.dispatchEvent(new CustomEvent<ThemePreference>(THEME_EVENT, { detail: next }))
}

/** Reconciles DOM theme attributes & toggle icon with `document.cookie` (for prefetched, BFCache, or SW-cached pages). */
export function syncThemeFromCookie() {
  if (typeof document === "undefined" || !hasThemeCookie(document.cookie)) return
  const cookieTheme = themeFromCookie(document.cookie)
  syncThemeDomState(cookieTheme)
}

export function applyThemePreference(next: ThemePreference) {
  if (typeof document === "undefined") return
  document.cookie = `theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`
  syncThemeDomState(next)

  // Reset Speculation Rules so prefetched pages rendered under the previous theme are discarded.
  const speculation = document.querySelector<HTMLScriptElement>('script[type="speculationrules"]')
  if (speculation?.parentNode) {
    const replacement = document.createElement("script")
    replacement.type = "speculationrules"
    replacement.textContent = speculation.textContent
    speculation.parentNode.replaceChild(replacement, speculation)
  }

  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("playground-garden")
    channel.postMessage("theme-mutated")
    channel.close()
  }
}

export interface StoredNavPillRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
  readonly path: string
}

export const computeNavPillDelta = (
  prev: StoredNavPillRect | null,
  current: StoredNavPillRect,
  handledByViewTransition: boolean,
  reducedMotion: boolean,
): {
  readonly dx: number
  readonly dy: number
  readonly sx: number
  readonly sy: number
} | null => {
  if (
    handledByViewTransition ||
    reducedMotion ||
    !prev ||
    prev.path === current.path ||
    current.width === 0 ||
    current.height === 0
  ) {
    return null
  }
  const dx = prev.left - current.left
  const dy = prev.top - current.top
  const sx = prev.width / current.width
  const sy = prev.height / current.height
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.02) {
    return null
  }
  return { dx, dy, sx, sy }
}
