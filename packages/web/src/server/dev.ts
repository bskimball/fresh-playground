import { NodeHttpServer } from "@effect/platform-node"
import { Effect, Exit, Logger, References, Scope } from "effect"
import { HttpRouter } from "effect/http"
import type { ViteDevServer } from "vite-plus"
import { App } from "./app.ts"
import { pwaRoutes } from "./Pwa.ts"
import { requestLogging, serverConfig, transformShell } from "./runtime.ts"

/**
 * Starts the app for `vp dev`, loaded through Vite's SSR module runner by
 * `devServer.ts`. Vite serves source modules and CSS, so pages link them directly.
 * No service worker is served in development.
 */
export const start = (vite: ViteDevServer) =>
  Effect.gen(function* () {
    const config = yield* serverConfig
    const scope = yield* Scope.make()
    const app = App({
      pages: {
        css: "/src/styles/global.css",
        fonts: [],
        performance: "/src/client/performance.ts",
        preloadsFor: () => [],
        transformHtml: (url, html) => transformShell(vite, url, html),
      },
      routes: pwaRoutes(),
    })
    const handler = yield* HttpRouter.toHttpEffect(app).pipe(
      Effect.flatMap((http) =>
        NodeHttpServer.makeHandler(http, { scope, middleware: requestLogging }),
      ),
      Effect.provide(NodeHttpServer.layerHttpServices),
      Effect.provideService(Scope.Scope, scope),
      Effect.onError(() => Scope.close(scope, Exit.void)),
      Effect.provide(Logger.layer([Logger.consolePretty()])),
      Effect.provideService(References.MinimumLogLevel, config.logLevel),
    )
    return { handler, close: () => Effect.runPromise(Scope.close(scope, Exit.void)) }
  }).pipe(Effect.runPromise)
