import { AppApi } from "@playground/contract"
import { Clock, Effect, type FileSystem, Layer, type Path } from "effect"
import type { Etag, HttpPlatform, HttpRouter } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"
import { AdminHandlers, AuthenticationLive } from "./Admin.ts"
import { Auth } from "./Auth.ts"
import { Garden, GardenHandlers } from "./Garden.ts"
import { Kanban, KanbanHandlers } from "./Kanban.ts"
import { Mailer } from "./Mailer.ts"
import { Sqlite } from "./Sqlite.ts"

export { Auth, AuthRoutes, webHeaders } from "./Auth.ts"
export { Garden, type GardenStore, moistureAt } from "./Garden.ts"
export { Kanban, seedCards } from "./Kanban.ts"
export { Mailer } from "./Mailer.ts"
export { Sqlite } from "./Sqlite.ts"

const SystemHandlers = HttpApiBuilder.group(AppApi, "system", (handlers) =>
  Effect.succeed(
    handlers.handleAll({
      hello: () =>
        Clock.currentTimeMillis.pipe(
          Effect.map((now) => ({ message: "Hello from Effect!", time: new Date(now) })),
        ),
    }),
  ),
)

/**
 * Every app service over one shared SQLite connection. Provide it once so
 * pages, API handlers, and health checks share the same instances.
 */
export const AppServices = Layer.mergeAll(
  Garden.layer,
  Kanban.layer,
  Auth.layer.pipe(Layer.provide(Mailer.layer)),
).pipe(Layer.provide(Sqlite.layer))

/**
 * What a route layer may still need once served: `AppServices`, the router, and the
 * platform services the HTTP server supplies. Annotating a route list with it reports
 * a forgotten service layer or handler group at that list, by name.
 */
export type AppRoutes = Layer.Layer<
  never,
  never,
  | Layer.Success<typeof AppServices>
  | HttpRouter.HttpRouter
  | HttpPlatform.HttpPlatform
  | Etag.Generator
  | FileSystem.FileSystem
  | Path.Path
>

/** Mounts `AppApi` on the `HttpRouter`. */
export const ApiRoutes: AppRoutes = HttpApiBuilder.layer(AppApi).pipe(
  Layer.provide([GardenHandlers, KanbanHandlers, AdminHandlers, SystemHandlers]),
  Layer.provide(AuthenticationLive),
)
