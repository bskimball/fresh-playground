import { AppApi } from "@playground/contract"
import { Clock, Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Garden } from "./Garden.ts"

export { Garden } from "./Garden.ts"

const GardenHandlers = HttpApiBuilder.group(
  AppApi,
  "garden",
  Effect.fn(function* (handlers) {
    const garden = yield* Garden
    return handlers.handleAll({
      get: () => garden.get,
      water: () => garden.water,
      settings: ({ payload }) => garden.updateSettings(payload),
    })
  }),
)

const SystemHandlers = HttpApiBuilder.group(
  AppApi,
  "system",
  Effect.fn(function* (handlers) {
    return handlers.handleAll({
      hello: () =>
        Clock.currentTimeMillis.pipe(
          Effect.map((now) => ({ message: "Hello from Effect!", time: new Date(now) })),
        ),
    })
  }),
)

/**
 * Mounts `AppApi` on the `HttpRouter`. `Garden` is left for the app to
 * provide, so the API and server-rendered pages share one instance.
 */
export const ApiRoutes = HttpApiBuilder.layer(AppApi).pipe(
  Layer.provide([GardenHandlers, SystemHandlers]),
)
