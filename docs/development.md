# Development

[Documentation index](../README.md) · [Architecture](architecture.md)

Follow [AGENTS.md](../AGENTS.md) for naming and stack conventions. Paths in this guide are relative to the repository root. Start from a nearby implementation rather than introducing a second routing, fetching, or styling system.

Code blocks below are excerpts labeled with their source paths, not standalone modules. Surrounding imports, helpers, types, and omitted implementation remain in the source; comments mark gaps where needed.

## Add a server-rendered route

1. Add a `router.add` inside `PageRoutes` in `packages/web/src/server/pages.tsx`. Read Effect services directly, as `/journal` does; do not make an HTTP call back into the same process.
2. Render through the existing `page` helper and `Document`, preserving theme, viewer, asset links, and private page caching. For shared presentation, add a component under `packages/web/src/components/`; feature-specific components belong under `src/features/<feature>/`.
3. If it belongs in navigation, extend `Section` and `links` in `packages/web/src/components/Shell.tsx`. A static page needs no page-specific browser entry; the common `performance.ts` entry still loads.
4. Decide explicitly whether the route belongs in the PWA network-first/warm lists in `packages/web/src/client/sw.ts`. Do not add private pages to the demo offline cache by default.

The `/journal` route in `packages/web/src/server/pages.tsx` connects steps 1–2: acquire the shared service inside `PageRoutes`, read it per request, then pass content to `page`.

```tsx
// Inside PageRoutes; other setup and routes omitted.
const garden = yield * Garden
// ... viewerFor and page helpers remain in source ...
yield *
  router.add("GET", "/journal", (request) =>
    Effect.gen(function* () {
      const state = yield* garden.get
      return page(request, {
        title: "Journal",
        current: "journal",
        viewer: yield* viewerFor(request),
        children: <JournalTimeline entries={state.journal} />,
      })
    }),
  )
```

No `entry` is selected because this page needs no island. The existing `page` helper supplies `Document`, shared assets, theme, viewer, and private caching headers.

Done when the route renders directly from its URL and navigation works, including without JavaScript if it has no interactive requirement.

## Add an island

Use `packages/web/src/features/kanban/KanbanIsland.tsx` and `packages/web/src/client/kanban.tsx` as the end-to-end reference.

1. Define the component and a `defineIsland` descriptor in the feature. For schema-backed props, use `schemaJsonCodec` from `packages/web/src/machines/offlineSync.ts`; this preserves `Date` values across JSON. Plain JSON-safe props can use the default codec.
2. In `pages.tsx`, render the island independently with `renderIsland` and put its HTML and props into `Island` from `Document.tsx`. Match the server and browser theme context; island components use `AppTheme` because each has its own React root.
3. Add a thin lowercase single-word entry under `packages/web/src/client/`, import `vite/modulepreload-polyfill`, and call `bootIsland` with the same descriptor/component. Feature logic stays in the feature directory.
4. Add its name to `ClientEntryName` in `pages.tsx` and `clientEntryNames` in `assets.ts`; select it as the page's `entry`. `packages/web/vite.config.ts` discovers lowercase `.ts`/`.tsx` entry files, but does not update these server registries for you.
5. Use XState for coordinated state, with a `.machine.ts` file. Use existing `fromEffect` and `clientRuntime` for Effect actors, or `ApiClient.query`/`ApiClient.mutation` atoms with `@effect/atom-react` for reactive data. Reuse Astryx and StyleX patterns.

The same descriptor connects these three pieces; the codec serializes the board on the server and restores it in the browser.

**Descriptor — `packages/web/src/features/kanban/KanbanIsland.tsx`:**

```ts
export const kanbanIsland = defineIsland("kanban", schemaJsonCodec(KanbanBoard))
```

**Thin browser entry — `packages/web/src/client/kanban.tsx` (complete file):**

```tsx
import "vite/modulepreload-polyfill"
import { createElement } from "react"
import KanbanIsland, { kanbanIsland } from "../features/kanban/KanbanIsland.tsx"
import { bootIsland } from "./hydrateIsland.ts"

bootIsland(kanbanIsland, (board) => createElement(KanbanIsland, { board }))
```

**Server markup — `packages/web/src/server/pages.tsx`, inside `/kanban`:**

```tsx
<Island
  island={kanbanIsland}
  html={renderIsland(request, <KanbanIsland board={board} />)}
  props={board}
/>
```

The route obtains `board` with `yield* kanban.get` and selects `entry: "kanban"` in `page`. `renderIsland` supplies the request's theme context; `Island` embeds both HTML and encoded props for the matching browser root.

Done when the initial HTML matches hydration, controls remain inert until ready, a failed bootstrap leaves a useful status, and keyboard interaction works. Do not serialize secrets into island props.

## Add a shared schema and API

