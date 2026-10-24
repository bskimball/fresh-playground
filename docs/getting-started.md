# Getting started

[Documentation index](../README.md) · [Development](development.md) · [Deployment](deployment.md)

## Clean checkout

1. Clone or copy this repository, then open a terminal at its root.
2. Use Node.js **24.21.0** and npm. This matches the configured CI runtime; another Node version is not a verified substitute for the built-in `node:sqlite` dependency.
3. Install dependencies:

   ```sh
   npm install
   ```

4. Optionally copy [`.env.example`](../.env.example) to `.env` at the repository root using your editor or file manager. No `.env` is required for local development.
5. Run:

   ```sh
   npm run dev
   ```

The dev script builds once if needed, then watches the bundles and restarts the Effect server. It uses shell grouping and `&`; equivalent watcher behavior across development shells/platforms has not been established. If the combined script fails, run `npm exec -- vp -C packages/web build --app --watch` in one terminal and `node --env-file-if-exists=../../.env --watch-path=dist/server dist/server/main.js` in another terminal **whose working directory is `packages/web`**, after an initial `npm run build` at the root. This is a diagnostic alternative, not a claim of platform support.

Without an env file, open <http://127.0.0.1:4321>. The sample env explicitly sets `BETTER_AUTH_URL=http://localhost:4321`; if using it, open <http://localhost:4321>. Use the same origin throughout authentication and OAuth configuration.

## Take ownership before public access

Keep a fresh instance reachable only by you until you have created an account through `/login` and confirmed access to `/admin/users`. An account created while no admin exists becomes admin; subsequent accounts are ordinary users. The election is atomic, but it does not identify the intended owner. Do this **before** opening a public proxy or firewall rule. Promote additional admins from `/admin/users` afterward.

The demo Garden and Kanban APIs allow public writes. Admin permissions protect administrative operations, not all demo content. Add the appropriate authentication/authorization before storing private or user-owned data. Password reset and email verification are not implemented.

## Local configuration

The workspace scripts load the optional root `.env` via Node's `--env-file-if-exists`. Existing shell variables take precedence. Empty values are treated as absent by the configuration layer; invalid configured values can fail startup.

For a minimal local `.env`, use these settings from [`.env.example`](../.env.example), with the log transport selected explicitly:

```dotenv
NODE_ENV=development
BETTER_AUTH_URL=http://localhost:4321
AUTH_PASSWORD=true
MAIL_TRANSPORT=log
```

