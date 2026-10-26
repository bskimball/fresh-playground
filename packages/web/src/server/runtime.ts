import { randomUUID } from "node:crypto"
import { Config, Effect, Exit, Layer, Option } from "effect"
import {
  FetchHttpClient,
  HttpEffect,
  HttpServerError,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/http"
import { Otlp, OtlpSerialization } from "effect/observability"

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

/**
 * Vite's HTML transform adds its client, React Refresh, and StyleX to the head, but
 * it also rewrites `%NAME%` placeholders wherever it looks. Only the document shell
 * goes through it; the rendered body, with page content and island props, is put
 * back afterward. Anchoring on `</head><body>` and `</body></html>` avoids matching
 * any substring inside head scripts, meta tags, or serialized island props.
 */
export const transformShell = async (
  vite: { readonly transformIndexHtml: (url: string, html: string) => Promise<string> },
  url: string,
  html: string,
) => {
  const openTag = "</head><body>"
  const closeTag = "</body></html>"
  const openIndex = html.indexOf(openTag)
  if (openIndex === -1 || !html.endsWith(closeTag)) return vite.transformIndexHtml(url, html)
  const start = openIndex + openTag.length
  const end = html.length - closeTag.length
  const shell = await vite.transformIndexHtml(url, html.slice(0, start) + html.slice(end))
  const at = shell.lastIndexOf("</body>")
  return at === -1 ? shell : shell.slice(0, at) + html.slice(start, end) + shell.slice(at)
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

/** `OTEL_EXPORTER_OTLP_HEADERS` format: `key=value` pairs, comma-separated, values URL-encoded. */
const otlpHeaders = (value: string) =>
  Object.fromEntries(
    value
      .split(",")
      .map((pair) => pair.split("="))
      .filter((parts): parts is [string, ...Array<string>] => parts.length >= 2 && parts[0] !== "")
      .map(([key, ...rest]) => [key.trim(), decodeURIComponent(rest.join("=").trim())]),
  )

/**
 * OTLP/HTTP JSON export of traces, metrics, and logs to
 * `OTEL_EXPORTER_OTLP_ENDPOINT`. Without it, or with `OTEL_SDK_DISABLED=true`,
 * nothing is exported.
 */
export const Telemetry = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* Config.all({
      disabled: Config.Boolean("OTEL_SDK_DISABLED").pipe(Config.withDefault(false)),
      endpoint: Config.NonEmptyString("OTEL_EXPORTER_OTLP_ENDPOINT").pipe(Config.option),
      headers: Config.String("OTEL_EXPORTER_OTLP_HEADERS").pipe(Config.withDefault("")),
      serviceName: Config.String("OTEL_SERVICE_NAME").pipe(Config.withDefault("fresh-playground")),
    })
    if (config.disabled || Option.isNone(config.endpoint)) return Layer.empty
    return Otlp.layer({
      baseUrl: config.endpoint.value,
      resource: { serviceName: config.serviceName },
      headers: otlpHeaders(config.headers),
    })
  }),
).pipe(Layer.provide([OtlpSerialization.layerJson, FetchHttpClient.layer]), Layer.orDie)

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
