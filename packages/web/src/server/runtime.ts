import { randomUUID } from "node:crypto"
import { Config, Effect, Exit } from "effect"
import { HttpEffect, HttpServerError, HttpServerRequest, HttpServerResponse } from "effect/http"

const localOrigin = "http://local.invalid"

/**
 * Only same-origin paths are followed after sign-in. Parsing the way a browser
 * does catches `/\evil`, `/%09/evil` and similar tricks that become `//evil`.
 * The normalized path is checked too: `/..//evil` keeps the origin but
 * normalizes to `//evil`, which the browser then reads as another host.
 */
export const safeNext = (value: string | null) => {
  if (value === null || !value.startsWith("/")) return "/"
  const url = URL.parse(value, localOrigin)
  if (url?.origin !== localOrigin || url.pathname.startsWith("//")) return "/"
  return `${url.pathname}${url.search}${url.hash}`
}

export const serverConfig = Config.all({
  environment: Config.Literals(["development", "test", "production"], "NODE_ENV").pipe(
    Config.withDefault("development"),
  ),
  host: Config.NonEmptyString("HOST").pipe(Config.withDefault("127.0.0.1")),
  port: Config.Port("PORT").pipe(Config.withDefault(4321)),
  logLevel: Config.Literals(
    ["Trace", "Debug", "Info", "Warn", "Error", "Fatal", "None"],
    "LOG_LEVEL",
  ).pipe(Config.withDefault("Info")),
})

export const requestLogging = <E, R>(
  app: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    E,
    R | HttpServerRequest.HttpServerRequest
  >,
) =>
  Effect.gen(function* () {
    const requestId = randomUUID()
    const request = yield* HttpServerRequest.HttpServerRequest
    // This hook also runs for responses produced by Effect's HTTP error boundary.
    yield* HttpEffect.appendPreResponseHandler((_request, response) => {
      const safeResponse =
        response.status >= 500
          ? HttpServerResponse.jsonUnsafe(
              { error: "Internal server error", requestId },
              { status: response.status, headers: { "cache-control": "no-store" } },
            )
          : response
      return Effect.succeed(HttpServerResponse.setHeader(safeResponse, "x-request-id", requestId))
    })
    return yield* app.pipe(
      Effect.onExit((exit) => {
        const status = Exit.isSuccess(exit)
          ? exit.value.status
          : HttpServerError.causeResponseStripped(exit.cause)[0].status
        const log = status >= 500 ? Effect.logError : Effect.logInfo
        // Raw HTTP causes can contain request URLs, headers, and payloads.
        return log("HTTP response").pipe(Effect.annotateLogs({ "http.status": status }))
      }),
      Effect.withLogSpan("http.span"),
      Effect.annotateLogs({
        requestId,
        "http.method": request.method,
        "http.url": request.url.split(/[?#]/, 1)[0],
      }),
    )
  })
