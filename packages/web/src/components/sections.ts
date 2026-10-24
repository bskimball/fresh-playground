import type { IconName } from "./Icon.tsx"

interface SectionInfo {
  readonly href: string
  readonly label: string
  readonly icon: IconName
  /** Who sees the section in the main navigation; omit to leave it out. */
  readonly nav?: "everyone" | "admins"
  /**
   * Served network-first with a cached fallback by the service worker.
   * Cached HTML outlives the session, so never set this on private pages.
   */
  readonly offline?: boolean
}

/** Every page section. Navigation, prefetching, and offline page caching derive from this. */
export const sections = {
  garden: { href: "/", label: "Garden", icon: "leaf", nav: "everyone", offline: true },
  kanban: { href: "/kanban", label: "Kanban", icon: "board", nav: "everyone", offline: true },
  journal: { href: "/journal", label: "Journal", icon: "book", nav: "everyone", offline: true },
  about: { href: "/about", label: "About", icon: "compass", nav: "everyone", offline: true },
  admin: { href: "/admin", label: "Admin", icon: "shield", nav: "admins" },
  login: { href: "/login", label: "Sign in", icon: "user" },
} as const satisfies Record<string, SectionInfo>

export type Section = keyof typeof sections

export interface SectionLink extends SectionInfo {
  readonly section: Section
}

const links: ReadonlyArray<SectionLink> = Object.entries(sections).map(([section, info]) => ({
  section: section as Section,
  ...info,
}))

export const publicLinks = links.filter((link) => link.nav === "everyone")

export const navLinks = (isAdmin: boolean) =>
  links.filter((link) => link.nav === "everyone" || (isAdmin && link.nav === "admins"))

export const offlinePaths = links.filter((link) => link.offline).map((link) => link.href)
