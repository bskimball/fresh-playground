import { createContext, useContext, useSyncExternalStore } from "react"
import {
  applyThemePreference,
  nextTheme,
  parseTheme,
  readDocumentTheme,
  THEME_EVENT,
  type ThemePreference,
  themeFromCookie,
  themeLabel,
} from "./themeDom.ts"

export { nextTheme, parseTheme, type ThemePreference, themeFromCookie, themeLabel }

/** Request-local during SSR; immutable document snapshot during hydration. */
export const ThemePreferenceContext = createContext<ThemePreference | undefined>(undefined)

const initial = readDocumentTheme()
let preference: ThemePreference = initial
const listeners = new Set<() => void>()

if (typeof window !== "undefined") {
  window.addEventListener(THEME_EVENT, (event) => {
    const next = (event as CustomEvent<ThemePreference>).detail
    if (next && next !== preference) {
      preference = next
      listeners.forEach((listener) => listener())
    }
  })
}

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
  applyThemePreference(next)
  listeners.forEach((listener) => listener())
}
