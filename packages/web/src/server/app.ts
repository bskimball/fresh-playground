import {
  ApiRoutes,
  AppServices,
  AuthRoutes,
  FileRoutes,
  Garden,
  RateLimitMiddleware,
} from "@playground/server"
import { Effect, Layer } from "effect"
import { HttpMiddleware, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import type { Assets } from "./Page.ts"
import { PageRoutes } from "./pages.ts"
import { PerformanceRoutes } from "./Performance.ts"

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

/**
 * Every route and middleware, over one `AppServices` so pages, API handlers, and
 * readiness checks share service instances. `main.ts` serves it from the build;
 * `dev.ts` serves it inside `vp dev`.
 */
export const App = <E, R>(assets: {
  readonly pages: Assets
  readonly routes: Layer.Layer<never, E, R>
}) =>
  Layer.mergeAll(
    ApiRoutes,
    AuthRoutes,
    FileRoutes,
    PerformanceRoutes,
    PageRoutes(assets.pages),
    assets.routes,
    Health,
    RateLimitMiddleware,
    Compression,
    Revalidation,
    PrefetchInvalidation,
  ).pipe(Layer.provide(AppServices))
