import "vite/modulepreload-polyfill"
import { createElement } from "react"
import KanbanIsland, { kanbanIsland } from "../features/kanban/KanbanIsland.tsx"
import { bootIsland } from "./hydrateIsland.ts"

bootIsland(kanbanIsland, (board) => createElement(KanbanIsland, { board }))
