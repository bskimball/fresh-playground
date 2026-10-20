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
- Lowercase single word: entry files (`main.ts`).
- kebab-case: directories and standalone JS scene modules (`terrarium-scene.js`).
- Role suffixes: `.machine.ts`, `.stylex.ts`.
- Keep framework and config filenames as the tool defines them.

## Structure

- `packages/contract`: shared API contracts and schemas; `packages/server`: services and API handlers; `packages/web`: pages, islands, and browser code.
- Keep feature-specific components, state machines, and helpers together under `src/features/<feature>`; put shared UI in `src/components` and keep browser entries thin.

## Formatting

Follow the `fmt` and `lint` config in the root `vite.config.ts` (Oxfmt, Oxlint) and `.editorconfig`.
