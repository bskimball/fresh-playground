# Development

[Documentation index](../README.md) · [Architecture](architecture.md)

Follow [AGENTS.md](../AGENTS.md) for naming and stack conventions. Paths in this guide are relative to the repository root. Start from a nearby implementation rather than introducing a second routing, fetching, or styling system.

Unless explicitly labeled as a new feature example, code blocks below are excerpts labeled with their source paths, not standalone modules. Surrounding imports, helpers, types, and omitted implementation remain in the source; comments mark gaps where needed.

## Add a server-rendered route

1. Add the page's section to `sections` in `packages/web/src/components/sections.ts`: its `href`, `label`, and `icon`; `nav: "everyone"` or `nav: "admins"` to list it in navigation (public links are also prefetched); and `offline: true` only for public pages the service worker may serve from cache. Private pages never set `offline`.
2. Add the route to the feature's `packages/web/src/features/<feature>/routes.tsx`, creating it if needed as an `HttpRouter.use` layer like `KanbanPages`. Read Effect services directly, as `/journal` does; do not make an HTTP call back into the same process.
3. Return `yield* page.render(request, { title, description, current, children })`, where `page` is the `Page` service from `packages/web/src/server/Page.ts`. It looks up the signed-in viewer, renders `Document` with theme, head metadata (`description`, `canonical`, `openGraph`), and asset links, and sets private caching (plus optional route `headers`). Pass `viewer` only when the route already resolved it with `page.viewer` to make a decision, as `/login` and `/admin` do. Use `hrefFor`, `adminPanelHref`, and `loginHref` from `sections.ts` for typed route paths. Shared presentation belongs in `packages/web/src/components/`.
4. For a new `routes.tsx`, add its layer to `PageRoutes` in `packages/web/src/server/pages.ts`.

A static page needs no page-specific browser entry; the common `performance.ts` entry still loads. `GardenPages` in `packages/web/src/features/terrarium/routes.tsx` connects steps 2–3: acquire the services once, read them per request, then render.

```tsx
// Inside GardenPages; the "/" route is omitted.
const page = yield * Page
const garden = yield * Garden
yield *
  router.add("GET", "/journal", (request) =>
    Effect.gen(function* () {
      const state = yield* garden.get
      return yield* page.render(request, {
        title: "Journal",
        current: "journal",
        children: <JournalTimeline entries={state.journal} />,
      })
    }),
  )
```

No `<Island>` is rendered because this page needs no interactive hydration. `Page` supplies `renderDocument`, shared assets, theme, the viewer, and private caching headers. The section entry supplies its navigation link, prefetching, and offline caching.

`PageRoutes` and `ApiRoutes` are typed `AppRoutes`, so a route that needs a service missing from `AppServices` fails typechecking at that list and names the service.

Done when the route renders directly from its URL and navigation works, including without JavaScript if it has no interactive requirement.

## Add an island

Use `packages/web/src/features/kanban/KanbanIsland.tsx` and `packages/web/src/client/islandRegistry.ts` as the end-to-end reference.

1. Define the component and bind it with `defineIsland` in the feature. Pass `{ codec: schemaJsonCodec(Schema) }` from `packages/web/src/machines/offlineSync.ts` for schema-backed props (preserving `Date` values across JSON, while keeping `hydrateIsland.ts` free of Effect runtime imports on non-Effect islands), `{ hydrate: "visible" | "idle" }` for deferred hydration, or omit options for eager (`"load"`) plain JSON-safe or `void` props. Server rendering isolates each island slot in its own `RegistryProvider`, and both server rendering and browser hydration wrap the island in `AppTheme` automatically.
2. Register the island once in `packages/web/src/client/islandRegistry.ts`: its source path, `offline` precache flag, and `load` import. The key must match the name passed to `defineIsland`; the registry type rejects a mismatch, and `<Island>` only accepts registered islands. `performance.ts` boots registered islands present on the page, and `assets.ts` resolves each island's built chunk and modulepreloads from the same entry.
3. In the feature's `routes.tsx`, render `<Island island={...} props={...} />` (or `<Island island={...} />` when `props` is `void`). `renderDocument` renders each island in its own isolated React root and emits `<link rel="modulepreload">` tags for eager islands rendered on that page.
4. Use XState for coordinated state, with a `.machine.ts` file. Use existing `fromEffect` and `clientRuntime` for Effect actors, or `ApiClient.query`/`ApiClient.mutation` atoms with `@effect/atom-react` for reactive data. Reuse Astryx and StyleX patterns.

