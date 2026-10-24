import type { AppRoutes } from "@playground/server"
import { Layer } from "effect"
import { AboutPages } from "../features/about/routes.tsx"
import { AdminPages } from "../features/admin/routes.tsx"
import { AuthPages } from "../features/auth/routes.tsx"
import { KanbanPages } from "../features/kanban/routes.tsx"
import { GardenPages } from "../features/terrarium/routes.tsx"
import { type Assets, Page } from "./Page.ts"

/** Every feature's pages. Each feature owns its routes in `features/<feature>/routes.tsx`. */
export const PageRoutes = (assets: Assets): AppRoutes =>
  Layer.mergeAll(GardenPages, KanbanPages, AboutPages, AuthPages, AdminPages).pipe(
    Layer.provide(Page.layer(assets)),
  )
