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
shared Sqlite connection → persistent app.db (WAL)
```

```text
GET page → PageRoutes → shared service → renderToString → Document + island HTML
browser  → thin entry → bootIsland → hydrateRoot → interactive feature
API call → AppApi handler → service → SQLite write + in-process Ref update
assets   → manifest lookup → hashed scripts/CSS and static image routes
```

`packages/contract/src/Api.ts` defines `AppApi`. Server handlers in `packages/server/src/index.ts` implement it. `packages/web/src/client/ApiClient.ts` derives both an `AtomHttpApi.Service` and a managed Effect client from that contract. Server pages read services directly. Vite bundles server and client code; the Effect Node HTTP server owns routing, not a Vite dev server.

`packages/web/src/server/main.ts` composes services, pages, auth, API, health, performance, static assets, and middleware. `assets.ts` reads the Vite manifest, combines shared client CSS with server-generated StyleX CSS, and serves a content-hashed stylesheet linked by every page. React Compiler and StyleX compilation are configured in `packages/web/vite.config.ts`. Figtree and Fraunces are bundled from Fontsource, not a font CDN.

## Persistence and process model

`packages/server/src/Sqlite.ts` opens a shared `node:sqlite` connection, enables WAL for file-backed databases, and closes it on scope release. The default file is `packages/web/data/app.db` when launched through the root scripts.

- Better Auth owns users, sessions, and accounts. Its migrations run at startup before the server listens.
- `Garden.ts` creates `garden_state`, restores it into an Effect `Ref`, and persists changes synchronously before updating the live view. Moisture is calculated from the last watering time; the journal retains at most 20 entries.
- `Kanban.ts` creates `kanban_state`, restores the board into a `Ref`, and persists whole-board replacements with a server timestamp.
- Missing demo rows are seeded. Malformed stored demo JSON is also reseeded; this is not corruption recovery. Backups matter.

Garden and Kanban survive process restarts; they are **not in-memory-only stores**. Their live `Ref`s are nevertheless process-local: multiple writers/processes would not maintain coherent views. Run one app process against a persistent writable local disk. This is not a per-user or multi-tenant data model. Whole-board Kanban saves have no server-side revision conflict check, so competing devices can overwrite each other.

## Authentication and trust boundaries

Better Auth serves `/api/auth/*`, with password auth, optional Google/Microsoft, and optional emailed magic links. The first account created while no admin exists is promoted by an atomic SQL statement. Establish the owner's admin account before exposing a fresh instance.

`Authentication` middleware supplies `CurrentUser` or returns 401; admin handlers separately check permissions and return 403 when absent. `Access.ts` is the role/permission source. The panel registry filters navigation, but is not the API's authorization boundary. Admin self-ban, self-demotion, and self-deletion are blocked.

Better Auth applies origin checks to its endpoints. Admin API writes and `/logout` also use `Auth.isSameOrigin`. Login's `next` destination is restricted to a same-origin path. The **public Garden and Kanban groups do not use the admin authentication middleware**; treat all demo content as shared and publicly writable.

`Mailer.layer` selects log, SMTP, or disabled delivery. SMTP support does not implement password reset or email verification. See [mail configuration](deployment.md#email-and-smtp) for delivery limits.

## Hydration and state

`Document.tsx` renders each `Island` into an independent `data-island` root. Props use a shared descriptor; schema JSON codecs restore values such as dates. Server and browser rendering use matching theme context and `AppTheme` wrappers.

Roots begin `inert` and `aria-busy` with a visible loading status and a no-JavaScript note. `hydrateIsland.ts` enables controls only after mounting, records a `hydrate:<island>` measure, and leaves a visible failure status if initialization/hydration fails. The About live-status island hydrates when visible; Journal has no React hydration. All pages still load the common performance/theme/PWA entry.

XState coordinates terrarium watering, settings, and freshness; settings save after 400 ms. Kanban saves after 250 ms and serializes subsequent edits. Revision checks keep stale reads from replacing newer local edits. `packages/web/src/machines/fromEffect.ts` connects Effect actors to XState cancellation. `ApiClient` retries transient reads only; mutation retries belong to explicit feature synchronization, not a blanket HTTP retry.

## Offline and PWA limits

`packages/web/src/client/performance.ts` registers `/sw.js`. `server/Pwa.ts` serves the manifest, icon, and worker source; `assets.ts` derives the worker cache version from build contents, independently of the release version.

- The worker precaches core assets and warms `/`, `/kanban`, `/journal`, `/about`, `/api/garden`, `/api/kanban`, and `/api/hello`. These routes are network-first with cache fallback on network failure. Static assets are cache-first. Auth/admin pages are not offline navigation routes.
- Offline availability requires a prior successful visit/install and retained browser storage. Service workers require a secure context (HTTPS, or localhost during development). Cached HTML/data can be stale and can contain a prior viewer's header; auth writes trigger personalized-page invalidation, but caches are not an authorization boundary.
- Feature offline modules store pending Garden water/settings operations and whole Kanban board snapshots in `localStorage`. Synchronization runs through the page's machine on revalidation/reconnect, **not background sync after closing the app**.
- `machines/offlineSync.ts` uses schema validation, BroadcastChannel notifications, and Web Locks when available. Without these browser features coordination is reduced. Storage denial, eviction, quota limits, or clearing site data can lose pending edits. Snapshots are origin-wide, not user-scoped private storage.
- Replays do not provide server-side idempotency or conflict merging. An ambiguous network outcome can duplicate a watering; last accepted board/settings writes can win over other devices. Offline mode is a demo convenience, not a durable collaborative queue.
- The Three.js terrarium needs WebGL2; its bundled WebP remains a visual fallback. The image's redistribution rights still require owner verification before publication.

When customizing routes or branding, update the worker route lists, manifest, asset precache, and document links together. Test updates with an existing installed worker, not only a fresh browser profile.

## Operations

`GET /health/live` reports liveness; `/health/ready` reads Garden. Startup opens SQLite and initializes services/auth migrations before listening, but readiness does not continuously test SMTP or every database table.

Production logging is JSON; other environments use pretty logs. Requests get `x-request-id` and logs of method, path without query, status, and duration. Unexpected 5xx bodies are sanitized with a request ID. Log transport mail intentionally includes sensitive links outside production; application-authored messages and URL paths can still expose sensitive data.

The common browser entry lazy-loads `web-vitals` and sends metrics to `/api/performance`, which validates and logs them locally. No hosted telemetry backend is configured. `NodeRuntime` handles process shutdown; supervise the process and manage log retention in your deployment environment.
