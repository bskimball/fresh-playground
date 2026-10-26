import type { RegisteredIsland } from "./hydrateIsland.ts"

export interface IslandManifestEntry<Name extends string = string> {
  /** Module path in the Vite manifest; resolves the chunk to preload and precache. */
  readonly source: string
  /** Precache the chunk when the service worker installs. */
  readonly offline: boolean
  readonly load: () => Promise<RegisteredIsland<Name>>
}

// Each key must match the name its loaded island was defined with.
const registry = <const R extends { readonly [K in keyof R]: IslandManifestEntry<K & string> }>(
  entries: R,
) => entries

/** The one place an island is registered. `performance.ts` boots from it; `assets.ts` preloads from it. */
export const islandRegistry = registry({
  terrarium: {
    source: "src/features/terrarium/TerrariumIsland.tsx",
    offline: true,
    load: () => import("../features/terrarium/TerrariumIsland.tsx").then((m) => m.terrariumIsland),
  },
  kanban: {
    source: "src/features/kanban/KanbanIsland.tsx",
    offline: true,
    load: () => import("../features/kanban/KanbanIsland.tsx").then((m) => m.kanbanIsland),
  },
  "live-status": {
    source: "src/islands/LiveStatusIsland.tsx",
    offline: true,
    load: () => import("../islands/LiveStatusIsland.tsx").then((m) => m.liveStatusIsland),
  },
  login: {
    source: "src/features/auth/LoginIsland.tsx",
    offline: false,
    load: () => import("../features/auth/LoginIsland.tsx").then((m) => m.loginIsland),
  },
  files: {
    source: "src/features/files/FilesIsland.tsx",
    offline: false,
    load: () => import("../features/files/FilesIsland.tsx").then((m) => m.filesIsland),
  },
  "admin-panel": {
    source: "src/features/admin/panels.ts",
    offline: false,
    load: () => import("../features/admin/panels.ts").then((m) => m.adminPanelIsland),
  },
})

export type IslandName = keyof typeof islandRegistry
