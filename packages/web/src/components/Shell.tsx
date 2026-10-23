import type { SessionUser } from "@playground/contract"
import * as stylex from "@stylexjs/stylex"
import type { ReactNode } from "react"
import { colors, fonts, media } from "../styles/tokens.stylex.ts"
import { Icon } from "./Icon.tsx"

export type Section = "garden" | "journal" | "about" | "admin" | "login"

/** Who is signed in, and whether they may open `/admin`. */
export interface Viewer {
  readonly user: SessionUser
  readonly isAdmin: boolean
}

const links: ReadonlyArray<{ section: Section; href: string; label: string }> = [
  { section: "garden", href: "/", label: "Garden" },
  { section: "journal", href: "/journal", label: "Journal" },
  { section: "about", href: "/about", label: "About" },
]

/** Server-rendered page chrome. It never hydrates. */
export function Shell({
  current,
  themeToggle,
  viewer,
  children,
}: {
  current: Section
  themeToggle: string
  viewer?: Viewer | undefined
  children?: ReactNode
}) {
  const nav = viewer?.isAdmin
    ? [...links, { section: "admin" as const, href: "/admin", label: "Admin" }]
    : links
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
          {nav.map((link) => (
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
        <div {...stylex.props(styles.account)}>
          <div data-island="theme-toggle" dangerouslySetInnerHTML={{ __html: themeToggle }} />
          {viewer ? (
            <form method="post" action="/logout" {...stylex.props(styles.account)}>
              <span {...stylex.props(styles.accountName)}>{viewer.user.name}</span>
              <button type="submit" {...stylex.props(styles.navLink, styles.accountButton)}>
                Sign out
              </button>
            </form>
          ) : (
            <a
              href="/login"
              aria-current={current === "login" ? "page" : undefined}
              {...stylex.props(styles.navLink, current === "login" && styles.navLinkCurrent)}
            >
              Sign in
            </a>
          )}
          <span {...stylex.props(styles.tag)}>
            PLAYGROUND <span {...stylex.props(styles.tagNumber)}>01</span>
          </span>
        </div>
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
    height: { default: 96, [media.mobile]: "auto" },
    minHeight: 76,
    paddingBlock: { default: 0, [media.mobile]: 12 },
    flexWrap: { default: "nowrap", [media.mobile]: "wrap" },
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
    color: "light-dark(#9aa876, #b8ca9a)",
    marginLeft: -10,
  },
  nav: {
    display: "flex",
    order: { default: 0, [media.mobile]: 1 },
    width: { default: "auto", [media.mobile]: "100%" },
    justifyContent: "center",
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
    color: "light-dark(#76816e, #b9c1ae)",
    display: { default: "inline", [media.mobile]: "none" },
  },
  tagNumber: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "light-dark(#d2d6c8, #454e3d)",
    paddingBlock: 4,
    paddingInline: 7,
    borderRadius: 5,
    marginLeft: 8,
  },
  account: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    margin: 0,
  },
  accountName: {
    fontSize: 13,
    color: colors.ink,
    display: { default: "inline", [media.mobile]: "none" },
  },
  accountButton: {
    borderWidth: 0,
    font: "inherit",
    fontSize: 13,
    cursor: "pointer",
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
    color: "light-dark(#9b9f91, #b9c1ae)",
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
