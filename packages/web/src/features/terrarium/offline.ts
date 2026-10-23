import { Garden, Sunlight } from "@playground/contract"
import { Effect, Option, Schema } from "effect"

const STORAGE_KEY = "playground:garden-offline"
const OFFLINE_CHANNEL = "playground-garden-offline"
const SYNC_LOCK = "playground:garden-sync"

export const OfflineSnapshot = Schema.Struct({
  garden: Garden,
  sunlight: Sunlight,
  night: Schema.Boolean,
  pendingWaters: Schema.Int,
  pendingSettings: Schema.Boolean,
})
export type OfflineSnapshot = typeof OfflineSnapshot.Type

const codec = Schema.toCodecJson(OfflineSnapshot)
const encodeSnapshot = Schema.encodeSync(codec)
const decodeSnapshot = Schema.decodeUnknownOption(codec)

const tabId = Math.random().toString(36).slice(2)

const notifyTabs = () => {
  if (typeof BroadcastChannel === "undefined") return
  const channel = new BroadcastChannel(OFFLINE_CHANNEL)
  channel.postMessage(tabId)
  channel.close()
}

export function loadOfflineSnapshot(): OfflineSnapshot | null {
  if (typeof localStorage === "undefined") return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = decodeSnapshot(JSON.parse(raw))
    if (Option.isNone(parsed)) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    const snapshot = parsed.value
    if (snapshot.pendingWaters <= 0 && !snapshot.pendingSettings) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return snapshot
  } catch {
    return null
  }
}

export function saveOfflineSnapshot(snapshot: OfflineSnapshot) {
  if (typeof localStorage === "undefined") return
  try {
    if (snapshot.pendingWaters <= 0 && !snapshot.pendingSettings) {
      if (localStorage.getItem(STORAGE_KEY) !== null) {
        localStorage.removeItem(STORAGE_KEY)
        notifyTabs()
      }
      return
    }
    const nextRaw = JSON.stringify(encodeSnapshot(snapshot))
    if (localStorage.getItem(STORAGE_KEY) !== nextRaw) {
      localStorage.setItem(STORAGE_KEY, nextRaw)
      notifyTabs()
    }
  } catch {
    // Ignore storage quota or private-mode errors.
  }
}

export function watchOfflineSnapshots(onUpdate: (snapshot: OfflineSnapshot | null) => void) {
  if (typeof BroadcastChannel === "undefined") return () => {}
  const channel = new BroadcastChannel(OFFLINE_CHANNEL)
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (event.data === tabId) return
    onUpdate(loadOfflineSnapshot())
  }
  return () => {
    channel.close()
  }
}

export const withSyncLock = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.acquireUseRelease(
    Effect.callback<() => void>((resume) => {
      if (typeof navigator === "undefined" || !("locks" in navigator) || !navigator.locks) {
        resume(Effect.succeed(() => {}))
        return
      }
      const controller = new AbortController()
      void navigator.locks
        .request(
          SYNC_LOCK,
          { signal: controller.signal },
          () =>
            new Promise<void>((release) => {
              resume(Effect.succeed(release))
            }),
        )
        .catch(() => {})
      return Effect.sync(() => controller.abort())
    }),
    () => effect,
    (release) => Effect.sync(release),
  )