The same definition connects the feature, registry, and server route; the codec serializes the board on the server and restores it in the browser.

**Definition — `packages/web/src/features/kanban/KanbanIsland.tsx`:**

```ts
export const kanbanIsland = defineIsland("kanban", KanbanIsland, {
  codec: schemaJsonCodec(KanbanBoard),
})
```

**Registry — `packages/web/src/client/islandRegistry.ts`:**

```ts
kanban: {
  source: "src/features/kanban/KanbanIsland.tsx",
  offline: true,
  load: () => import("../features/kanban/KanbanIsland.tsx").then((m) => m.kanbanIsland),
},
```

**Server markup — `packages/web/src/features/kanban/routes.tsx`, inside `/kanban`:**

```tsx
<Island island={kanbanIsland} props={board} />
```

The route obtains `board` with `yield* kanban.get` and renders `<Island island={kanbanIsland} props={board} />` through `page.render`. `renderDocument` supplies the request's theme context, wraps the island in `AppTheme`, embeds both HTML and encoded props, and preloads the `kanban` island chunk.

Done when the initial HTML matches hydration, controls remain inert until ready, a failed bootstrap leaves a useful status, and keyboard interaction works. Do not serialize secrets into island props.

## Add a shared schema and API

1. Define schemas, typed errors/statuses, and an `HttpApiGroup` in a named module under `packages/contract/src/`. See `Garden.ts` and `Kanban.ts`. Export it from `index.ts` and add the group to `AppApi` in `Api.ts`.
2. Keep business rules in an Effect service in a named module under `packages/server/src/`. Follow `Garden.layer`/`Kanban.layer` for a SQLite-backed service.
3. In the same module, export the group's `HttpApiBuilder.group(AppApi, ...)` handlers, mapping each endpoint to the service, as `GardenHandlers` does. Validate at the shared contract boundary, not only in UI controls.
4. In `packages/server/src/index.ts`, export the service, add its layer to `AppServices`, and add its handlers to `ApiRoutes`. The web server provides `AppServices` once, so pages, API handlers, and health checks share the instance; `packages/web/src/server/main.ts` does not change. A forgotten layer or handler group fails typechecking at `ApiRoutes` and names it, such as `Kanban` or `Service<"app", "kanban">`.
5. Browser code imports the contract and `ApiClient`, never server implementation modules. Expected failures should remain typed. The shared client retries transient `GET`/`HEAD` failures, not mutations.
6. For public realtime changes, follow the topic/commit registration below; do not emit private data through the public stream. A service using `Events` must provide `Events.layer` (as Garden and Kanban do) or receive it through an explicit layer dependency. Keep the shared `Events.layer` in `AppServices` and `EventsHandlers` in `ApiRoutes`; sibling `Layer.mergeAll` outputs do not automatically satisfy sibling inputs.
7. For persistent schema changes, implement and document an explicit migration strategy and recovery plan. Current demo services create missing tables; they are not a general schema migration framework.

### Follow a contract through to the browser

**Contract — `packages/contract/src/Garden.ts`:** `Sunlight` is an integer constrained to 10–100. The group declares the read result and settings payload, then mounts under `/api/garden`.

```ts
export const GardenSettings = Schema.Struct({
  sunlight: Sunlight,
  night: Schema.Boolean,
})
// Inside GardenApi's .add(...); water endpoint omitted.
HttpApiEndpoint.get("get", "/", { success: Garden }),
HttpApiEndpoint.put("settings", "/settings", {
  payload: GardenSettings,
  success: Garden,
}),
// The group ends with .prefix("/api/garden").
```

