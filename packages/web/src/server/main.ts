import { createServer } from "node:http"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { ApiRoutes, Garden } from "@playground/server"
import { Config, Effect, Layer } from "effect"
import { HttpMiddleware, HttpRouter, HttpServerResponse } from "effect/http"
import { loadAssets } from "./assets.ts"
import { PageRoutes } from "./pages.tsx"

const assets = loadAssets()
const Pages = PageRoutes(assets.pages)

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

// Garden is provided once, so pages and the API share the same in-memory store.
const App = Layer.mergeAll(ApiRoutes, Pages, assets.routes, Compression, Revalidation).pipe(
  Layer.provide(Garden.layer),
)

HttpRouter.serve(App).pipe(
  Layer.provide(
    NodeHttpServer.layerConfig(createServer, {
      port: Config.Port("PORT").pipe(Config.withDefault(4321)),
      host: Config.String("HOST").pipe(Config.withDefault("127.0.0.1")),
    }),
  ),
  Layer.launch,
  NodeRuntime.runMain,
)
