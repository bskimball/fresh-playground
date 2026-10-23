import type { SessionUser } from "@playground/contract"
import * as stylex from "@stylexjs/stylex"
import type { ReactNode } from "react"
import { text } from "../styles/text.ts"
import { colors, fonts, media } from "../styles/tokens.stylex.ts"
import { Icon, type IconName } from "./Icon.tsx"
import { ThemeToggle } from "./ThemeToggle.tsx"

export type Section = "garden" | "kanban" | "journal" | "about" | "admin" | "login"

/** Who is signed in, and whether they may open `/admin`. */
export interface Viewer {
  readonly user: SessionUser
  readonly isAdmin: boolean
}

const links: ReadonlyArray<{ section: Section; href: string; label: string; icon: IconName }> = [
  { section: "garden", href: "/", label: "Garden", icon: "leaf" },
  { section: "kanban", href: "/kanban", label: "Kanban", icon: "board" },
  { section: "journal", href: "/journal", label: "Journal", icon: "book" },
  { section: "about", href: "/about", label: "About", icon: "compass" },
]

/** Server-rendered page chrome. It never hydrates. */
export function Shell({
  current,
  viewer,
  children,
}: {
  current: Section
  viewer?: Viewer | undefined
  children?: ReactNode
}) {
  const nav = viewer?.isAdmin
    ? [
        ...links,
        { section: "admin" as const, href: "/admin", label: "Admin", icon: "shield" as const },
      ]
    : links
  return (
    <>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headerInner)}>
          <a {...stylex.props(styles.brand)} href="/" aria-label="Little world home">
            <span {...stylex.props(styles.brandEmblem)}>
              <Icon name="leaf" size={20} />
            </span>
            <span {...stylex.props(styles.brandTextGroup)}>
              <span {...stylex.props(styles.wordmark)}>
                little world<span {...stylex.props(styles.brandDot)}>.</span>
              </span>
              <span {...stylex.props(styles.brandMeta)}>CONSERVATORY · NO. 01</span>
            </span>
          </a>

          <nav aria-label="Main" data-main-nav {...stylex.props(styles.nav)}>
            {nav.map((link) => {
              const isCurrent = link.section === current
              return (
                <a
                  key={link.section}
                  href={link.href}
                  data-nav-link={link.section}
                  aria-current={isCurrent ? "page" : undefined}
                  {...stylex.props(styles.navLink, isCurrent && styles.navLinkCurrent)}
                >
                  {isCurrent && (
                    <span
                      data-nav-pill
                      aria-hidden="true"
                      {...stylex.props(styles.navActivePill)}
                    />
                  )}
                  <span data-nav-item={link.section} {...stylex.props(styles.navItemContent)}>
                    <span {...stylex.props(styles.navIcon, isCurrent && styles.navIconCurrent)}>
                      <Icon name={link.icon} size={15} />
                    </span>
                    <span>{link.label}</span>
                  </span>
                </a>
              )
            })}
          </nav>

          <div {...stylex.props(styles.utilityCluster)}>
            <div data-island="theme-toggle" {...stylex.props(styles.themeSlot)}>
              <ThemeToggle />
            </div>
            <span {...stylex.props(styles.utilityDivider)} aria-hidden="true" />
            {viewer ? (
              <form method="post" action="/logout" {...stylex.props(styles.accountForm)}>
                <span {...stylex.props(styles.accountBadge)}>
                  <span {...stylex.props(styles.accountDot)} aria-hidden="true" />
                  <span {...stylex.props(styles.accountName)}>{viewer.user.name}</span>
                </span>
                <button type="submit" {...stylex.props(styles.signOutButton)}>
                  Sign out
                </button>
              </form>
            ) : (
              <a
                href="/login"
                aria-current={current === "login" ? "page" : undefined}
                {...stylex.props(
                  styles.signInLink,
                  current === "login" && styles.signInLinkCurrent,
                )}
              >
                <Icon name="user" size={15} />
                <span>Sign in</span>
              </a>
            )}
          </div>
        </div>
      </header>
      <main {...stylex.props(styles.main)}>
        {children}
        <footer {...stylex.props(styles.footer)}>
          <div {...stylex.props(styles.footerBrand)}>
            <span {...stylex.props(styles.footerLead)}>Less scrolling. More growing.</span>
            <span {...stylex.props(styles.footerNote)}>
              A quiet botanical workspace &amp; miniature ecosystem.
            </span>
          </div>
          <div {...stylex.props(styles.footerRight)}>
            <nav aria-label="Footer" {...stylex.props(styles.footerNav)}>
              {links.map((link) => (
                <a key={link.section} href={link.href} {...stylex.props(styles.footerLink)}>
                  {link.label}
                </a>
              ))}
            </nav>
            <span {...stylex.props(text.tabular, styles.footerEdition)}>SPECIMEN EDITION 01</span>
          </div>
        </footer>
      </main>
    </>
  )
}

