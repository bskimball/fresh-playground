import * as stylex from "@stylexjs/stylex"

export const colors = stylex.defineVars({
  ink: "var(--color-text-primary)",
  paper: "var(--color-background-body)",
  card: "var(--color-background-card)",
  line: "var(--color-border)",
  muted: "var(--color-text-secondary)",
  faint: "var(--color-text-secondary)",
  sage: "light-dark(#899579, #a9b99a)",
  moss: "light-dark(#75875f, #a4ba88)",
  mossDark: "light-dark(#61754c, #b4c99a)",
  olive: "light-dark(#8b9a69, #bbc99b)",
  mist: "light-dark(#e3e9d9, #394431)",
  focus: "light-dark(#a66b3e, #d6a477)",
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