**Handler/service boundary — `packages/server/src/Garden.ts`:**

```ts
const GardenHandlers = HttpApiBuilder.group(
  AppApi,
  "garden",
  Effect.fn(function* (handlers) {
    const garden = yield* Garden
    return handlers.handleAll({
      get: () => garden.get,
      water: () => garden.water,
      settings: ({ payload }) => garden.updateSettings(payload),
    })
  }),
)
```

`Garden` in the contract is the response schema; `Garden` in the handler is the server service. `ApiRoutes` in `packages/server/src/index.ts` provides these handlers, and `AppServices` there provides the shared service layer.

**Typed browser read — `packages/web/src/islands/LiveStatusIsland.tsx`:**

```tsx
const gardenAtom = ApiClient.query("garden", "get", {})
// Inside LiveStatusIsland(initial: LiveStatusSnapshot):
useAtomInitialValues([seedAtom(helloAtom, initial.hello), seedAtom(gardenAtom, initial.garden)])
const garden = useAtomValue(gardenAtom)
// In its rendered value:
AsyncResult.match(garden, {
  onInitial: () => "Loading…",
  onFailure: () => "The garden is unreachable.",
  onSuccess: ({ value }) =>
    `Moisture ${value.moisture}% · sunlight ${value.sunlight}% · ${
      value.night ? "night" : "day"
    } · watered ${value.waters} times`,
})
```

`ApiClient` derives endpoint names and result types from `AppApi`; `seedAtom` + `useAtomInitialValues` seed the server-rendered snapshot into the island's `AtomRegistry` so SSR and hydration render immediately without a redundant initial fetch, while `useAtomRefresh` and `AsyncResult` handle subsequent revalidations.

### Keep persistence in the service

`packages/server/src/Garden.ts` is the canonical implementation. Its `Garden.layer` acquires `Sqlite`, runs `Sqlite.migrate` for its namespace, prepares select/upsert statements, loads or seeds state, and only then creates the process-local `Ref`:

```ts
// Inside Garden.layer = Layer.effect(Garden, Effect.gen(function* () { ... })):
const database = yield * Sqlite
const events = yield * Events
Sqlite.migrate(database, "garden", [
  `
  CREATE TABLE IF NOT EXISTS garden_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    moisture INTEGER NOT NULL,
    watered_at INTEGER NOT NULL,
    sunlight INTEGER NOT NULL,
    night INTEGER NOT NULL,
    waters INTEGER NOT NULL,
    journal_json TEXT NOT NULL
  )
  `,
])
// Prepared statements, persist, and loadInitial remain in source.
const store = yield * Ref.make<GardenStore>(loadInitial(yield * Clock.currentTimeMillis))
// Inside reset, after obtaining now:
const next = initial(now)
events.commit("garden", () => persist(next))
yield * Ref.set(store, next)
return view(next, now)
```

`persist` synchronously runs the SQLite upsert. `events.commit` adds the public invalidation in the same synchronous savepoint; never put an Effect yield, promise, or native queue offer inside that callback. Reset commits before replacing the `Ref`; settings and watering likewise commit inside `Ref.modify`. `Garden.layer` ends with `.pipe(Layer.provide(Events.layer))`, satisfying that dependency while reusing the same layer identity in the app composition. Keep this ordering rather than updating visible state first.

Done when invalid inputs are rejected by the contract, declared errors reach callers correctly, and state survives a restart when persistence is required. Extend `packages/server/src/services.test.ts` where appropriate.

## Extend public invalidation

For a new **public** topic, add its topic key and snapshot API path to `EVENT_TOPIC_PATHS` and `EVENT_TOPICS` in `packages/contract/src/Events.ts`. Server `Events.ts` automatically widens an existing `public_events` table's `CHECK` constraint and updates its resync fallback list from `EVENT_TOPICS`, and client `Realtime.ts` derives its revision map and API pathname mapping from `EVENT_TOPIC_PATHS`.

