import { AppApi } from "@playground/contract"
import { Layer, ManagedRuntime, Schedule } from "effect"
import { FetchHttpClient, HttpClient } from "effect/http"
import { HttpApiClient } from "effect/http-api"
import { AtomHttpApi } from "effect/reactivity"

// Islands also render once on the server, where no request is made, so the
// origin is only needed in the browser.
const baseUrl = globalThis.location?.origin

const transformClient = (client: HttpClient.HttpClient) =>
  client.pipe(HttpClient.retryTransient({ schedule: Schedule.exponential(200), times: 2 }))

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
