import type { EventTopic } from "@playground/contract"
import { Effect, Option, Schema } from "effect"
import { watchRealtime } from "../client/Realtime.ts"

const tabId = Math.random().toString(36).slice(2)
export const SW_MUTATION_CHANNEL = "playground-garden"

export function schemaJsonCodec<T, E>(schema: Schema.Codec<T, E>) {
  const codec = Schema.toCodecJson(schema)
  return {
    encode: Schema.encodeSync(codec),
    decode: Schema.decodeUnknownSync(codec),
  }
}

export const createSnapshotToken = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export const withNavigatorLock =
  (lockName: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.acquireUseRelease(
      Effect.callback<() => void>((resume) => {
        if (typeof navigator === "undefined" || !("locks" in navigator) || !navigator.locks) {
          resume(Effect.succeed(() => {}))
          return
        }
        const controller = new AbortController()
        void navigator.locks
          .request(
            lockName,
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

export function createOfflineStorage<T, E>(options: {
  readonly storageKey: string
  readonly channelName: string
  readonly schema: Schema.Codec<T, E>
  readonly isPending: (snapshot: T) => boolean
  readonly canClear?: (next: T, current: T | null) => boolean
}) {
  const codec = Schema.toCodecJson(options.schema)
  const encode = Schema.encodeSync(codec)
  const decode = Schema.decodeUnknownOption(codec)

  const notifyTabs = () => {
    if (typeof BroadcastChannel === "undefined") return
    const channel = new BroadcastChannel(options.channelName)
    channel.postMessage(tabId)
    channel.close()
  }

  const load = (): T | null => {
    if (typeof localStorage === "undefined") return null
    try {
      const raw = localStorage.getItem(options.storageKey)
      if (!raw) return null
      const parsed = decode(JSON.parse(raw))
      if (Option.isNone(parsed)) {
        localStorage.removeItem(options.storageKey)
        return null
      }
      const snapshot = parsed.value
      if (!options.isPending(snapshot)) {
        localStorage.removeItem(options.storageKey)
        return null
      }
      return snapshot
    } catch {
      return null
    }
  }

  const save = (snapshot: T): boolean => {
    if (typeof localStorage === "undefined") return false
    try {
      if (!options.isPending(snapshot)) {
        const allowClear = options.canClear ? options.canClear(snapshot, load()) : true
        if (allowClear && localStorage.getItem(options.storageKey) !== null) {
          localStorage.removeItem(options.storageKey)
          notifyTabs()
        }
        return true
      }
      const nextRaw = JSON.stringify(encode(snapshot))
      if (localStorage.getItem(options.storageKey) !== nextRaw) {
        localStorage.setItem(options.storageKey, nextRaw)
        notifyTabs()
      }
      return true
    } catch {
      // Ignore storage quota or private-mode errors.
      return false
    }
  }

  const clearIf = (predicate: (current: T) => boolean) => {
    if (typeof localStorage === "undefined") return
    try {
      const current = load()
      if (current !== null && predicate(current)) {
        localStorage.removeItem(options.storageKey)
        notifyTabs()
      }
    } catch {
      // Ignore storage errors.
    }
  }

  const watch = (onUpdate: (snapshot: T | null) => void) => {
    if (typeof BroadcastChannel === "undefined") return () => {}
    const channel = new BroadcastChannel(options.channelName)
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (event.data === tabId) return
      onUpdate(load())
    }
    return () => {
      channel.close()
    }
  }

  return { load, save, clearIf, watch }
}

// Only these public domain channels participate in SSE. Theme and any other
// document-only events must never become server topics by string convention.
const freshnessTopics = new Map<string, EventTopic>([
  ["garden-mutated", "garden"],
  ["kanban-mutated", "kanban"],
])

export function createFreshnessChannel(eventName: string) {
  const topic = freshnessTopics.get(eventName)
  const publish = () => {
    if (typeof window === "undefined") return
    window.dispatchEvent(new Event(eventName))
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(SW_MUTATION_CHANNEL)
      channel.postMessage(eventName)
      channel.close()
    }
  }

  const watch = (refresh: () => void) => {
    const visible = () => {
      if (document.visibilityState === "visible") refresh()
    }
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) refresh()
    }
    const channel =
      typeof BroadcastChannel === "undefined"
        ? undefined
        : new BroadcastChannel(SW_MUTATION_CHANNEL)
    if (channel) {
      channel.onmessage = (event: MessageEvent<unknown>) => {
        if (event.data === eventName) refresh()
      }
    }
    const stopRealtime = topic === undefined ? () => {} : watchRealtime(topic, refresh)
    document.addEventListener("visibilitychange", visible)
    window.addEventListener("online", refresh)
    window.addEventListener("pageshow", restored)
    window.addEventListener(eventName, refresh)
    refresh()
    return () => {
      stopRealtime()
      channel?.close()
      document.removeEventListener("visibilitychange", visible)
      window.removeEventListener("online", refresh)
      window.removeEventListener("pageshow", restored)
      window.removeEventListener(eventName, refresh)
    }
  }

  return { publish, watch }
}
