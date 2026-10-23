import "vite/modulepreload-polyfill"
import { createElement } from "react"
import { adminPanelIsland, adminPanels } from "../features/admin/panels.ts"
import { bootIsland } from "./hydrateIsland.ts"

bootIsland(adminPanelIsland, ({ panel, user }) => {
  const current = adminPanels.find((candidate) => candidate.id === panel)
  return current ? createElement(current.Island, { user }) : null
})
