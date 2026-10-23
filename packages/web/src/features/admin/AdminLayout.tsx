import * as stylex from "@stylexjs/stylex"
import type { ReactNode } from "react"
import { Icon } from "../../components/Icon.tsx"
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
      <nav aria-label="Admin" {...stylex.props(styles.navCard)}>
        <span {...stylex.props(styles.eyebrow)}>
          <Icon name="shield" size={12} />
          <span>STEWARDSHIP</span>
        </span>
        <div {...stylex.props(styles.navList)}>
          {panels.map((panel) => {
            const active = panel.id === current.id
            return (
              <a
                key={panel.id}
                href={`/admin/${panel.id}`}
                aria-current={active ? "page" : undefined}
                {...stylex.props(styles.link, active && styles.linkCurrent)}
              >
                <span>{panel.label}</span>
              </a>
            )
          })}
        </div>
      </nav>
      <section {...stylex.props(styles.content)}>
        <header {...stylex.props(styles.banner)}>
          <p {...stylex.props(text.eyebrow, styles.bannerEyebrow)}>CONSERVATORY STEWARDSHIP</p>
          <h1 {...stylex.props(text.serif, styles.title)}>{current.label}</h1>
          <p {...stylex.props(styles.description, text.pretty)}>{current.description}</p>
        </header>
        {children}
      </section>
    </div>
  )
}

const styles = stylex.create({
  layout: {
    display: "grid",
    gridTemplateColumns: { default: "220px 1fr", [media.mobile]: "1fr" },
    gap: { default: 32, [media.mobile]: 20 },
    alignItems: "start",
    marginBottom: 48,
  },
  navCard: {
    display: "grid",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
  },
  eyebrow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    paddingInline: 8,
    paddingTop: 2,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.8,
    color: colors.mossDark,
  },
  navList: {
    display: "flex",
    flexDirection: { default: "column", [media.mobile]: "row" },
    flexWrap: "wrap",
    gap: 4,
  },
  link: {
    fontSize: 13,
    fontWeight: 500,
    color: colors.muted,
    textDecoration: "none",
    paddingBlock: 9,
    paddingInline: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.surfaceTint,
    },
    transition:
      "background-color 0.15s ease-out, border-color 0.15s ease-out, color 0.15s ease-out, box-shadow 0.15s ease-out",
  },
  linkCurrent: {
    color: colors.ink,
    fontWeight: 600,
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderSubtle,
    boxShadow: colors.shadowSm,
  },
  content: {
    minWidth: 0,
    display: "grid",
    gap: 20,
  },
  banner: {
    display: "grid",
    gap: 6,
    paddingBlock: 20,
    paddingInline: 24,
    borderRadius: 18,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
  },
  bannerEyebrow: {
    marginBottom: 2,
  },
  title: {
    fontSize: { default: 36, [media.mobile]: 30 },
    letterSpacing: -1,
    lineHeight: 1.1,
    margin: 0,
  },
  description: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.6,
    color: colors.muted,
  },
})
