import * as stylex from "@stylexjs/stylex"
import type { ReactNode } from "react"
import { colors, fonts, media } from "../styles/tokens.stylex.ts"
import { Icon } from "./Icon.tsx"

export type Section = "garden" | "journal" | "about"

const links: ReadonlyArray<{ section: Section; href: string; label: string }> = [
  { section: "garden", href: "/", label: "Garden" },
  { section: "journal", href: "/journal", label: "Journal" },
  { section: "about", href: "/about", label: "About" },
]

/** Server-rendered page chrome. It never hydrates. */
export function Shell({ current, children }: { current: Section; children?: ReactNode }) {
  return (
    <>
      <header {...stylex.props(styles.header)}>
        <a {...stylex.props(styles.wordmark)} href="/" aria-label="Little world home">
          <span {...stylex.props(styles.brandIcon)}>
            <Icon name="leaf" />
          </span>
          little world<span {...stylex.props(styles.brandDot)}>.</span>
        </a>
        <nav aria-label="Main" {...stylex.props(styles.nav)}>
          {links.map((link) => (
            <a
              key={link.section}
              href={link.href}
              aria-current={link.section === current ? "page" : undefined}
              {...stylex.props(styles.navLink, link.section === current && styles.navLinkCurrent)}
            >
              {link.label}
            </a>
          ))}
        </nav>
        <span {...stylex.props(styles.tag)}>
          PLAYGROUND <span {...stylex.props(styles.tagNumber)}>01</span>
        </span>
      </header>
      <main {...stylex.props(styles.main)}>
        {children}
        <footer {...stylex.props(styles.footer)}>
          <span {...stylex.props(styles.footerLead)}>Less scrolling. More growing.</span>
          <span {...stylex.props(styles.footerNote)}>A tiny garden with room to imagine.</span>
        </footer>
      </main>
    </>
  )
}

const styles = stylex.create({
  header: {
    height: { default: 96, [media.mobile]: 76 },
    maxWidth: 1440,
    marginInline: "auto",
    paddingInline: { default: "6%", [media.mobile]: 23 },
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.line,
  },
  wordmark: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    textDecoration: "none",
    fontFamily: fonts.serif,
    fontSize: { default: 28, [media.mobile]: 24 },
    fontWeight: 600,
    letterSpacing: -1,
  },
  brandIcon: {
    display: "grid",
    placeItems: "center",
    width: 37,
    height: 37,
    backgroundColor: colors.mist,
    borderRadius: "50%",
  },
  brandDot: {
    color: "#9aa876",
    marginLeft: -10,
  },
  nav: {
    display: "flex",
    gap: { default: 6, [media.mobile]: 2 },
  },
  navLink: {
    fontSize: 13,
    color: colors.muted,
    textDecoration: "none",
    paddingBlock: 6,
    paddingInline: { default: 12, [media.mobile]: 8 },
    borderRadius: 999,
    backgroundColor: { default: "transparent", ":hover": colors.mist },
  },
  navLinkCurrent: {
    color: colors.ink,
    backgroundColor: colors.mist,
  },
  tag: {
    fontSize: { default: 10, [media.mobile]: 8 },
    letterSpacing: 1.5,
    color: "#76816e",
    display: { default: "inline", [media.mobile]: "none" },
  },
  tagNumber: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#d2d6c8",
    paddingBlock: 4,
    paddingInline: 7,
    borderRadius: 5,
    marginLeft: 8,
  },
  main: {
    maxWidth: 1280,
    marginInline: "auto",
    paddingTop: { default: 51, [media.wide]: 62, [media.tablet]: 36, [media.mobile]: 32 },
    paddingInline: { default: 40, [media.tablet]: 25, [media.mobile]: 20 },
  },
  footer: {
    display: "flex",
    justifyContent: "space-between",
    gap: 20,
    color: "#9b9f91",
    fontSize: { default: 10, [media.mobile]: 9 },
    paddingTop: 25,
    paddingInline: 3,
    paddingBottom: 30,
  },
  footerLead: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: 13,
  },
  footerNote: {
    textAlign: { default: "left", [media.mobile]: "right" },
    maxWidth: { default: "none", [media.mobile]: 125 },
  },
})