const styles = stylex.create({
  header: {
    position: "sticky",
    top: 0,
    zIndex: 20,
    backgroundColor: colors.paper,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.borderSubtle,
  },
  headerInner: {
    minHeight: 78,
    paddingBlock: { default: 12, [media.mobile]: 12 },
    flexWrap: { default: "nowrap", [media.mobile]: "wrap" },
    maxWidth: 1360,
    marginInline: "auto",
    paddingInline: { default: 40, [media.tablet]: 25, [media.mobile]: 20 },
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: { default: 20, [media.tablet]: 12, [media.mobile]: 10 },
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    textDecoration: "none",
    color: colors.ink,
    flexShrink: 0,
  },
  brandEmblem: {
    display: "grid",
    placeItems: "center",
    width: 40,
    height: 40,
    backgroundColor: colors.surfaceTint,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    borderRadius: 12,
    color: colors.mossDark,
    boxShadow: colors.shadowSm,
    transitionProperty: "transform, background-color, border-color",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease-out",
  },
  brandTextGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  wordmark: {
    fontFamily: fonts.serif,
    fontSize: { default: 24, [media.mobile]: 22 },
    fontWeight: 600,
    letterSpacing: -0.7,
    lineHeight: 1.05,
    color: colors.ink,
  },
  brandDot: {
    color: colors.mossDark,
    marginLeft: 1,
  },
  brandMeta: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 1.6,
    color: colors.sage,
    display: { default: "block", [media.tablet]: "none" },
  },
  nav: {
    display: "flex",
    alignItems: "center",
    order: { default: 0, [media.mobile]: 1 },
    width: { default: "auto", [media.mobile]: "100%" },
    justifyContent: "center",
    gap: { default: 4, [media.mobile]: 2 },
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    borderRadius: 999,
    paddingBlock: 4,
    paddingInline: 5,
  },
  navLink: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
    fontSize: { default: 13, [media.mobile]: 12 },
    fontWeight: 600,
    color: { default: colors.muted, ":hover": colors.ink },
    textDecoration: "none",
    paddingBlock: 6,
    paddingInline: { default: 14, [media.tablet]: 11, [media.mobile]: 9 },
    borderRadius: 999,
    flexGrow: { default: 0, [media.mobile]: 1 },
    backgroundColor: { default: "transparent", ":hover": colors.surfaceTint },
    transform: { default: "none", ":active": "scale(0.96)" },
    transitionProperty: "background-color, color, transform",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease-out",
  },
  navLinkCurrent: {
    color: colors.ink,
    backgroundColor: { default: "transparent", ":hover": "transparent" },
  },
  navActivePill: {
    position: "absolute",
    inset: 0,
    borderRadius: 999,
    backgroundColor: colors.surfaceElevated,
    boxShadow: colors.shadowSm,
    pointerEvents: "none",
    zIndex: 0,
  },
  navItemContent: {
    position: "relative",
    zIndex: 1,
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
  },
  navIcon: {
    display: "inline-flex",
    alignItems: "center",
    color: colors.sage,
  },
  navIconCurrent: {
    color: colors.mossDark,
  },
  utilityCluster: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  themeSlot: {
    display: "flex",
    alignItems: "center",
  },
  utilityDivider: {
    width: 1,
    height: 22,
    backgroundColor: colors.borderSubtle,
  },
  accountForm: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBlock: 0,
    marginInline: 0,
  },
  accountBadge: {
    display: { default: "inline-flex", [media.mobile]: "none" },
    alignItems: "center",
    gap: 7,
    paddingBlock: 6,
    paddingInline: 12,
    borderRadius: 999,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
  },
  accountDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    backgroundColor: colors.mossDark,
  },
  accountName: {
    fontSize: 12,
    fontWeight: 600,
    color: colors.ink,
  },
  signOutButton: {
    minHeight: 36,
    paddingBlock: 6,
    paddingInline: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: { default: colors.borderSubtle, ":hover": colors.borderStrong },
    backgroundColor: { default: colors.surfaceElevated, ":hover": colors.surfaceSubtle },
    color: { default: colors.muted, ":hover": colors.ink },
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    transform: { default: "none", ":active": "scale(0.96)" },
    transitionProperty: "background-color, border-color, color, transform",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease-out",
  },
  signInLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    minHeight: 38,
    paddingBlock: 6,
    paddingInline: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: { default: colors.borderSubtle, ":hover": colors.borderStrong },
    backgroundColor: { default: colors.surfaceElevated, ":hover": colors.surfaceTint },
    boxShadow: colors.shadowSm,
    color: colors.ink,
    fontSize: 13,
    fontWeight: 500,
    textDecoration: "none",
    transform: { default: "none", ":active": "scale(0.96)" },
    transitionProperty: "background-color, border-color, color, transform, box-shadow",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease-out",
  },
  signInLinkCurrent: {
    backgroundColor: colors.surfaceTint,
    borderColor: colors.moss,
    fontWeight: 600,
  },
  main: {
    maxWidth: 1360,
    marginInline: "auto",
    paddingTop: { default: 44, [media.wide]: 54, [media.tablet]: 34, [media.mobile]: 28 },
    paddingInline: { default: 40, [media.tablet]: 25, [media.mobile]: 20 },
  },
  footer: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 20,
    marginTop: { default: 56, [media.mobile]: 40 },
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.borderSubtle,
    color: colors.muted,
    fontSize: 12,
    paddingTop: 28,
    paddingBottom: 36,
  },
  footerBrand: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  footerLead: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: 15,
    color: colors.ink,
  },
  footerNote: {
    fontSize: 12,
    color: colors.muted,
  },
  footerRight: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: { default: 20, [media.mobile]: 12 },
  },
  footerNav: {
    display: "flex",
    alignItems: "center",
    gap: 14,
  },
  footerLink: {
    fontSize: 12,
    color: { default: colors.muted, ":hover": colors.ink },
    textDecoration: "none",
    transitionProperty: "color",
    transitionDuration: "150ms",
  },
  footerEdition: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.5,
    color: colors.sage,
    paddingBlock: 4,
    paddingInline: 8,
    borderRadius: 6,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
  },
})