This changes the browser/auth origin from the no-env default `http://127.0.0.1:4321` to `http://localhost:4321`, just as copying the full sample does. Open the localhost URL consistently. No secret is supplied here; production secrets and SMTP belong in the [deployment configuration](deployment.md#provision-and-start), not this local example.

- `HOST=127.0.0.1`, `PORT=4321`, and `LOG_LEVEL=Info` are defaults. Log levels are `Trace`, `Debug`, `Info`, `Warn`, `Error`, `Fatal`, or `None`.
- `DATABASE_PATH` defaults to `data/app.db`, relative to the process working directory: `packages/web` when using the root scripts. Garden, Kanban, and authentication persist in that SQLite file. Its parent directory is created automatically.
- `AUTH_PASSWORD` defaults to `true`; `AUTH_MAGIC_LINK` defaults to on outside production and off in production.
- `MAIL_TRANSPORT` defaults to `log` outside production. Sign-in links appear in the server logs and are sensitive credentials. Use test accounts and restrict access to these logs. Production rejects this transport.
- Set both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to enable Google. Set both `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` for Microsoft; `MICROSOFT_TENANT_ID` defaults to `common` (or use `organizations`, `consumers`, or a tenant ID).
- Register OAuth callback URLs as the public `BETTER_AUTH_URL` followed by `/api/auth/callback/google` or `/api/auth/callback/microsoft`.

See [deployment](deployment.md) for production secrets, mail settings, and disk layout. `.env` and databases are local state, not template content to publish.

## Rename safely

1. Change the root package name and the three workspace names in `packages/contract/package.json`, `packages/server/package.json`, and `packages/web/package.json` together.
2. Replace `@playground/contract` and `@playground/server` in workspace dependency keys and source imports. Check for any remaining old names before proceeding. Keep workspace directory paths unless you also update every script/config/reference using those paths.
3. Run `npm install` to reconcile `package-lock.json`, then run the [verification commands](development.md#verification).
4. Replace branding in `packages/web/src/components/Shell.tsx`, `packages/web/src/server/Document.tsx`, and `packages/web/src/server/Pwa.ts`, plus page titles/content in `packages/web/src/server/pages.tsx` and the demo components. Review browser storage/channel names in `packages/web/src/machines/offlineSync.ts`, feature offline modules, `packages/web/src/client/sw.ts`, and the navigation storage key in `packages/web/src/client/performance.ts` if reusing an existing origin. Changing keys can strand pending edits; export or finish them first.
5. Set your own public auth URL and OAuth application configuration. Keep applicable MIT notices; review dependency/font licenses and resolve the [artwork publication prerequisite](releases.md#publication-prerequisites).

## Remove or replace the demos

Make this a coordinated change rather than deleting a directory and leaving a route or manifest lookup behind. Paths below are repository-relative.

| Layer                | Exact touchpoints                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pages and navigation | Replace `/`, `/journal`, `/about`, `/kanban` and their imports in `packages/web/src/server/pages.tsx`; update `Section` and links in `packages/web/src/components/Shell.tsx`. Demo-only components include `GardenHeading.tsx`, `JournalTimeline.tsx`, and `AboutArticle.tsx` in that components directory. Keep a valid home route.                                                                                   |
| Browser islands      | Remove/replace `packages/web/src/features/terrarium/`, `packages/web/src/features/kanban/`, `packages/web/src/islands/LiveStatusIsland.tsx`, and their entries `packages/web/src/client/garden.tsx`, `kanban.tsx`, `about.ts`. **Move the `global.css` import from `garden.tsx` to a retained entry** so shared Astryx/global CSS still builds. Retain shared hydration and Effect/XState helpers when used elsewhere. |
| Asset lookup         | Update `ClientEntryName` in `packages/web/src/server/pages.tsx` and `clientEntryNames`/`offlineRouteEntries` in `packages/web/src/server/assets.ts`. The Vite config discovers lowercase single-word entry filenames automatically, but the server's entry registry is explicit.                                                                                                                                       |
| API and persistence  | Remove/replace `Garden.ts` and `Kanban.ts` in `packages/contract/src/` and `packages/server/src/`; update contract `Api.ts`/`index.ts`, server handlers/exports in `src/index.ts`, and service wiring in `packages/web/src/server/main.ts`. Replace the Garden dependency in `/health/ready` rather than deleting readiness.                                                                                           |
| Admin                | Remove the garden statements/grants in `packages/contract/src/Access.ts`, reset endpoint in contract `Admin.ts`, reset handler/dependency in server `Admin.ts`, and garden panel entry/import in `packages/web/src/features/admin/panels.ts` plus `GardenPanel.tsx`. Preserve user administration and its server-side permission checks.                                                                               |
| PWA and images       | Update `HTML_ROUTES`/`OFFLINE_WARM_ROUTES` in `packages/web/src/client/sw.ts`, speculation links and apple-touch icon in server `Document.tsx`, manifest branding/icons in server `Pwa.ts`, and image precache in server `assets.ts`. Then remove or replace `packages/web/public/images/terrarium-whimsical.png` and `.webp`.                                                                                         |
| Tests and copy       | Update demo cases in `packages/server/src/services.test.ts` and `packages/web/src/features/kanban/kanban.test.ts`; preserve tests for retained services. Replace demo wording in docs and PWA metadata.                                                                                                                                                                                                                |

Existing `garden_state` and `kanban_state` tables do not disappear when code is removed. Retain them until a deliberate, backed-up data migration is approved. Search for remaining demo identifiers and paths, run checks/tests/build, and exercise retained pages and health endpoints. On a reused browser origin, test service-worker updates and old cached pages too.
