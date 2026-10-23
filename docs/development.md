# Development

[Documentation index](../README.md) · [Architecture](architecture.md)

Follow [AGENTS.md](../AGENTS.md) for naming and stack conventions. Paths in this guide are relative to the repository root. Start from a nearby implementation rather than introducing a second routing, fetching, or styling system.

## Add a server-rendered route

1. Add a `router.add` inside `PageRoutes` in `packages/web/src/server/pages.tsx`. Read Effect services directly, as `/journal` does; do not make an HTTP call back into the same process.
2. Render through the existing `page` helper and `Document`, preserving theme, viewer, asset links, and private page caching. For shared presentation, add a component under `packages/web/src/components/`; feature-specific components belong under `src/features/<feature>/`.
3. If it belongs in navigation, extend `Section` and `links` in `packages/web/src/components/Shell.tsx`. A static page needs no page-specific browser entry; the common `performance.ts` entry still loads.
4. Decide explicitly whether the route belongs in the PWA network-first/warm lists in `packages/web/src/client/sw.ts`. Do not add private pages to the demo offline cache by default.

Done when the route renders directly from its URL and navigation works, including without JavaScript if it has no interactive requirement.

## Add an island

Use `packages/web/src/features/kanban/KanbanIsland.tsx` and `packages/web/src/client/kanban.tsx` as the end-to-end reference.

1. Define the component and a `defineIsland` descriptor in the feature. For schema-backed props, use `schemaJsonCodec` from `packages/web/src/machines/offlineSync.ts`; this preserves `Date` values across JSON. Plain JSON-safe props can use the default codec.
2. In `pages.tsx`, render the island independently with `renderIsland` and put its HTML and props into `Island` from `Document.tsx`. Match the server and browser theme context; island components use `AppTheme` because each has its own React root.
3. Add a thin lowercase single-word entry under `packages/web/src/client/`, import `vite/modulepreload-polyfill`, and call `bootIsland` with the same descriptor/component. Feature logic stays in the feature directory.
4. Add its name to `ClientEntryName` in `pages.tsx` and `clientEntryNames` in `assets.ts`; select it as the page's `entry`. `packages/web/vite.config.ts` discovers lowercase `.ts`/`.tsx` entry files, but does not update these server registries for you.
5. Use XState for coordinated state, with a `.machine.ts` file. Use existing `fromEffect` and `clientRuntime` for Effect actors, or `ApiClient.query`/`ApiClient.mutation` atoms with `@effect/atom-react` for reactive data. Reuse Astryx and StyleX patterns.

Done when the initial HTML matches hydration, controls remain inert until ready, a failed bootstrap leaves a useful status, and keyboard interaction works. Do not serialize secrets into island props.

## Add a shared schema and API

1. Define schemas, typed errors/statuses, and an `HttpApiGroup` in a named module under `packages/contract/src/`. See `Garden.ts` and `Kanban.ts`. Export it from `index.ts` and add the group to `AppApi` in `Api.ts`.
2. Implement `HttpApiBuilder.group(AppApi, ...)` handlers in `packages/server/src/index.ts`, or a focused module like `Admin.ts`; provide them to `ApiRoutes`. Validate at the shared contract boundary, not only in UI controls.
3. Keep business rules in an Effect service under `packages/server/src/`. Follow `Garden.layer`/`Kanban.layer` for a SQLite-backed service, export it from server `index.ts`, and wire the layer once in `packages/web/src/server/main.ts`. Pages, API handlers, and health checks should share that instance.
4. Browser code imports the contract and `ApiClient`, never server implementation modules. Expected failures should remain typed. The shared client retries transient `GET`/`HEAD` failures, not mutations.
5. For persistent schema changes, implement and document an explicit migration strategy and recovery plan. Current demo services create missing tables; they are not a general schema migration framework.

Done when invalid inputs are rejected by the contract, declared errors reach callers correctly, and state survives a restart when persistence is required. Extend `packages/server/src/services.test.ts` where appropriate.

## Add a protected admin panel

1. Add resource statements and role grants in `packages/contract/src/Access.ts`.
2. Add endpoints to `AdminApi` in `packages/contract/src/Admin.ts`, retaining `Authentication` middleware. In `packages/server/src/Admin.ts`, use `CurrentUser` and `requirePermission` before executing the operation. Cookie-authenticated writes also retain the middleware's same-origin check.
3. Add the panel component under `packages/web/src/features/admin/` with the existing `AdminPanelProps` shape. Register its id, label, description, permissions, and component in `panels.ts`.
4. The existing `/admin/<id>` page loop and `packages/web/src/client/admin.tsx` consume that registry. Hiding a panel is not authorization: its API must enforce the same permission independently.

Done when an authorized user can use the panel, an anonymous API request gets 401, an insufficient role gets 403, and existing self-lockout protections remain intact. Better Auth user-management calls continue to receive the caller's headers and enforce their own permissions too.

## Verification

From the root:

```sh
npm exec -- vp run check
npm exec -- vp run test
npm exec -- vp run build
```

`check` includes formatting validation; `npm exec -- vp run format` writes changes. Inspect those changes rather than silently formatting unrelated work. Existing focused test boundaries are `packages/server/src/services.test.ts` and `packages/web/src/features/kanban/kanban.test.ts`. Add regression coverage for a concrete behavior or failure, not simply for a changed filename.

For runtime changes, start the build with `npm exec -- vp run start` using suitable local environment settings. Check `/health/live`, `/health/ready`, and affected routes. For auth changes, exercise allowed/denied behavior; for browser changes, check hydration and relevant keyboard/offline/reconnect behavior. For data changes, use a disposable database and confirm restart persistence. Never run destructive checks against the only copy of real data.

CI configuration in [verify.yml](../.github/workflows/verify.yml) runs frozen install, check, tests, and build on Ubuntu and Windows with Node 24.21.0. Its Linux production smoke checks health and `/login`; it does not establish SMTP delivery, proxy configuration, browser behavior, or remote deployment success. Inspect actual CI results before claiming a pass.
