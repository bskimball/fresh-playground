import { AppApi } from "@playground/contract"
import { Effect, Layer, ManagedRuntime, Schedule } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http"
import { HttpApiClient } from "effect/http-api"
import { AsyncResult, type Atom, AtomHttpApi } from "effect/reactivity"
import { acknowledgeRealtimeRead, realtimeReadPolicy, realtimeTopicForPath } from "./Realtime.ts"

// Islands also render once on the server, where no request is made, so the
// origin is only needed in the browser.
const baseUrl = globalThis.location?.origin

const transformClient = (client: HttpClient.HttpClient) => {
  const reads = client.pipe(
    HttpClient.retryTransient({ schedule: Schedule.exponential(200), times: 2 }),
  )
  return client.pipe(
    HttpClient.transform((response, request) => {
      if (typeof window === "undefined") return Effect.never
      if (request.method !== "GET" && request.method !== "HEAD") return response
      const topic = realtimeTopicForPath(
        new URL(request.url, baseUrl ?? "http://localhost").pathname,
      )
      const policy = topic === undefined ? undefined : realtimeReadPolicy(topic)
      if (!policy?.networkOnly) return reads.execute(request)
      // The SW may serve ordinary offline reads from snapshots, but a realtime
      // resync must not be acknowledged by such a cached response.
      return reads
        .execute(HttpClientRequest.setHeader(request, "x-playground-network-only", "true"))
        .pipe(
          Effect.provideService(FetchHttpClient.RequestInit, { cache: "no-store" }),
          Effect.tap((result) =>
            Effect.sync(() => {
              if (topic !== undefined && result.status >= 200 && result.status < 300) {
                acknowledgeRealtimeRead(topic, policy.revision)
              }
            }),
          ),
        )
    }),
  )
}

/**
 * Pairs an `AsyncResult` atom with a server-rendered initial value for
 * `useAtomInitialValues([seedAtom(atom, value)])` so SSR and client hydration
 * render immediately without a redundant initial fetch.
 */
export const seedAtom = <A, E>(
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>,
  value: A,
): readonly [Atom.Atom<AsyncResult.AsyncResult<A, E>>, AsyncResult.AsyncResult<A, E>] => [
  atom,
  AsyncResult.success(value),
]

/**
 * Typed client for `AppApi`. Use it as an Effect service, or through
 * `ApiClient.query(...)` / `ApiClient.mutation(...)` atoms in React.
 */
export class ApiClient extends AtomHttpApi.Service<ApiClient>()("web/ApiClient", {
  api: AppApi,
  httpClient: FetchHttpClient.layer,
  transformClient,
  baseUrl,
}) {}

/** Runs Effects outside atoms, for example inside XState actors. */
export const clientRuntime = ManagedRuntime.make(
  Layer.effect(ApiClient, HttpApiClient.make(AppApi, { transformClient, baseUrl })).pipe(
    Layer.provide(FetchHttpClient.layer),
  ),
)
