import { KanbanCard } from "@playground/contract"
import { Schema } from "effect"
import {
  createFreshnessChannel,
  createOfflineStorage,
  createSnapshotToken,
  withNavigatorLock,
} from "../../machines/offlineSync.ts"

export { createSnapshotToken }

export const KanbanOfflineSnapshot = Schema.Struct({
  token: Schema.String,
  cards: Schema.Array(KanbanCard),
  updatedAt: Schema.Date,
  pendingSave: Schema.Boolean,
})
export type KanbanOfflineSnapshot = typeof KanbanOfflineSnapshot.Type

const storage = createOfflineStorage({
  storageKey: "playground:kanban-offline",
  channelName: "playground-kanban-offline",
  schema: KanbanOfflineSnapshot,
  isPending: (snapshot) => snapshot.pendingSave,
  canClear: (next, current) => current !== null && current.token === next.token,
})

const freshness = createFreshnessChannel("kanban-mutated")

export const publishKanbanMutation = freshness.publish
export const watchKanbanFreshness = freshness.watch
export const loadKanbanOfflineSnapshot = storage.load
export const saveKanbanOfflineSnapshot = storage.save
export const watchKanbanOfflineSnapshots = storage.watch
export const acknowledgeKanbanSnapshot = (token: string) =>
  storage.clearIf((current) => current.token === token)
export const withKanbanSyncLock = withNavigatorLock("playground:kanban-sync")
