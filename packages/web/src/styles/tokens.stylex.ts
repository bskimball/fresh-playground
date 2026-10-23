import * as stylex from "@stylexjs/stylex"

export const colors = stylex.defineVars({
  ink: "var(--color-text-primary)",
  paper: "var(--color-background-body)",
  card: "var(--color-background-card)",
  line: "var(--color-border)",
  muted: "var(--color-text-secondary)",
  faint: "var(--color-text-secondary)",
  sage: "light-dark(#5a664c, #b2c1a3)",
  moss: "light-dark(#5c6e47, #a4ba88)",
  mossDark: "light-dark(#4a5c38, #b8cf9c)",
  olive: "light-dark(#647347, #bbc99b)",
  mist: "light-dark(#e3e9d9, #394431)",
  focus: "light-dark(#a66b3e, #d6a477)",
  surfaceSubtle: "light-dark(#f0eee3, #242921)",
  surfaceElevated: "light-dark(#fffef9, #2b3128)",
  surfaceTint: "light-dark(#e9efe0, #2e3828)",
  borderSubtle: "light-dark(#e3e5d8, #374031)",
  borderStrong: "light-dark(#cbd2bf, #4c5843)",
  shadowSm:
    "0 1px 2px light-dark(oklch(0.25 0.03 140 / 0.07), oklch(0 0 0 / 0.32)), 0 0 0 1px light-dark(oklch(0.25 0.03 140 / 0.04), oklch(1 0 0 / 0.05))",
  shadowMd: "0 12px 32px -8px light-dark(oklch(0.25 0.03 140 / 0.09), oklch(0 0 0 / 0.42))",
  water: "light-dark(#2b6164, #8ec8cb)",
  waterBg: "light-dark(#e5f0ef, #273939)",
  sun: "light-dark(#7c5614, #e2c178)",
  sunBg: "light-dark(#f8eed6, #3f3522)",
  danger: "light-dark(#a13d2d, #eb8575)",
})

export const fonts = stylex.defineVars({
  sans: '"Figtree", sans-serif',
  serif: '"Fraunces", Georgia, serif',
})

export const media = stylex.defineConsts({
  wide: "@media (min-width: 1400px)",
  tablet: "@media (max-width: 950px)",
  mobile: "@media (max-width: 720px)",
  tiny: "@media (max-width: 380px)",
})
