import { AppApi } from "@playground/contract"
import { Clock, Effect, type FileSystem, Layer, type Path } from "effect"
import type { Etag, HttpPlatform, HttpRouter } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"
import { AdminHandlers, AuthenticationLive } from "./Admin.ts"
import { Auth } from "./Auth.ts"
import { Garden, GardenHandlers } from "./Garden.ts"
import { Kanban, KanbanHandlers } from "./Kanban.ts"
import { Mailer } from "./Mailer.ts"
import { DatabasePath, Sqlite } from "./Sqlite.ts"
import { Events, EventsHandlers } from "./Events.ts"
import { Files, FilesHandlers } from "./Files.ts"
import { Jobs } from "./Jobs.ts"
import { MailQueue } from "./MailQueue.ts"
import { RateLimits } from "./RateLimit.ts"
import { Storage } from "./Storage.ts"

export { Auth, AuthRoutes, webHeaders } from "./Auth.ts"
export { Garden, type GardenStore, moistureAt } from "./Garden.ts"
export { Kanban, seedCards } from "./Kanban.ts"
export { Mailer } from "./Mailer.ts"
export { Sqlite, DatabasePath } from "./Sqlite.ts"
export { Events } from "./Events.ts"
export { Jobs, JobsSql, JobsStore, PersistedQueue, runWorker } from "./Jobs.ts"
export { MailQueue, MailJob } from "./MailQueue.ts"
export { Files, FileRoutes } from "./Files.ts"
export { Storage, StorageError } from "./Storage.ts"
export { RateLimitMiddleware, RateLimits, rateLimits } from "./RateLimit.ts"

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
 * One app scope: domain/auth share raw SQLite; native jobs use a second
 * connection to the same resolved file. Provide once so routes share instances.
 * Queue offers are not atomic with raw domain/auth writes.
 */
export const AppServices = Layer.mergeAll(
  Events.layer,
  Garden.layer,
  Kanban.layer,
  Files.layer.pipe(Layer.provide(Storage.layer)),
  RateLimits,
  Auth.layer.pipe(Layer.provide(MailQueue.layer), Layer.provide(Mailer.layer)),
).pipe(
  Layer.provide(Jobs),
  Layer.provide(Sqlite.configured),
  Layer.provide(DatabasePath.layer),
  Layer.orDie,
)

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
  Layer.provide([
    GardenHandlers,
    KanbanHandlers,
    AdminHandlers,
    SystemHandlers,
    EventsHandlers,
    FilesHandlers,
  ]),
  Layer.provide(AuthenticationLive),
)
