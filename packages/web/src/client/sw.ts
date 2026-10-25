interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void
}

interface FetchEvent extends ExtendableEvent {
  readonly request: Request
  respondWith(response: Promise<Response> | Response): void
}

interface ServiceWorkerScope {
  readonly location: Location
  readonly caches: CacheStorage
  readonly clients: { claim(): Promise<void> }
  readonly __PWA__?: {
    readonly version: string
    readonly assets: ReadonlyArray<string>
    readonly pages: ReadonlyArray<string>
  }
  skipWaiting(): Promise<void>
  addEventListener(type: "install" | "activate", listener: (event: ExtendableEvent) => void): void
  addEventListener(type: "fetch", listener: (event: FetchEvent) => void): void
}

const sw = globalThis as unknown as ServiceWorkerScope
const config = sw.__PWA__ ?? { version: "dev", assets: [], pages: [] }
const CACHE_PREFIX = "little-world-"
const CACHE_NAME = `${CACHE_PREFIX}${config.version}`

// Injected by the server from the `offline` sections in components/sections.ts.
const HTML_ROUTES = config.pages
const OFFLINE_WARM_ROUTES = [...HTML_ROUTES, "/api/garden", "/api/kanban", "/api/hello"]
const NETWORK_FIRST_PATHS = new Set(OFFLINE_WARM_ROUTES)

let authGeneration = 0
const snapshotVersions = new Map<string, number>()
const snapshotSuccesses = new Map<string, number>()

const isImmutablePath = (pathname: string) =>
  pathname.startsWith("/assets/") ||
  pathname.startsWith("/images/") ||
  pathname === "/icon.svg" ||
  pathname === "/manifest.webmanifest"

const cachePut = async (
  request: Request | string,
  response: Response,
  generation = authGeneration,
  isCurrent = () => true,
) => {
  if (!response.ok || generation !== authGeneration || !isCurrent()) return response
  const cache = await sw.caches.open(CACHE_NAME)
  if (generation !== authGeneration || !isCurrent()) return response
  await cache.put(request, response.clone())
  return response
}

const fetchSnapshot = async (
  path: string,
  request: Request | string,
  generation = authGeneration,
) => {
  const version = (snapshotVersions.get(path) ?? 0) + 1
  snapshotVersions.set(path, version)
  // A successful realtime refetch must reach the network, not the HTTP cache.
  const response = await fetch(request, { credentials: "same-origin", cache: "no-store" })
  if (response.ok && generation === authGeneration) {
    snapshotSuccesses.set(path, Math.max(snapshotSuccesses.get(path) ?? 0, version))
  }
  return cachePut(path, response, generation, () => snapshotSuccesses.get(path) === version)
}

const refreshOfflineRoutes = async (generation = authGeneration) => {
  await Promise.allSettled(OFFLINE_WARM_ROUTES.map((path) => fetchSnapshot(path, path, generation)))
}

const invalidatePersonalizedPages = async () => {
  const generation = ++authGeneration
  const cache = await sw.caches.open(CACHE_NAME)
  await Promise.all(HTML_ROUTES.map((path) => cache.delete(path)))
  await refreshOfflineRoutes(generation)
}

sw.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await sw.caches.open(CACHE_NAME)
      await cache.addAll(config.assets)
      await refreshOfflineRoutes()
      await sw.skipWaiting()
    })(),
  )
})

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await sw.caches.keys()
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => sw.caches.delete(key)),
      )
      await sw.clients.claim()
    })(),
  )
})

if (typeof BroadcastChannel !== "undefined") {
  const channel = new BroadcastChannel("playground-garden")
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (
      event.data === "garden-mutated" ||
      event.data === "kanban-mutated" ||
      event.data === "theme-mutated"
    ) {
      void refreshOfflineRoutes()
    }
  }
}

sw.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (url.origin !== sw.location.origin) return

  // Streaming responses must never enter either snapshot or immutable caches.
  if (url.pathname === "/api/events") {
    event.respondWith(fetch(request, { cache: "no-store" }))
    return
  }

  if (
    request.method !== "GET" &&
    (url.pathname === "/logout" || url.pathname.startsWith("/api/auth/"))
  ) {
    event.respondWith(
      (async () => {
        const response = await fetch(request)
        event.waitUntil(invalidatePersonalizedPages())
        return response
      })(),
    )
    return
  }

  if (request.method !== "GET") return

  if (isImmutablePath(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await sw.caches.match(request)
        if (cached) return cached
        return cachePut(request, await fetch(request))
      })(),
    )
    return
  }

  if (NETWORK_FIRST_PATHS.has(url.pathname)) {
    const generation = authGeneration
    const networkOnly = request.headers.get("x-playground-network-only") === "true"
    event.respondWith(
      (async () => {
        try {
          return await fetchSnapshot(url.pathname, request, generation)
        } catch (error) {
          // A cached snapshot cannot satisfy an SSE resync. Leave the domain's
          // freshness requirement pending until a later successful network read.
          if (networkOnly) throw error
          const cached = (await sw.caches.match(url.pathname)) ?? (await sw.caches.match(request))
          if (cached) return cached
          throw new Error(`Offline and no cached response for ${url.pathname}`)
        }
      })(),
    )
  }
})