Use `events.commit(topic, () => synchronousDomainWrite())` before changing a process-local view. Register your service/handlers in `AppServices`/`ApiRoutes` as above. Add the feature's mutation event/topic pair to `freshnessTopics` in `machines/offlineSync.ts`, then use `createFreshnessChannel(eventName).watch(refresh)` for its existing freshness callback (see the Garden/Kanban offline modules); AtomHttpApi consumers can use `watchRealtime(topic, refresh)` directly, or wrap atom refresh functions in the feature's freshness watcher as `LiveStatusIsland.tsx` does. Return the unsubscribe function on teardown. Do not publish an SSE receipt to BroadcastChannel or enqueue a mutation in response to it. Keep dirty local edits protected and let invalidation trigger a typed read, not a state replacement from the event.

Verify two documents, reconnect within/beyond retention, an offline invalidated read, and pending local edits. The stream must contain only public topic names; private features need a separately authorized design.

## Add a durable feature job

Use the exported native queue factory, not a new scheduler or database connection. This minimal module demonstrates a schema-typed audit job with a real bounded logging handler; replace the handler with your feature's duplicate-safe work, and avoid logging secrets.

```ts
// packages/server/src/AuditJobs.ts (new feature example)
import { Context, Effect, Layer, Schedule, Schema } from "effect"
import { PersistedQueue, runWorker } from "./Jobs.ts"

export const AuditJob = Schema.Struct({ recordId: Schema.String })

export class AuditJobs extends Context.Service<
  AuditJobs,
  PersistedQueue.PersistedQueue<typeof AuditJob.Type>
>()("feature/AuditJobs") {
  static readonly layer = Layer.effect(
    AuditJobs,
    Effect.gen(function* () {
      const queue = yield* PersistedQueue.make({
        name: "audit-record",
        schema: AuditJob,
        maxAttempts: 5,
        retrySchedule: Schedule.exponential("2 seconds"),
      })
      yield* runWorker(queue, (job) =>
        Effect.logInfo("Audit record processed").pipe(
          Effect.annotateLogs({ recordId: job.recordId }),
        ),
      )
      return queue
    }),
  )
}
```

Export `AuditJobs` from `packages/server/src/index.ts` and add its layer to the existing `AppServices` merge as below. Keep the existing common `Layer.provide(Jobs)` so all queue consumers use the **same shared `Jobs` once**. `AuditJobs.layer` creates its queue and starts its worker exactly once in the app scope, not per route/request. Workers are interrupted before their backing connections close.

```ts
// packages/server/src/index.ts; imports include AuditJobs from ./AuditJobs.ts
export const AppServices = Layer.mergeAll(
  Events.layer,
  Garden.layer,
  Kanban.layer,
  AuditJobs.layer,
  Auth.layer.pipe(Layer.provide(MailQueue.layer), Layer.provide(Mailer.layer)),
).pipe(
  Layer.provide(Jobs),
  Layer.provide(Sqlite.configured),
  Layer.provide(DatabasePath.layer),
  Layer.orDie,
)
```

Inside a caller's `Effect.gen`, acquire the service and offer work (`recordId` is the caller's durable business identifier):

```ts
const audit = yield * AuditJobs
yield * audit.offer({ recordId }, { id: `audit:${recordId}:v1`, delay: "10 seconds" })
```

Choose IDs from durable business identity plus operation/version, not a new random UUID for every retry of the same logical offer. Duplicate IDs within this queue are ignored, including a changed payload/delay, while the row remains. Cleanup runs every minute with one-day completed and seven-day failed retention; deduplication ends when the row is removed. SQL rounds the initial delay up to whole seconds; it does not consume an attempt, and retries follow `retrySchedule`.

