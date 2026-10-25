# Architecture

[Documentation index](../README.md) · [Development](development.md) · [Deployment](deployment.md)

## Package and request boundaries

```text
packages/contract  schemas + AppApi + permissions
       ▲                     ▲
       │                     │
packages/server         packages/web browser islands
Effect services         AtomHttpApi / XState
       ▲                     │
       │                     │ HTTP
packages/web server ◄────────┘
Effect HttpRouter + React server rendering + built assets
       │
       ▼
raw Sqlite (domain/auth/events) + native JobsSql → same persistent app.db (WAL)
```

```text
GET page → feature routes.tsx → shared service → Page.render → Document + isolated island HTML
browser  → performance.ts → bootIslands (islandRegistry) → hydrateRoot → interactive feature
API call → AppApi handler → service → SQLite write + in-process Ref update
assets   → manifest lookup → hashed scripts/CSS and static image routes
```

`packages/contract/src/Api.ts` defines `AppApi`. Each server domain module (such as `Garden.ts`) implements its group's handlers, and `ApiRoutes` in `packages/server/src/index.ts` mounts them. `packages/web/src/client/ApiClient.ts` derives both an `AtomHttpApi.Service` and a managed Effect client from that contract. Server pages read services directly. The Effect HTTP app owns routing in both modes; Vite+ bundles it for production and hosts it in development.

`packages/web/src/server/app.ts` composes pages, auth, API, health, performance, static assets, and middleware over the server package's `AppServices`. Production runs it from `main.ts`, the SSR build entry, with the built client files from `assets.ts`.

```text
vp dev → Vite middleware (source modules, CSS, HMR) → effectDevServer → dev.ts → App
  server edit → module runner re-imports dev.ts → next request builds a fresh App
  server-only file → page reload · island file → React Fast Refresh
```

In development, `server/devServer.ts` is a Vite plugin that loads `server/dev.ts` through Vite's SSR module runner and passes every request Vite does not serve to the app. Pages link source CSS and `performance.ts` directly and run through Vite's HTML transform, which adds its client, React Refresh, and StyleX's development stylesheet. Under HMR, `defineIsland` returns the same definition object for an island name, so island modules stay React Fast Refresh boundaries.

Each feature serves its pages from `features/<feature>/routes.tsx` through the `Page` service in `server/Page.ts`; `server/pages.ts` lists those route layers. `packages/web/src/components/sections.ts` lists page sections; navigation, speculative prefetching, and the service worker's offline page list derive from it. `assets.ts` reads the Vite manifest, combines shared client CSS with server-generated StyleX CSS, and serves a content-hashed stylesheet linked by every page. React Compiler and StyleX compilation are configured in `packages/web/vite.config.ts`. Figtree and Fraunces are bundled from Fontsource, not a font CDN.

### Share layers at the server boundary

Excerpt from `packages/server/src/index.ts`:

```ts
export const AppServices = Layer.mergeAll(
  Events.layer,
  Garden.layer,
  Kanban.layer,
  Auth.layer.pipe(Layer.provide(MailQueue.layer), Layer.provide(Mailer.layer)),
).pipe(
  Layer.provide(Jobs),
  Layer.provide(Sqlite.configured),
  Layer.provide(DatabasePath.layer),
  Layer.orDie,
)
```

`packages/web/src/server/app.ts` provides `AppServices` once to the merged `App(assets)` layer containing `ApiRoutes`, `AuthRoutes`, `PageRoutes(assets.pages)`, and `Health`, alongside assets and middleware. `server/main.ts` loads assets and serves that layer. This is the composition boundary: pages and HTTP handlers share service instances and the SQLite connection rather than constructing a store for every request. Browser code crosses the typed HTTP contract instead of importing these server layers.

## Persistence and process model

`packages/server/src/Sqlite.ts` opens the shared raw `node:sqlite` connection and enables WAL. `DatabasePath.layer` resolves one path for both that connection (`Sqlite.configured`) and a **second scoped connection** (`JobsSql`, the official `@effect/sql-sqlite-node` adapter, pinned to 4.0.5). Both close on scope release. The default file is `packages/web/data/app.db` when launched through the root scripts. Full `AppServices` requires a file-backed `DATABASE_PATH`; `:memory:` is rejected by `JobsSql` because separate connections would not share it. Standalone service tests can still use `Sqlite.memory` without the full app/jobs composition.

- Better Auth owns users, sessions, and accounts. Its migrations run at startup before the server listens.
- `Garden.ts` creates `garden_state`, restores it into an Effect `Ref`, and persists changes synchronously before updating the live view. Moisture is calculated from the last watering time; the journal retains at most 20 entries.
- `Kanban.ts` creates `kanban_state`, restores the board into a `Ref`, and persists whole-board replacements with a server timestamp.
- Missing demo rows are seeded. Malformed stored demo JSON is also reseeded; this is not corruption recovery. Backups matter.

Garden and Kanban survive process restarts; they are **not in-memory-only stores**. Their live `Ref`s are nevertheless process-local: multiple writers/processes would not maintain coherent views. Run one app process against a persistent writable local disk. This is not a per-user or multi-tenant data model. Whole-board Kanban saves have no server-side revision conflict check, so competing devices can overwrite each other.

