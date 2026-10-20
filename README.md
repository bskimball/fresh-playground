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

```sh
npm install
npm run dev     # rebuild on change and restart the server, http://127.0.0.1:4321
```

```sh
npm run check   # Biome (lint + format check) and tsc in every package
npm run format  # Biome: format, organize imports and apply safe lint fixes
npm run build   # production build into packages/web/dist
npm run start   # serve the build on http://127.0.0.1:4321 (PORT and HOST override)
```

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
- **Effect atoms.** `ApiClient` is an `AtomHttpApi.Service`, so
  `ApiClient.query("garden", "get", {})` is a reactive atom of
  `AsyncResult`. See `LiveStatusIsland`.
- **Tooling.** TypeScript 7 and Vite 8 (Rolldown). Biome lints and formats
  the whole repo (2 spaces, double quotes, no semicolons, 100 columns);
  `biome.json` is the config and `.editorconfig` carries the same basics.
- **Astryx.** `@astryxdesign/core` and `@astryxdesign/theme-neutral` use the
  `^0.7.1` beta series. The UI uses `Button`, `IconButton`, `Slider` and `Card`
  with the prebuilt neutral light theme. `AppTheme` wraps the document and
  each independently rendered island, keeping theme context identical for
  server rendering and hydration. `Document.tsx` loads Figtree and Fraunces
  through Google Fonts. No Astryx CLI or build plugin is required.
- **Build.** `vite build --app` builds the server bundle and the client
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
