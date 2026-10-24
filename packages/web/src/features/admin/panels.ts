import { can, type Permissions, type SessionUser } from "@playground/contract"
import { type ComponentType, createElement } from "react"
import { defineIsland } from "../../client/hydrateIsland.ts"
import type { AdminPanelProps } from "./AdminPanelProps.ts"
import GardenPanel from "./GardenPanel.tsx"
import UsersPanel from "./UsersPanel.tsx"

export interface AdminIslandProps {
  readonly panel: string
  readonly user: SessionUser
}

/**
 * One entry per admin page at `/admin/<id>`. A panel is listed and served only
 * to roles that hold its permissions; its API endpoints check them again.
 */
export interface AdminPanel {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly permissions: Permissions
  readonly Island: ComponentType<AdminPanelProps>
}

export const adminPanels: ReadonlyArray<AdminPanel> = [
  {
    id: "users",
    label: "Users",
    description: "Accounts, roles, bans, and sessions.",
    permissions: { user: ["list"] },
    Island: UsersPanel,
  },
  {
    id: "garden",
    label: "Garden",
    description: "The shared demo garden.",
    permissions: { garden: ["reset"] },
    Island: GardenPanel,
  },
]

export const panelsFor = (role: string) =>
  adminPanels.filter((panel) => can(role, panel.permissions))

function AdminPanelContainer({ panel, user }: AdminIslandProps) {
  const current = adminPanels.find((candidate) => candidate.id === panel)
  return current ? createElement(current.Island, { user }) : null
}

export const adminPanelIsland = defineIsland("admin-panel", AdminPanelContainer)
