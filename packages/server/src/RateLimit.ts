import { isIPv4, isIPv6 } from "node:net"
import { EVENTS_PATH } from "@playground/contract"
import { Config, Duration, Effect, Layer, Option } from "effect"
import { FindMyWay, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { RateLimiter } from "effect/persistence"

/** Requests per client per minute. Better Auth limits `/api/auth/*` itself. */
export const rateLimits = {
  events: 30,
  write: 120,
  read: 600,
} as const

export type RateLimitRule = keyof typeof rateLimits

/**
 * Classified by the same router `HttpRouter` uses, with its defaults, so every
 * alias it would route to an API handler (case, slashes, encoding, `;`, absolute
 * form) lands in the same bucket.
 */
const classifier = FindMyWay.make<RateLimitRule | "exempt">()
classifier.all("/api/auth/*", "exempt")
classifier.on("GET", EVENTS_PATH, "events")
classifier.on(["GET", "HEAD"], "/api/*", "read")
classifier.on(["POST", "PUT", "PATCH", "DELETE"], "/api/*", "write")

export const rateLimitRule = (method: string, url: string): RateLimitRule | undefined => {
  const rule = classifier.find(method, url)?.handler
  return rule === "exempt" ? undefined : rule
}

const expandIPv6 = (address: string) => {
  const [head = "", tail] = address.split("::")
  const left = head === "" ? [] : head.split(":")
  const right = tail === undefined || tail === "" ? [] : tail.split(":")
  const fill = Array.from({ length: 8 - left.length - right.length }, () => "0")
  return [...left, ...(tail === undefined ? [] : fill), ...right]
}

/** IPv6 clients usually control a whole /64, so the prefix is the key. */
export const clientKey = (address: string) => {
  const bare = address.split("%", 1)[0]!.toLowerCase()
  const mapped = bare.startsWith("::ffff:") ? bare.slice("::ffff:".length) : bare
  if (isIPv4(mapped)) return mapped
  if (!isIPv6(bare)) return "unknown"
  return `${expandIPv6(bare)
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`
}

/**
 * The client address: the socket peer, or with `TRUST_PROXY=true` the address
 * the one trusted reverse proxy appended to `X-Forwarded-For`.
 */
export const clientAddress = (
  request: HttpServerRequest.HttpServerRequest,
  trustProxy: boolean,
) => {
  const forwarded = request.headers["x-forwarded-for"]
  if (trustProxy && forwarded !== undefined) {
    const last = forwarded.split(",").pop()?.trim()
    if (last) return last
  }
  return Option.getOrElse(request.remoteAddress, () => "unknown")
}

export const trustProxyConfig = Config.Boolean("TRUST_PROXY").pipe(
  Config.withDefault(false),
  Effect.orDie,
)

/** Process-local fixed windows. Counts reset on restart, matching the single-process model. */
export const RateLimits = RateLimiter.layer.pipe(Layer.provide(RateLimiter.layerStoreMemory))

/** Answers over-limit `/api/*` requests with 429 and `Retry-After`. */
export const RateLimitMiddleware = HttpRouter.middleware(
  Effect.gen(function* () {
    const limiter = yield* RateLimiter.RateLimiter
    const trustProxy = yield* trustProxyConfig
    return (app) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const rule = rateLimitRule(request.method, request.url)
        if (rule === undefined) return yield* app
        const retryAfter = yield* limiter
          .consume({
            algorithm: "fixed-window",
            onExceeded: "fail",
            window: "1 minute",
            limit: rateLimits[rule],
            key: `${rule}:${clientKey(clientAddress(request, trustProxy))}`,
          })
          .pipe(
            Effect.as(Option.none<Duration.Duration>()),
            Effect.catch((error) =>
              error.reason._tag === "RateLimitExceeded"
                ? Effect.succeed(Option.some(error.reason.retryAfter))
                : Effect.logWarning("Rate limiter unavailable; allowing request").pipe(
                    Effect.as(Option.none<Duration.Duration>()),
                  ),
            ),
          )
        if (Option.isNone(retryAfter)) return yield* app
        return HttpServerResponse.jsonUnsafe(
          { error: "Too many requests" },
          {
            status: 429,
            headers: {
              "cache-control": "no-store",
              "retry-after": String(Math.max(1, Math.ceil(Duration.toSeconds(retryAfter.value)))),
            },
          },
        )
      })
  }),
  { global: true },
)
