import { Card } from "@astryxdesign/core/Card"
import * as stylex from "@stylexjs/stylex"
import type { ReactNode } from "react"
import { text } from "../styles/text.ts"
import { colors, media } from "../styles/tokens.stylex.ts"

const layers = [
  ["Effect HTTP", "Routes and renders each page on the server; only the islands hydrate."],
  ["Effect HttpApi", "Defines the HTTP API once, serves it, and generates the typed client."],
  ["XState", "Owns the garden’s care workflow: watering, day and night, saving."],
  ["Effect atoms", "Read API data reactively, like the live status below."],
  ["Astryx", "Provides the shared theme, cards, buttons, and accessible sunlight slider."],
  ["React + StyleX", "Render everything, with React Compiler memoizing the islands."],
] as const

/** Server-rendered; `children` is where the page drops its island. */
export function AboutArticle({ children }: { children?: ReactNode }) {
  return (
    <Card role="article" xstyle={styles.card}>
      <p {...stylex.props(text.eyebrow)}>HOW IT GROWS</p>
      <h1 {...stylex.props(text.serif, styles.title)}>A few small parts</h1>
      <ul {...stylex.props(styles.list)}>
        {layers.map(([name, role]) => (
          <li key={name} {...stylex.props(styles.item)}>
            <strong {...stylex.props(styles.name)}>{name}</strong>
            <span>{role}</span>
          </li>
        ))}
      </ul>
      <h2 {...stylex.props(text.serif, styles.subtitle)}>Live from the API</h2>
      {children}
    </Card>
  )
}

const styles = stylex.create({
  card: {
    paddingBlock: { default: 40, [media.mobile]: 27 },
    paddingInline: { default: 44, [media.mobile]: 24 },
    maxWidth: 760,
  },
  title: {
    fontSize: { default: 48, [media.mobile]: 38 },
    letterSpacing: -1.5,
    lineHeight: 1.1,
    marginTop: 0,
    marginInline: 0,
    marginBottom: 24,
  },
  subtitle: { fontSize: 24, letterSpacing: -0.6, marginTop: 32, marginBottom: 0 },
  list: { listStyle: "none", padding: 0, margin: 0 },
  item: {
    display: "grid",
    gridTemplateColumns: { default: "140px 1fr", [media.mobile]: "1fr" },
    gap: 4,
    paddingBlock: 12,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "#eeebdc",
    fontSize: 14,
    color: "#7f8579",
  },
  name: { color: colors.ink, fontWeight: 600 },
})
