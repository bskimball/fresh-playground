import { Garden, Sunlight } from "@playground/contract"
import { Schema } from "effect"
import { createOfflineStorage, withNavigatorLock } from "../../machines/offlineSync.ts"

export const OfflineSnapshot = Schema.Struct({
  garden: Garden,
  sunlight: Sunlight,
  night: Schema.Boolean,
  pendingWaters: Schema.Int,
  pendingSettings: Schema.Boolean,
})
export type OfflineSnapshot = typeof OfflineSnapshot.Type

const storage = createOfflineStorage({
  storageKey: "playground:garden-offline",
  channelName: "playground-garden-offline",
  schema: OfflineSnapshot,
  isPending: (snapshot) => snapshot.pendingWaters > 0 || snapshot.pendingSettings,
})

export const loadOfflineSnapshot = storage.load
export const saveOfflineSnapshot = storage.save
export const watchOfflineSnapshots = storage.watch
export const withSyncLock = withNavigatorLock("playground:garden-sync")
