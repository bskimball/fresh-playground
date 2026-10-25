import {
  EVENTS_PATH,
  type EventTopic,
  InvalidationPayload,
  ResyncPayload,
} from "@playground/contract"
import { Option, Schema } from "effect"

const decodeInvalidation = Schema.decodeUnknownOption(Schema.fromJsonString(InvalidationPayload))
const decodeResync = Schema.decodeUnknownOption(Schema.fromJsonString(ResyncPayload))

/** Decode only the two public invalidation messages; heartbeats do not refresh queries. */
export const decodeRealtimeTopics = (event: string, data: unknown): ReadonlyArray<EventTopic> => {
  if (event === "invalidate") {
    const decoded = decodeInvalidation(data)
    return Option.isSome(decoded) ? [decoded.value.topic] : []
  }
  if (event === "resync") {
    const decoded = decodeResync(data)
    return Option.isSome(decoded) ? [...new Set(decoded.value.topics)] : []
  }
  return []
}

export const realtimeTopicForPath = (pathname: string): EventTopic | undefined => {
  if (pathname === "/api/garden") return "garden"
  if (pathname === "/api/kanban") return "kanban"
  return undefined
}

const listeners = new Map<EventTopic, Set<() => void>>()
const revisions: Record<EventTopic, number> = { garden: 0, kanban: 0 }
const dirty = new Set<EventTopic>()
let source: EventSource | undefined
let reconnectTimer: ReturnType<typeof setTimeout> | undefined
let attached = false
let suspended = false
let disposed = false

/** Capture before a query starts; only a network success for this revision clears the requirement. */
export const realtimeReadPolicy = (topic: EventTopic) => ({
  revision: revisions[topic],
  networkOnly: dirty.has(topic),
})

export const acknowledgeRealtimeRead = (topic: EventTopic, revision: number) => {
  if (revisions[topic] === revision) dirty.delete(topic)
}

const invalidate = (topics: ReadonlyArray<EventTopic>) => {
  for (const topic of topics) {
    revisions[topic] += 1
    dirty.add(topic)
    // Notify only this document. Re-broadcasting through the local mutation channel
    // would make every tab refetch once for every other tab's SSE connection.
    for (const refresh of listeners.get(topic) ?? []) refresh()
  }
}

const receive = (event: Event) => {
  if (event instanceof MessageEvent) invalidate(decodeRealtimeTopics(event.type, event.data))
}

const close = () => {
  clearTimeout(reconnectTimer)
  reconnectTimer = undefined
  source?.close()
  source = undefined
}

const connect = () => {
  if (disposed || suspended || listeners.size === 0 || typeof EventSource === "undefined") return
  if (source && source.readyState !== EventSource.CLOSED) return
  close()
  try {
    source = new EventSource(EVENTS_PATH)
  } catch {
    // Restricted browsers still retain the existing focus/online/local freshness path.
    return
  }
  const connection = source
  connection.addEventListener("invalidate", receive)
  connection.addEventListener("resync", receive)
  connection.addEventListener("error", () => {
    // A failed service-worker stream can permanently close EventSource instead of
    // entering native reconnect. A fresh connection receives the server's resync.
    if (source !== connection || connection.readyState !== EventSource.CLOSED) return
    clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(connect, 3000)
  })
  let opened = false
  connection.addEventListener("open", () => {
    // A recovered server may have no events to replay, but local writes can still
    // be queued from the outage. Re-enter the existing synchronization workflow.
    if (opened) invalidate([...listeners.keys()])
    opened = true
  })
  // Native reconnection carries Last-Event-ID, including the server's bounded
  // connection retirement. A newly created source instead gets an explicit resync.
}

const pagehide = () => {
  suspended = true
  close()
}
const pageshow = () => {
  suspended = false
  connect()
}

const detach = () => {
  close()
  if (!attached) return
  window.removeEventListener("pagehide", pagehide)
  window.removeEventListener("pageshow", pageshow)
  window.removeEventListener("online", connect)
  attached = false
  suspended = false
}

/** One reference-counted EventSource per document, shared by all domain freshness watchers. */
export const watchRealtime = (topic: EventTopic, refresh: () => void) => {
  if (disposed || typeof window === "undefined" || typeof EventSource === "undefined")
    return () => {}
  let subscribers = listeners.get(topic)
  if (!subscribers) {
    subscribers = new Set()
    listeners.set(topic, subscribers)
  }
  // Each subscription owns a distinct callback, even when callers reuse a function.
  const notify = () => refresh()
  subscribers.add(notify)
  if (!attached) {
    window.addEventListener("pagehide", pagehide)
    window.addEventListener("pageshow", pageshow)
    window.addEventListener("online", connect)
    attached = true
  }
  connect()
  let active = true
  return () => {
    if (!active) return
    active = false
    subscribers.delete(notify)
    if (subscribers.size === 0) listeners.delete(topic)
    if (listeners.size === 0) detach()
  }
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disposed = true
    detach()
    listeners.clear()
  })
}
