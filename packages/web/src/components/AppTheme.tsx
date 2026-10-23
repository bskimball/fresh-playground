import { Theme } from "@astryxdesign/core/theme"
import { neutralTheme } from "@astryxdesign/theme-neutral/built"
import type { ReactNode } from "react"
import { useThemePreference } from "./themePreference.ts"

/** Each independently rendered island needs the same theme on server and client. */
export function AppTheme({ children }: { children: ReactNode }) {
  const mode = useThemePreference()
  return (
    <Theme theme={neutralTheme} mode={mode}>
      {children}
    </Theme>
  )
}
