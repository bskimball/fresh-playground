import type { AppRoutes } from "@playground/server"
import { Effect, Layer } from "effect"
import { HttpRouter } from "effect/http"
import { createElement } from "react"
import { NotFound } from "../components/Shell.tsx"
import { AboutPages } from "../features/about/routes.tsx"
import { AdminPages } from "../features/admin/routes.tsx"
import { AuthPages } from "../features/auth/routes.tsx"
import { FilesPages } from "../features/files/routes.tsx"
import { KanbanPages } from "../features/kanban/routes.tsx"
import { GardenPages } from "../features/terrarium/routes.tsx"
import { type Assets, Page } from "./Page.ts"

const NotFoundPage = HttpRouter.use(
  Effect.fn(function* (router) {
    const page = yield* Page
    yield* router.add("GET", "*", (request) =>
      page.render(request, {
        title: "Page not found",
        description: "The requested page could not be found in Little world.",
        current: "garden",
        status: 404,
        children: createElement(NotFound),
      }),
    )
  }),
)

/** Every feature's pages. Each feature owns its routes in `features/<feature>/routes.tsx`. */
export const PageRoutes = (assets: Assets): AppRoutes =>
  Layer.mergeAll(
    GardenPages,
    KanbanPages,
    AboutPages,
    AuthPages,
    AdminPages,
    FilesPages,
    NotFoundPage,
  ).pipe(Layer.provide(Page.layer(assets)))