## Public realtime invalidation

`packages/contract/src/Events.ts` declares `GET /api/events`: `invalidate` has `{ topic }`, `resync` has `{ topics }`, and `heartbeat` has `{}`. Only public `garden`/`kanban` topic names are sent, never complete state, auth/session data, or private payloads. Reads still use the typed HTTP API.

`Events.commit(topic, write)` synchronously wraps the domain write, event insert, and retention trim in a raw SQLite savepoint. The callback must not yield or return an asynchronous write. Domain `Ref`s change only after persistence succeeds. This atomic domain/event boundary does **not** extend to native queue offers on the second connection.

The `public_events` log keeps 1,000 events, reads batches of 100, and polls every 300 ms. IDs combine persisted `event_generation` with the sequence. Missing, malformed, future, foreign-generation, or expired cursors produce a `resync` for both topics rather than a partial history. Heartbeats arrive approximately every 15 seconds when idle; connections retire after 120 seconds. Native EventSource reconnect sends `Last-Event-ID`; a new source without a cursor gets a resync. This is a bounded replay/invalidation mechanism, not a permanent event archive.

`client/Realtime.ts` reference-counts one EventSource per document. Topic watchers feed existing XState freshness and AtomHttpApi refresh paths, preserving local pending-edit guards. Events notify only that document, not the cross-tab mutation channel, avoiding echo/refetch loops. A reopened SSE connection also revalidates subscribed topics so pending local writes resume even when the server has no missed events to replay. If a service-worker network failure permanently closes EventSource, the client retries with a fresh connection after three seconds; teardown cancels that retry. Invalidated reads use `x-playground-network-only` and `cache: no-store`; the service worker never caches SSE and will not acknowledge a stale cached response as a successful resync. While offline, ordinary snapshot reads and pending-edit synchronization remain best-effort; reconnect refetches current state, not missed private/full-state events. Focus/online/local freshness still works if EventSource is unavailable.

