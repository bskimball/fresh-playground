import { createContext, useContext, useSyncExternalStore } from "react"

export type ThemePreference = "light" | "dark" | "system"

export const parseTheme = (value: string | null | undefined): ThemePreference =>
  value === "light" || value === "dark" ? value : "system"

export const themeFromCookie = (cookie: string) =>
  parseTheme(
    cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("theme="))
      ?.slice(6),
  )

/** Request-local during SSR; immutable document snapshot during hydration. */
export const ThemePreferenceContext = createContext<ThemePreference | undefined>(undefined)
const initial =
  typeof document === "undefined"
    ? "system"
    : parseTheme(document.documentElement.dataset.appearance)
let preference: ThemePreference = initial
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const getSnapshot = () => preference

export function useThemePreference() {
  const serverPreference = useContext(ThemePreferenceContext) ?? initial
  return useSyncExternalStore(subscribe, getSnapshot, () => serverPreference)
}

export function setThemePreference(next: ThemePreference) {
  preference = next
  document.cookie = `theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`
  if (next === "system") document.documentElement.removeAttribute("data-theme")
  else document.documentElement.dataset.theme = next
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove())
  for (const mode of next === "system" ? (["light", "dark"] as const) : [next]) {
    const meta = document.createElement("meta")
    meta.name = "theme-color"
    meta.content = mode === "dark" ? "#20231e" : "#f7f5ee"
    if (next === "system") meta.media = `(prefers-color-scheme: ${mode})`
    document.head.append(meta)
  }
  listeners.forEach((listener) => listener())
}
