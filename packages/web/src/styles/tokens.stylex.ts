import * as stylex from "@stylexjs/stylex"

export const colors = stylex.defineVars({
  ink: "var(--color-text-primary)",
  paper: "var(--color-background-body)",
  card: "var(--color-background-card)",
  line: "var(--color-border)",
  muted: "var(--color-text-secondary)",
  faint: "var(--color-text-secondary)",
  sage: "#899579",
  moss: "#75875f",
  mossDark: "#61754c",
  olive: "#8b9a69",
  mist: "#e3e9d9",
  focus: "#a66b3e",
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
