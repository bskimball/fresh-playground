# AGENTS.md

## Stack

- XState for any relatively complex state.
- EffectTS everywhere possible.
- `AtomHttpApi` (`effect/reactivity`) with `@effect/atom-react` for data fetching.
- Vite+ for commands.
- Astryx components, StyleX styling.

## Naming

- PascalCase: React component files and named API/service/schema modules (`TerrariumIsland.tsx`, `ApiClient.ts`, `Garden.ts`).
- camelCase: utilities (`fromEffect.ts`).
- Lowercase single word: entry files (`main.ts`) and feature route modules (`routes.tsx`).
- kebab-case: directories and standalone JS scene modules (`terrarium-scene.js`).
- Role suffixes: `.machine.ts`, `.stylex.ts`.
- Keep framework and config filenames as the tool defines them.

## Structure

- `packages/contract`: shared API contracts and schemas; `packages/server`: services and API handlers; `packages/web`: pages, islands, and browser code.
- Keep feature-specific routes, components, state machines, and helpers together under `src/features/<feature>`; put shared UI in `src/components` and keep browser entries thin.

## Formatting

Follow the `fmt` and `lint` config in the root `vite.config.ts` (Oxfmt, Oxlint) and `.editorconfig`.

## Task guides

- Add routes, islands, contracts, services, or admin panels: use [.agents/skills/add-feature/SKILL.md](.agents/skills/add-feature/SKILL.md), with [docs/development.md](docs/development.md) as the canonical recipe.
- Verify a change or prepare release evidence: use [.agents/skills/verify-change/SKILL.md](.agents/skills/verify-change/SKILL.md).
- Change persistence, auth, or offline behavior: read [docs/architecture.md](docs/architecture.md). Configure production, SMTP, backups, or rollback: read [docs/deployment.md](docs/deployment.md).
- Rename/remove demos: read [docs/getting-started.md](docs/getting-started.md). Prepare publication/versioning: read [docs/releases.md](docs/releases.md), including the unresolved artwork-rights prerequisite.
