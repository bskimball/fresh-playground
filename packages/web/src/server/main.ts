import { createServer } from "node:http"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { ApiRoutes, Garden } from "@playground/server"
import { Effect, Layer, Logger, References } from "effect"
import { HttpMiddleware, HttpRouter, HttpServerResponse } from "effect/http"
import { loadAssets } from "./assets.ts"
import { PageRoutes } from "./pages.tsx"
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
    const assets = yield* Effect.sync(loadAssets)
    // One service instance is shared by pages, API handlers, and readiness checks.
    const App = Layer.mergeAll(
      ApiRoutes,
      PageRoutes(assets.pages),
      assets.routes,
      Health,
      Compression,
      Revalidation,
    ).pipe(Layer.provide(Garden.layer))

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
