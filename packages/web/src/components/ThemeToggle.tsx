import { IconButton } from "@astryxdesign/core/IconButton"
import { AppTheme } from "./AppTheme.tsx"
import { Icon } from "./Icon.tsx"
import { setThemePreference, useThemePreference } from "./themePreference.ts"

/** A compact three-way cycle, separate from the garden's day/night simulation. */
export function ThemeToggle() {
  const mode = useThemePreference()
  const next = mode === "system" ? "light" : mode === "light" ? "dark" : "system"
  const icon = mode === "system" ? "monitor" : mode === "light" ? "sun" : "moon"
  return (
    <AppTheme>
      <IconButton
        label={`Appearance: ${mode}. Switch to ${next}`}
        icon={<Icon name={icon} size={18} />}
        onClick={() => setThemePreference(next)}
      />
    </AppTheme>
  )
}
