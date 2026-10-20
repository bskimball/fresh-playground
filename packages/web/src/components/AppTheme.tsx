import { Theme } from "@astryxdesign/core/theme"
import { neutralTheme } from "@astryxdesign/theme-neutral/built"
import type { ReactNode } from "react"

/** Each independently rendered island needs the same theme on server and client. */
export function AppTheme({ children }: { children: ReactNode }) {
  return (
    <Theme theme={neutralTheme} mode="light">
      {children}
    </Theme>
  )
}
