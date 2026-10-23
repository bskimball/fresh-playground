import * as stylex from "@stylexjs/stylex"
import type { ReactNode } from "react"
import { text } from "../../styles/text.ts"
import { colors, media } from "../../styles/tokens.stylex.ts"
import type { AdminPanel } from "./panels.ts"

/** Server-rendered admin chrome: panel navigation plus the current panel. */
export function AdminLayout({
  panels,
  current,
  children,
}: {
  panels: ReadonlyArray<AdminPanel>
  current: AdminPanel
  children: ReactNode
}) {
  return (
    <div {...stylex.props(styles.layout)}>
      <nav aria-label="Admin" {...stylex.props(styles.nav)}>
        <p {...stylex.props(text.eyebrow)}>ADMIN</p>
        {panels.map((panel) => (
          <a
            key={panel.id}
            href={`/admin/${panel.id}`}
            aria-current={panel.id === current.id ? "page" : undefined}
            {...stylex.props(styles.link, panel.id === current.id && styles.linkCurrent)}
          >
            {panel.label}
          </a>
        ))}
      </nav>
      <section {...stylex.props(styles.content)}>
        <h1 {...stylex.props(text.serif, styles.title)}>{current.label}</h1>
        <p {...stylex.props(styles.description)}>{current.description}</p>
        {children}
      </section>
    </div>
  )
}

const styles = stylex.create({
  layout: {
    display: "grid",
    gridTemplateColumns: { default: "180px 1fr", [media.mobile]: "1fr" },
    gap: { default: 40, [media.mobile]: 20 },
    alignItems: "start",
    marginBottom: 48,
  },
  nav: {
    display: "flex",
    flexDirection: { default: "column", [media.mobile]: "row" },
    flexWrap: "wrap",
    gap: 4,
  },
  link: {
    fontSize: 14,
    color: colors.muted,
    textDecoration: "none",
    paddingBlock: 8,
    paddingInline: 12,
    borderRadius: 8,
    backgroundColor: { default: "transparent", ":hover": colors.mist },
  },
  linkCurrent: { color: colors.ink, backgroundColor: colors.mist },
  content: { minWidth: 0 },
  title: { fontSize: 36, letterSpacing: -1, marginTop: 0, marginBottom: 6 },
  description: { marginTop: 0, marginBottom: 24, fontSize: 14, color: colors.muted },
})