`runWorker` is sequential, scoped, and limited to 20 seconds per attempt; the store polls every 300 ms with 10-second lock refresh and a 60-second lease. Set explicit feature retry/deadline policy and keep work bounded. Effect timeout interrupts the handler; external work must release its resources on interruption. `Mailer.send` demonstrates per-attempt ownership using Nodemailer's supported `getSocket` hook and a socket-destroy/close finalizer; a bare uncancellable promise does not stop I/O. Claims consume attempts even on process crash, and undecodable payloads fail terminally. Design side effects for at-least-once redelivery, including a crash after success before acknowledgement. A stable queue ID is not downstream idempotency.

Offers use the native SQL connection, **not** the raw domain/auth savepoint. Do not claim atomic domain-write-plus-enqueue, and do not nest a queue offer inside `Events.commit`. If an atomic business handoff is required, design and test an explicit transactional outbox/reconciliation boundary before exposing it. Full app/jobs tests need a disposable file-backed `DATABASE_PATH`; standalone domain tests may still use `Sqlite.memory` and `Events.layer`. Validate delayed delivery, duplicate offers, restart/lease recovery, retry exhaustion, and shutdown; inspect only safe queue metadata as described in [operations](deployment.md#durable-job-operations).

## Add a protected admin panel

1. Add resource statements and role grants in `packages/contract/src/Access.ts`.
2. Add endpoints to `AdminApi` in `packages/contract/src/Admin.ts`, retaining `Authentication` middleware. In `packages/server/src/Admin.ts`, use `CurrentUser` and `requirePermission` before executing the operation. Cookie-authenticated writes also retain the middleware's same-origin check.
3. Add the panel component under `packages/web/src/features/admin/` with the existing `AdminPanelProps` shape. Register its id, label, description, permissions, and component in `panels.ts`.
4. The existing `/admin/<id>` page loop and `adminPanelIsland` in `packages/web/src/features/admin/panels.ts` consume that registry. Hiding a panel is not authorization: its API must enforce the same permission independently.

For the Garden reset vertical slice, grant a resource action, protect its endpoint, then list the UI separately.

**Permission source — `packages/contract/src/Access.ts`:**

```ts
export const statements = {
  ...defaultStatements,
  garden: ["reset"],
} as const

export const ac = createAccessControl(statements)

export const roles = {
  admin: ac.newRole({ ...adminAc.statements, garden: ["reset"] }),
  user: ac.newRole({ user: [], session: [] }),
} satisfies Record<string, Role>
```

**Authenticated endpoint — `packages/contract/src/Admin.ts`:**

```ts
// Inside AdminApi's .add(...); other endpoints omitted.
HttpApiEndpoint.post("resetGarden", "/garden/reset", {
  success: Garden,
  error: errors,
}),
// The group ends with:
// .middleware(Authentication)
// .prefix("/api/admin")
```

Here `errors` declares Forbidden and BadRequest. The middleware establishes the user and checks the origin of writes; the handler still enforces the action's permission.

**Server enforcement — `packages/server/src/Admin.ts`, inside `handlers.handleAll`:**

```ts
resetGarden: () =>
  requirePermission({ garden: ["reset"] }).pipe(Effect.andThen(garden.reset)),
```

`requirePermission` reads `CurrentUser`, checks `can(user.role, permissions)`, and fails with Forbidden before reset if the grant is absent.

**UI registry entry — `packages/web/src/features/admin/panels.ts`, inside `adminPanels`:**

```ts
{
  id: "garden",
  label: "Garden",
  description: "The shared demo garden.",
  permissions: { garden: ["reset"] },
  Island: GardenPanel,
},
```

`panelsFor` filters this listing with `can`; it does not replace the server permission check above.

Done when an authorized user can use the panel, an anonymous API request gets 401, an insufficient role gets 403, and existing self-lockout protections remain intact. Better Auth user-management calls continue to receive the caller's headers and enforce their own permissions too.

## Store files for a feature

The Files feature (`packages/contract/src/Files.ts`, `packages/server/src/Files.ts`, `packages/web/src/features/files/`) is the worked example: a multipart endpoint behind `Authentication`, metadata rows owned by a user, and bytes in `Storage`. For another feature's attachments, reuse `Storage` rather than writing to disk directly:

1. Declare the upload payload with `HttpApiSchema.asMultipart({ maxParts, maxFileSize })` around a struct using `Multipart.SingleFileSchema` (or `FilesSchema`). The parser enforces the limits and answers 413 before your handler runs.
2. In the service, generate the key yourself (a UUID), `storage.put(key, { path, contentType })` from the persisted temp file, then insert your row. If the insert can be refused, as the quota is, remove the object afterwards. Never derive keys or paths from client-supplied names; `Storage` rejects keys outside `[A-Za-z0-9-]`.
3. Serve bytes from a route that checks ownership, like `FileRoutes`, keeping `nosniff`, the sandbox CSP, and `attachment` for anything that is not a known image type.

In the browser, multipart endpoints take a `FormData` payload. An atom seeded from server props with `seedAtom` has not run its query, so refresh it after a mutation, as `FilesIsland.tsx` does, rather than relying on `reactivityKeys` alone.

## Render Markdown content

For help, legal, or other prose pages, import the Markdown source as a string and render it with Astryx's `Markdown` component. Vite's `?raw` import bundles the file at build time; nothing is fetched or parsed from disk at request time, and no extra dependency is needed. A new feature example:

```tsx
// packages/web/src/features/legal/routes.tsx, with privacy.md beside it
import { Markdown } from "@astryxdesign/core/Markdown"
import { Effect } from "effect"
import { HttpRouter } from "effect/http"
import { Page } from "../../server/Page.ts"
import privacy from "./privacy.md?raw"

export const LegalPages = HttpRouter.use(
  Effect.fn(function* (router) {
    const page = yield* Page
    yield* router.add("GET", "/privacy", (request) =>
      page.render(request, {
        title: "Privacy",
        current: "about",
        children: <Markdown>{privacy}</Markdown>,
      }),
    )
  }),
)
```

Add `LegalPages` to `PageRoutes` in `server/pages.ts`, and a `sections.ts` entry if the page belongs in navigation. The component renders Markdown, including GFM tables, on the server with Astryx typography, and the page needs no island. Reach for MDX (`@mdx-js/rollup`) only when content must embed interactive components; that also means mapping its elements to Astryx and deciding how islands appear inside content.

## Verification

From the root:

```sh
npm run check
npm run test
npm run build
```

`check` includes formatting validation; `npm run format` writes changes. Inspect those changes rather than silently formatting unrelated work. Existing focused test boundaries are `packages/server/src/services.test.ts` and `packages/web/src/features/kanban/kanban.test.ts`. Add regression coverage for a concrete behavior or failure, not simply for a changed filename.

For browser behavior, run the Playwright smoke suite against the build:

```sh
npx playwright install chromium   # once per machine
npm run build
npm run e2e
```

`e2e/smoke.e2e.ts` starts the production server on port 4331 with a fresh temporary database, then signs up the first (admin) account, saves a Kanban task across a reload, uploads, downloads, and deletes a file, and loads `/kanban` offline from the service worker. Steps share one browser session and run in order. Extend it when a change affects hydration, auth flow, or offline behavior.

Iterate with `npm run dev` ([what it reloads](getting-started.md#clean-checkout)), but verify offline, service-worker, caching, and asset-preload behavior against the build: `npm run dev` serves source modules and no worker. For runtime changes, start the build with `npm run start` using suitable local environment settings. Check `/health/live`, `/health/ready`, and affected routes. For auth changes, exercise allowed/denied behavior; for browser changes, check hydration and relevant keyboard/offline/reconnect behavior. For data changes, use a disposable database and confirm restart persistence. Never run destructive checks against the only copy of real data.

CI configuration in [verify.yml](../.github/workflows/verify.yml) runs frozen install, check, tests, and build on Ubuntu and Windows with Node 24.21.0. Its Linux production smoke checks health and `/login`. Separate Ubuntu jobs run the Playwright suite in Chromium and build the Docker image, then check the container's readiness and `/login`. None of these establish SMTP delivery, S3 providers, proxy configuration, or remote deployment success. Inspect actual CI results before claiming a pass.
