import { createServer } from "node:http"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { ApiRoutes, Auth, AuthRoutes, Garden, Kanban, Mailer, Sqlite } from "@playground/server"
import { Effect, Layer, Logger, References } from "effect"
import { HttpMiddleware, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { loadAssets } from "./assets.ts"
import { PageRoutes } from "./pages.tsx"
import { PerformanceRoutes } from "./Performance.ts"
import { requestLogging, serverConfig } from "./runtime.ts"

// br/gzip for every response the client accepts it for.
const Compression = HttpRouter.middleware(HttpMiddleware.compression(), { global: true })

// Compression weakens a static file's ETag on the 200, but HttpStaticServer
// answers revalidation with the strong ETag and no Vary, which caches cannot
// match against the stored response. Weak validators compare loosely, so a
// weak 304 also matches uncompressed stored responses.
const Revalidation = HttpRouter.middleware(
  (app) =>
    Effect.map(app, (response) => {
      const etag = response.headers.etag
      if (response.status !== 304 || etag === undefined || etag.startsWith("W/")) return response
      return HttpServerResponse.setHeaders(response, { etag: `W/${etag}`, vary: "Accept-Encoding" })
    }),
  { global: true },
)

// Speculative HTML has its own cache; ordinary Cache-Control does not invalidate it.
const PrefetchInvalidation = HttpRouter.middleware(
  (app) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const response = yield* app
      if (
        request.url.split("?", 1)[0] !== "/api/performance" &&
        ["POST", "PUT", "PATCH", "DELETE"].includes(request.method) &&
        response.status >= 200 &&
        response.status < 300
      ) {
        return HttpServerResponse.setHeader(response, "clear-site-data", '"prefetchCache"')
      }
      return response
    }),
  { global: true },
)

const Health = HttpRouter.use(
  Effect.fn(function* (router) {
    const garden = yield* Garden
    yield* router.add(
      "GET",
      "/health/live",
      HttpServerResponse.jsonUnsafe(
        { status: "alive" },
        { headers: { "cache-control": "no-store" } },
      ),
    )
    yield* router.add(
      "GET",
      "/health/ready",
      Effect.as(
        garden.get,
        HttpServerResponse.jsonUnsafe(
          { status: "ready" },
          { headers: { "cache-control": "no-store" } },
        ),
      ),
    )
  }),
)

Effect.gen(function* () {
  const config = yield* serverConfig
  const logger = config.environment === "production" ? Logger.consoleJson : Logger.consolePretty()
  const server = Effect.gen(function* () {
    const assets = yield* Effect.sync(() =>
      loadAssets({ devReload: config.environment === "development" }),
    )
    // One instance of each service is shared by pages, API handlers, and readiness checks.
    const Services = Layer.mergeAll(
      Garden.layer,
      Kanban.layer,
      Auth.layer.pipe(Layer.provide(Mailer.log)),
    ).pipe(Layer.provide(Sqlite.layer))

    const App = Layer.mergeAll(
      ApiRoutes,
      AuthRoutes,
      PerformanceRoutes,
      PageRoutes(assets.pages),
      assets.routes,
      Health,
      Compression,
      Revalidation,
      PrefetchInvalidation,
    ).pipe(Layer.provide(Services))

    yield* HttpRouter.serve(App, { disableLogger: true, middleware: requestLogging }).pipe(
      Layer.provide(NodeHttpServer.layer(createServer, { port: config.port, host: config.host })),
      Layer.launch,
    )
  })
  yield* server.pipe(
    Effect.provide(Logger.layer([logger])),
    Effect.provideService(References.MinimumLogLevel, config.logLevel),
  )
}).pipe(NodeRuntime.runMain)
