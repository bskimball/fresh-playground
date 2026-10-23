import "vite/modulepreload-polyfill"
import type { SessionUser } from "@playground/contract"
import { createElement } from "react"
import { adminPanels } from "../features/admin/panels.ts"
import { hydrateIsland } from "./hydrateIsland.ts"

const root = document.querySelector<HTMLElement>("[data-island=admin-panel]")
if (root) {
  const { panel, user }: { panel: string; user: SessionUser } = JSON.parse(
    root.dataset.props ?? "null",
  )
  const current = adminPanels.find((candidate) => candidate.id === panel)
  if (current) hydrateIsland(root, createElement(current.Island, { user }))
}
