import { Card } from "@astryxdesign/core/Card"
import * as stylex from "@stylexjs/stylex"
import type { ReactNode } from "react"
import { Icon } from "./Icon.tsx"
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
      <header {...stylex.props(styles.header)}>
        <span {...stylex.props(styles.eyebrowPill)}>
          <Icon name="compass" size={12} />
          <span>HOW IT GROWS</span>
        </span>
        <h1 {...stylex.props(text.serif, styles.title)}>A few small parts, working in concert</h1>
        <p {...stylex.props(styles.lead, text.pretty)}>
          Pages stream from an Effect HTTP server with zero-bundle static markup by default,
          hydrating interactive islands only where state, animation, or live telemetry are needed.
        </p>
      </header>

      <ul {...stylex.props(styles.grid)}>
        {layers.map(([name, role], index) => (
          <li key={name} {...stylex.props(styles.specCard)}>
            <div {...stylex.props(styles.specHeader)}>
              <span {...stylex.props(styles.indexBadge, text.tabular)}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <strong {...stylex.props(styles.name)}>{name}</strong>
            </div>
            <p {...stylex.props(styles.role, text.pretty)}>{role}</p>
          </li>
        ))}
      </ul>

      <section {...stylex.props(styles.telemetrySection)}>
        <div {...stylex.props(styles.sectionHeader)}>
          <h2 {...stylex.props(text.serif, styles.subtitle)}>Live from the API</h2>
          <p {...stylex.props(styles.sectionLead, text.pretty)}>
            Hydrated on visibility through typed Effect atoms—inspecting the live server and garden
            state without hand-written fetch logic.
          </p>
        </div>
        {children}
      </section>
    </Card>
  )
}

const styles = stylex.create({
  card: {
    display: "grid",
    gap: 32,
    paddingBlock: { default: 42, [media.mobile]: 26 },
    paddingInline: { default: 44, [media.mobile]: 22 },
    maxWidth: 960,
    marginInline: "auto",
    borderRadius: 24,
  },
  header: {
    display: "grid",
    gap: 12,
    justifyItems: "start",
    maxWidth: 680,
  },
  eyebrowPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    paddingBlock: 5,
    paddingInline: 11,
    borderRadius: 999,
    backgroundColor: colors.surfaceTint,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.8,
    color: colors.mossDark,
  },
  title: {
    fontSize: { default: 48, [media.mobile]: 36 },
    letterSpacing: -1.5,
    lineHeight: 1.08,
    margin: 0,
  },
  lead: {
    fontSize: 15,
    lineHeight: 1.7,
    color: colors.muted,
    margin: 0,
  },
  grid: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(2, minmax(0, 1fr))",
      [media.mobile]: "1fr",
    },
    gap: 14,
  },
  specCard: {
    display: "grid",
    gap: 10,
    padding: 18,
    borderRadius: 16,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
  },
  specHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  indexBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    paddingBlock: 3,
    paddingInline: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    fontSize: 11,
    fontWeight: 700,
    color: colors.mossDark,
  },
  name: {
    fontSize: 15,
    color: colors.ink,
    fontWeight: 600,
  },
  role: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.65,
    color: colors.muted,
  },
  telemetrySection: {
    display: "grid",
    gap: 16,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.borderSubtle,
  },
  sectionHeader: {
    display: "grid",
    gap: 6,
  },
  subtitle: {
    fontSize: 26,
    letterSpacing: -0.6,
    margin: 0,
  },
  sectionLead: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.6,
    color: colors.muted,
  },
})
