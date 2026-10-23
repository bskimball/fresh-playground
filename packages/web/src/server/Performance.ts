import { ByteSize, Effect, Schema } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"

const PerformanceMetric = Schema.Struct({
  name: Schema.Literals(["LCP", "INP", "CLS"]),
  value: Schema.Number.check(Schema.isFinite(), Schema.isGreaterThanOrEqualTo(0)),
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
  rating: Schema.Literals(["good", "needs-improvement", "poor"]),
  route: Schema.String.check(Schema.isMaxLength(2048), Schema.isPattern(/^\/[^?#\r\n]*$/)),
})

/** Local structured logs only; deployment log collection supplies any field dataset. */
export const PerformanceRoutes = HttpRouter.use(
  Effect.fn(function* (router) {
    yield* router.add(
      "POST",
      "/api/performance",
      Effect.gen(function* () {
        const metric = yield* HttpServerRequest.schemaBodyJson(PerformanceMetric)
        yield* Effect.logInfo("Web vital").pipe(Effect.annotateLogs(metric))
        return HttpServerResponse.empty({ status: 204 })
      }).pipe(
        Effect.catch(() => Effect.succeed(HttpServerResponse.empty({ status: 400 }))),
        Effect.provideService(HttpServerRequest.MaxBodySize, ByteSize.fromInputUnsafe(4096)),
      ),
    )
  }),
)
