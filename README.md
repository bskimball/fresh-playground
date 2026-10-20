# Fresh playground

A small multi-page app for trying out an islands architecture with an
[Effect](https://effect.website) HTTP server,
[XState](https://stately.ai/docs/xstate), React (with React Compiler),
[StyleX](https://stylexjs.com) and Astryx UI components.

An Effect `HttpRouter` routes and renders every page, serves the API and
serves the built client files. Only the interactive parts hydrate in the
browser. The browser and server share one typed HTTP contract. Vite is used
only as the bundler.

## Run

Commands go through [Vite+](https://viteplus.dev) (`vite-plus` 1.3.0, a local
dependency; no global install needed). Run them with `npm exec -- vp`:

```sh
npm exec --package=vite-plus@1.3.0 -- vp install
npm exec -- vp run dev      # rebuild on change and restart the server, http://127.0.0.1:4321
```

```sh
npm exec -- vp run check    # vp check (Oxlint + Oxfmt check), then tsc in every package
npm exec -- vp run format   # vp fmt: format with Oxfmt
npm exec -- vp run build    # production build into packages/web/dist
npm exec -- vp run start    # serve the build (see Configuration)
```

If `vp` is installed on your `PATH`, `vp install` and `vp run dev` work
directly. `npm run <script>` also works for each script above.

`vp dev` is not this app's server. The root `dev`, `build` and `start` scripts
run the `packages/web` scripts through `vp`, so the Effect server keeps serving
the app; Vite only bundles. `vp lint` runs Oxlint on its own.

## Configuration

The server reads these variables in `packages/web/src/server/runtime.ts`;
`main.ts` applies them. `.env.example` lists them.

| Variable    | Values                                                     | Default       |
| ----------- | ---------------------------------------------------------- | ------------- |
| `NODE_ENV`  | `development`, `test`, `production`                        | `development` |
| `HOST`      | any nonempty host                                          | loopback      |
| `PORT`      | validated port number                                      | `4321`        |
| `LOG_LEVEL` | `Trace`, `Debug`, `Info`, `Warn`, `Error`, `Fatal`, `None` | `Info`        |

The `packages/web` scripts load an optional workspace-root `.env` with Node's
`--env-file-if-exists=../../.env`. Variables already set in the shell win over
the file. Effect treats empty values as absent and applies the defaults; invalid
nonempty values fail startup.

## Operations

- **Logging.** Effect loggers emit JSON in production and pretty output otherwise.
  Request logs contain method, path (no query string), status and the `http.span`
  duration; 5xx responses use error severity. Each request gets a generated
  `requestId`, added to log annotations and returned in `x-request-id`.
- **Errors.** An unexpected 5xx response is sanitized to
  `{"error":"Internal server error","requestId":"…"}`. Typed expected errors,
  such as the 409 `GardenSaturated`, pass through unchanged.
- **Log content.** Request logs use explicit metadata rather than raw HTTP causes,
  which can contain sensitive URLs and payloads. They omit query strings, bodies,
  headers, and raw exception details. Keep secrets out of URL paths and any
  application-authored log messages. Hosted error reporting is not configured.
- **Health.** `GET /health/live` is a liveness check. `GET /health/ready`
  reads the shared `Garden` service. There is no database yet.
- **Shutdown.** `NodeRuntime` owns process signals and shutdown.
- **Not implemented.** Persistence (the garden is in-memory), authentication
  and deployment.

## Layout

```
packages/
  contract/   HttpApi definition and Schemas, shared by server and browser
  server/     Garden service (in-memory) and the AppApi handlers (ApiRoutes)
  web/        the HTTP server, pages and islands; vite.config.ts bundles it
    src/server/         main.ts (Node HTTP server), assets.ts (manifest, CSS, static
                        routes), pages.tsx (routes), Document.tsx
    src/components/     shared React components; most render only on the server,
                        Icon is also used in client islands
    src/features/terrarium/
                        TerrariumIsland.tsx, TerrariumScene.tsx, care.machine.ts and
                        scene/ (mount.ts, terrarium-scene.js, plant-models.js)
    src/islands/        other hydrated React islands (LiveStatusIsland)
    src/client/         thin browser entries (garden.tsx, about.ts) and ApiClient
    src/machines/       fromEffect, the Effect bridge for XState
    src/styles/         StyleX tokens and global CSS (Astryx imports and reset)
```

## How a request flows

```
GET /            HttpRouter page ──► Garden.get (in process) ──► renderToString ──► HTML
                                     └─ <div data-island="terrarium" data-props={…}>
browser          src/client/garden.tsx ──► hydrateRoot(TerrariumIsland)
                 XState careMachine (features/terrarium/care.machine.ts) ──invoke──► fromEffect ──► ApiClient
                                                             └─ POST /api/garden/water
/api/*           HttpApiBuilder (ApiRoutes) ──► Garden
/assets, /images HttpStaticServer ──► dist/client
```

- **Contract.** `packages/contract` defines `AppApi` with Effect `HttpApi`.
  The server implements it, and the browser derives its typed client from the
  same definition. Errors such as `GardenSaturated` (409) arrive typed.
- **Server.** `packages/server` exports `ApiRoutes` and the `Garden` service.
  `src/server/assets.ts` (`loadAssets`) reads the build manifest, builds the
  hashed CSS and defines the static file routes. `src/server/main.ts` merges
  `ApiRoutes`, the page routes and those asset routes, provides `Garden.layer`
  once, and serves them with `NodeHttpServer`. Pages and the API therefore see the same in-memory garden.
  `HttpMiddleware.compression` serves br/gzip to clients that accept it.
  State resets when the server restarts. Soil dries one point per minute.
- **Islands.** Each island is rendered on its own with `renderToString` into a
  `data-island` container, and a browser entry hydrates that container. The entries in `src/client` stay thin;
  the terrarium island and its machine live in `src/features/terrarium`.
  `TerrariumIsland` hydrates on load, seeded with the garden the server just
  read; its props are encoded and decoded with `Schema.toCodecJson(Garden)`, so
  dates arrive as `Date`s. On `/about`, React and `LiveStatusIsland` are only
  fetched, then hydrated, when the island scrolls into view. `/journal` ships
  no JavaScript.
- **XState.** `careMachine` (`care.machine.ts`) runs two parallel regions. `watering` allows one
  request at a time. `settings` applies sunlight and night changes right away,
  then saves after 400 ms. Each new change re-enters `pending`, which cancels
  an in-flight save.
- **Effect ↔ XState.** `fromEffect` turns an Effect into XState actor logic.
  Leaving a state aborts the actor's signal, which interrupts the fiber and the
  underlying `fetch`. Expected failures reach `onError` as typed values.
- **Reactive fetching.** `ApiClient` is an `AtomHttpApi.Service` (from
  `effect/reactivity`), so `ApiClient.query("garden", "get", {})` is a reactive
  atom of `AsyncResult`. React reads atoms through `@effect/atom-react`. See
  `LiveStatusIsland`. XState actors reach the API through the existing
  `ManagedRuntime` bridge (`fromEffect`).
- **Tooling.** TypeScript 7, Vite 8 (Rolldown) and Vite+. The root
  `vite.config.ts` configures `lint` (Oxlint) and `fmt` (Oxfmt) for the whole
  repo; `.editorconfig` carries the basic whitespace settings. The bundler
  config stays in `packages/web/vite.config.ts`, which imports `vite-plus`.
- **Astryx.** `@astryxdesign/core` and `@astryxdesign/theme-neutral` use the
  `^0.7.1` beta series. The UI uses `Button`, `IconButton`, `Slider` and `Card`
  with the prebuilt neutral light theme. `AppTheme` wraps the document and
  each independently rendered island, keeping theme context identical for
  server rendering and hydration. `Document.tsx` loads Figtree and Fraunces
  through Google Fonts. No Astryx CLI or build plugin is required.
- **Build.** `vp build --app` builds the server bundle and the client
  bundle. The garden client entry imports `global.css`, which imports the
  Astryx reset, core and neutral-theme CSS. With `cssCodeSplit: false`, Vite
  emits shared CSS under the `style.css` manifest key. The server bundle's
  graph holds every page and island, so StyleX writes the whole app's rules
  to `dist/server/assets/stylex.css`. At startup `loadAssets` combines the
  manifest CSS with those rules, hashes the result and serves it at
  `/assets/style-<hash>.css` with immutable caching. Every page links this
  stylesheet, including pages without JavaScript. It reads
  `dist/client/.vite/manifest.json` to link the hashed island scripts.
- **React Compiler** runs through `@rolldown/plugin-babel` with
  `reactCompilerPreset`. **StyleX** compiles through `@stylexjs/unplugin`.
  Document defaults in `global.css` use zero-specificity `:where()` selectors
  in the reset layer, below the Astryx component and theme layers.

## Terrarium

The home page has a procedural Three.js terrarium, modeled as a soft clay
render of the illustration in `public/images/terrarium-whimsical.png`. Drag to
orbit, scroll or pinch to zoom, or use the buttons below the scene.
`src/features/terrarium/scene/terrarium-scene.js` builds the fresnel glass
bowl, soil, moss, stones, and mushroom. `scene/plant-models.js` builds the
round-leaf plant, golden leaves, and sprouts. Nothing uses model or texture
files. `scene/mount.ts` owns the pinned remote imports: Three.js 0.180.0 (with
OrbitControls and RoomEnvironment) loads from esm.sh, so the scene needs
network access and WebGL2. It also keeps the latest scene state while loading,
handles cancellation if the component unmounts early, and disposes the
controller. Its exported types derive from the implementation. The renderer
files stay JavaScript and are not covered by a global `checkJs`. A 960 px WebP of the illustration
(`terrarium-whimsical.webp`) shows while it loads and stays as the fallback.
