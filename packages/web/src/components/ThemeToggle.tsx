import { IconButton } from "@astryxdesign/core/IconButton"
import { Icon } from "./Icon.tsx"
import { nextTheme, setThemePreference, themeLabel, useThemePreference } from "./themePreference.ts"

/** A compact three-way cycle, separate from the garden's day/night simulation. */
export function ThemeToggle() {
  const mode = useThemePreference()
  const next = nextTheme(mode)
  const icon = mode === "system" ? "monitor" : mode === "light" ? "sun" : "moon"
  return (
    <IconButton
      label={themeLabel(mode)}
      icon={<Icon name={icon} size={18} />}
      onClick={() => setThemePreference(next)}
    />
  )
}