Responses set `Cache-Control: no-store, no-transform`, `Content-Encoding: identity`, and `X-Accel-Buffering: no`. The proxy must also disable streaming buffering/compression and permit the connection lifetime; see [deployment](deployment.md#sse-through-the-http-proxy). These changes do not make process-local domain stores multi-instance safe or provide conflict-free collaboration.

## Durable background jobs

`Jobs.ts` exports `Jobs`, `JobsStore`, `JobsSql`, `PersistedQueue`, and `runWorker`. `Jobs` combines the native Effect queue factory, SQL store (`durable_jobs`), and cleanup. No Redis/external broker or admin queue UI is introduced. Effect persistence APIs are unstable: review the pinned implementation and schema migrations when upgrading.

Delivery is **at-least-once**: a crash after a side effect but before acknowledgement can repeat it. Handlers must tolerate duplicates; a stable offer ID is enqueue deduplication, not an exactly-once side-effect guarantee. Duplicate IDs are ignored within a named queue while their rows remain. Cleanup runs every minute, retaining completed rows for one day and failed rows for seven days; IDs may be reused after removal. SQL delayed offers postpone initial visibility, rounded up to whole seconds; retries use the queue's retry schedule.

`JobsStore` polls at 300 ms, refreshes locks every 10 seconds, and expires leases after 60 seconds. `runWorker` forks one sequential scoped worker, bounds each attempt to 20 seconds, sanitizes failures, and pauses 100 ms between takes. Queue schemas, retry limits, deadlines, and side-effect idempotency remain feature responsibilities. Register the shared factory once and feature workers once under `AppServices`, not in request handlers; see the [extension recipe](development.md#add-a-durable-feature-job). Native queue support is not a multi-instance guarantee for this application.

## Authentication and trust boundaries

Better Auth serves `/api/auth/*`, with password auth, optional Google/Microsoft, and optional emailed magic links. The first account created while no admin exists is promoted by an atomic SQL statement. Establish the owner's admin account before exposing a fresh instance.

`Authentication` middleware supplies `CurrentUser` or returns 401; admin handlers separately check permissions and return 403 when absent. `Access.ts` is the role/permission source. The panel registry filters navigation, but is not the API's authorization boundary. Admin self-ban, self-demotion, and self-deletion are blocked.

Better Auth applies origin checks to its endpoints. Admin API writes and `/logout` also use `Auth.isSameOrigin`. Login's `next` destination is restricted to a same-origin path. The **public Garden and Kanban groups do not use the admin authentication middleware**; treat all demo content as shared and publicly writable.

`Mailer.layer` selects log, SMTP, or disabled delivery. Auth uses `MailQueue.enqueue`; success means the job is durably queued, not SMTP acceptance or inbox delivery. Token creation and queue offer are not atomic. `MailQueue.layer` starts the `auth-mail` worker with at most five attempts and exponential retries starting at two seconds. Its 240-second job deadline sits inside the 300-second magic-link TTL; each send is bounded by the remaining deadline and the worker's 20-second timeout. Each SMTP attempt owns a TCP socket through Nodemailer's public `getSocket` option; Effect finalization destroys it and waits for closure on success, failure, timeout, or interruption before retry/shutdown proceeds. Nodemailer still handles implicit TLS/STARTTLS, certificate verification/SNI, authentication, and message formatting. Cancellation cannot unsend DATA already accepted by the receiver, so delivery remains ambiguous and duplicates remain possible. A stable message ID helps correlation but does not guarantee provider deduplication. Terminal payloads are scrubbed after attempts, at startup, and every second; expired unclaimed pending mail is deleted. Failed scrubbed auth jobs cannot be replayed: request a fresh link. Pending secrets can remain in the DB/WAL/backups, and scrubbing is not secure erase. SMTP support does not implement password reset or email verification. See [mail configuration](deployment.md#email-and-smtp) for delivery limits.

## Hydration and state

`Document.tsx` renders each `Island` into an independent `data-island` root via `renderDocument`, collecting eager (`hydrate: "load"`) islands to emit `<link rel="modulepreload">` tags automatically. Each island is defined with `defineIsland` (binding its component, optional Effect schema or codec, and hydration trigger: `"load"`, `"visible"`, or `"idle"`) and registered in `packages/web/src/client/islandRegistry.ts`. `devServer.ts` validates registered `source` paths on startup. Server rendering wraps each island slot in its own isolated `@effect/atom-react` `RegistryProvider`, and both server rendering and browser hydration wrap islands in matching theme context and `AppTheme`.

Roots begin `inert` and `aria-busy` with a visible loading status and a no-JavaScript note. `hydrateIsland.ts` enables controls only after mounting, records a `hydrate:<island>` measure, and leaves a visible failure status (plus a Vite error overlay in development) if loading or hydration fails. The About live-status island uses `hydrate: "visible"` and seeds initial server snapshots into its `AtomHttpApi` atoms via `seedAtom` + `useAtomInitialValues`; Journal has no React hydration. All pages load the common `performance.ts` entry, which boots any registered `[data-island]` roots present in the document. Unmatched `GET` navigation paths render `NotFound` inside `Shell` with status 404.

XState coordinates terrarium watering, settings, and freshness; settings save after 400 ms. Kanban saves after 250 ms and serializes subsequent edits. Revision checks keep stale reads from replacing newer local edits. `packages/web/src/machines/fromEffect.ts` connects Effect actors to XState cancellation. `ApiClient` retries transient reads only; mutation retries belong to explicit feature synchronization, not a blanket HTTP retry.

## Offline and PWA limits

In production builds, `packages/web/src/client/performance.ts` registers `/sw.js`; development serves no worker and unregisters existing ones. `server/Pwa.ts` serves the manifest, icon, and worker source; `assets.ts` derives the worker cache version from build contents, independently of the release version.

- The worker precaches core assets and warms the `offline` sections from `sections.ts` (`/`, `/kanban`, `/journal`, `/about`; the server injects this list into `/sw.js`) plus `/api/garden`, `/api/kanban`, and `/api/hello` from `sw.ts`. These routes are network-first with cache fallback on network failure. Static assets are cache-first. Auth/admin pages are not offline navigation routes.
- Offline availability requires a prior successful visit/install and retained browser storage. Service workers require a secure context (HTTPS, or localhost during development). Cached HTML/data can be stale and can contain a prior viewer's header; auth writes trigger personalized-page invalidation, but caches are not an authorization boundary.
- Feature offline modules store pending Garden water/settings operations and whole Kanban board snapshots in `localStorage`. Synchronization runs through the page's machine on revalidation/reconnect, **not background sync after closing the app**.
- `machines/offlineSync.ts` uses schema validation, BroadcastChannel notifications, and Web Locks when available. Without these browser features coordination is reduced. Storage denial, eviction, quota limits, or clearing site data can lose pending edits. Snapshots are origin-wide, not user-scoped private storage.
- Replays do not provide server-side idempotency or conflict merging. An ambiguous network outcome can duplicate a watering; last accepted board/settings writes can win over other devices. Offline mode is a demo convenience, not a durable collaborative queue.
- The Three.js terrarium needs WebGL2; its bundled WebP remains a visual fallback. The image's redistribution rights still require owner verification before publication.

When customizing routes or branding, update the section metadata and the worker's API warm list, manifest, asset precache, and document links together. Test updates with an existing installed worker, not only a fresh browser profile.

## Operations

`GET /health/live` reports liveness; `/health/ready` reads Garden. Startup opens SQLite and initializes services/auth migrations before listening, but readiness does not continuously test SMTP or every database table.

Production logging is JSON; other environments use pretty logs. Requests get `x-request-id` and logs of method, path without query, status, and duration. Unexpected 5xx bodies are sanitized with a request ID. Log transport mail intentionally includes sensitive links outside production; application-authored messages and URL paths can still expose sensitive data.

The common browser entry lazy-loads `web-vitals` and sends metrics to `/api/performance`, which validates and logs them locally. No hosted telemetry backend is configured. `NodeRuntime` handles process shutdown; supervise the process and manage log retention in your deployment environment.