1. Define schemas, typed errors/statuses, and an `HttpApiGroup` in a named module under `packages/contract/src/`. See `Garden.ts` and `Kanban.ts`. Export it from `index.ts` and add the group to `AppApi` in `Api.ts`.
2. Implement `HttpApiBuilder.group(AppApi, ...)` handlers in `packages/server/src/index.ts`, or a focused module like `Admin.ts`; provide them to `ApiRoutes`. Validate at the shared contract boundary, not only in UI controls.
3. Keep business rules in an Effect service under `packages/server/src/`. Follow `Garden.layer`/`Kanban.layer` for a SQLite-backed service, export it from server `index.ts`, and wire the layer once in `packages/web/src/server/main.ts`. Pages, API handlers, and health checks should share that instance.
4. Browser code imports the contract and `ApiClient`, never server implementation modules. Expected failures should remain typed. The shared client retries transient `GET`/`HEAD` failures, not mutations.
5. For persistent schema changes, implement and document an explicit migration strategy and recovery plan. Current demo services create missing tables; they are not a general schema migration framework.

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

**Handler/service boundary — `packages/server/src/index.ts`:**

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

`Garden` in the contract is the response schema; `Garden` in the handler is the server service. `ApiRoutes` provides these handlers, while the web server provides the shared service layer.

**Typed browser read — `packages/web/src/islands/LiveStatusIsland.tsx`:**

```tsx
const gardenAtom = ApiClient.query("garden", "get", {})
// Inside LiveStatusIsland:
const garden = useAtomValue(gardenAtom)
// In its rendered value; the surrounding server-render loading guard is omitted:
AsyncResult.match(garden, {
  onInitial: () => "Loading…",
  onFailure: () => "The garden is unreachable.",
  onSuccess: ({ value }) =>
    `Moisture ${value.moisture}% · sunlight ${value.sunlight}% · ${
      value.night ? "night" : "day"
    } · watered ${value.waters} times`,
})
```

`ApiClient` derives endpoint names and result types from `AppApi`; `useAtomValue` and `AsyncResult` handle the request lifecycle without a handwritten `fetch`. This read uses the same Garden response schema returned by the settings write.

### Keep persistence in the service

`packages/server/src/Garden.ts` is the canonical implementation. Its `Garden.layer` acquires `Sqlite`, creates the table, prepares select/upsert statements, loads or seeds state, and only then creates the process-local `Ref`:

```ts
// Inside Garden.layer = Layer.effect(Garden, Effect.gen(function* () { ... })):
const database = yield * Sqlite
database.exec(`
  CREATE TABLE IF NOT EXISTS garden_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    moisture INTEGER NOT NULL,
    watered_at INTEGER NOT NULL,
    sunlight INTEGER NOT NULL,
    night INTEGER NOT NULL,
    waters INTEGER NOT NULL,
    journal_json TEXT NOT NULL
  )
`)
// Prepared statements, persist, and loadInitial remain in source.
const store = yield * Ref.make<GardenStore>(loadInitial(yield * Clock.currentTimeMillis))
// Inside reset, after obtaining now:
const next = initial(now)
persist(next)
yield * Ref.set(store, next)
return view(next, now)
```

`persist` synchronously runs the SQLite upsert. Reset persists before replacing the `Ref` and returning a view; settings and watering likewise persist inside their `Ref.modify` callbacks before returning the new state. Keep this ordering when adding operations rather than updating the visible state first.

Done when invalid inputs are rejected by the contract, declared errors reach callers correctly, and state survives a restart when persistence is required. Extend `packages/server/src/services.test.ts` where appropriate.

## Add a protected admin panel

1. Add resource statements and role grants in `packages/contract/src/Access.ts`.
2. Add endpoints to `AdminApi` in `packages/contract/src/Admin.ts`, retaining `Authentication` middleware. In `packages/server/src/Admin.ts`, use `CurrentUser` and `requirePermission` before executing the operation. Cookie-authenticated writes also retain the middleware's same-origin check.
3. Add the panel component under `packages/web/src/features/admin/` with the existing `AdminPanelProps` shape. Register its id, label, description, permissions, and component in `panels.ts`.
4. The existing `/admin/<id>` page loop and `packages/web/src/client/admin.tsx` consume that registry. Hiding a panel is not authorization: its API must enforce the same permission independently.

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

## Verification

From the root:

```sh
npm run check
npm run test
npm run build
```

`check` includes formatting validation; `npm run format` writes changes. Inspect those changes rather than silently formatting unrelated work. Existing focused test boundaries are `packages/server/src/services.test.ts` and `packages/web/src/features/kanban/kanban.test.ts`. Add regression coverage for a concrete behavior or failure, not simply for a changed filename.

For runtime changes, start the build with `npm run start` using suitable local environment settings. Check `/health/live`, `/health/ready`, and affected routes. For auth changes, exercise allowed/denied behavior; for browser changes, check hydration and relevant keyboard/offline/reconnect behavior. For data changes, use a disposable database and confirm restart persistence. Never run destructive checks against the only copy of real data.

CI configuration in [verify.yml](../.github/workflows/verify.yml) runs frozen install, check, tests, and build on Ubuntu and Windows with Node 24.21.0. Its Linux production smoke checks health and `/login`; it does not establish SMTP delivery, proxy configuration, browser behavior, or remote deployment success. Inspect actual CI results before claiming a pass.
