import { createHash } from "node:crypto"
import { readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { Effect, Layer, Schedule, Stream } from "effect"
import { HttpRouter, HttpServerResponse, HttpStaticServer } from "effect/http"
import type { Assets, ClientEntryName, RouteEntryAssets } from "./pages.tsx"
import { type PwaOptions, pwaRoutes } from "./Pwa.ts"

interface ManifestEntry {
  readonly file: string
  readonly imports?: ReadonlyArray<string>
  readonly dynamicImports?: ReadonlyArray<string>
}

type Manifest = Record<string, ManifestEntry>

const clientEntryNames: ReadonlyArray<ClientEntryName> = [
  "garden",
  "kanban",
  "about",
  "login",
  "admin",
]

const offlineRouteEntries: ReadonlyArray<ClientEntryName> = ["garden", "kanban", "about"]

interface AssetSnapshot {
  readonly mtimeMs: number
  readonly css: string
  readonly cssPath: string
  readonly fonts: ReadonlyArray<string>
  readonly performance: string
  readonly entries: ReadonlyMap<ClientEntryName, RouteEntryAssets>
  readonly pwa: PwaOptions
}

const buildSnapshot = (clientDir: string, mtimeMs: number): AssetSnapshot => {
  const manifest: Manifest = JSON.parse(readFileSync(`${clientDir}.vite/manifest.json`, "utf8"))

  const resolveSource = (name: string) => {
    for (const candidate of [`src/client/${name}.tsx`, `src/client/${name}.ts`, name]) {
      if (manifest[candidate]) return candidate
    }
    throw new Error(`${name} is missing from the client build manifest`)
  }

  const asset = (source: string) => {
    const entry = manifest[source]
    if (!entry) throw new Error(`${source} is missing from the client build manifest`)
    return `/${entry.file}`
  }

  // The server graph contains every app StyleX rule, including non-hydrated pages.
  const css =
    readFileSync(`${clientDir}${asset("style.css").slice(1)}`, "utf8") +
    readFileSync(new URL("./assets/stylex.css", import.meta.url), "utf8")
  const cssHash = createHash("sha256").update(css).digest("hex").slice(0, 12)
  const cssPath = `/assets/style-${cssHash}.css`

  const fonts = Object.entries(manifest)
    .filter(([src]) => src.endsWith("-latin-wght-normal.woff2"))
    .map(([, entry]) => `/${entry.file}`)

  const preloads = (source: string): ReadonlyArray<string> => {
    const seen = new Set<string>()
    const visit = (key: string) => {
      for (const dependency of manifest[key]?.imports ?? []) {
        if (seen.has(dependency)) continue
        seen.add(dependency)
        visit(dependency)
      }
    }
    visit(source)
    return [...seen].map(asset)
  }

  const entries = new Map<ClientEntryName, RouteEntryAssets>()
  for (const name of clientEntryNames) {
    const source = resolveSource(name)
    entries.set(name, {
      script: asset(source),
      preloads: preloads(source),
    })
  }

  const performanceSource = resolveSource("performance")
  const performance = asset(performanceSource)
  const performancePreloads = preloads(performanceSource)

  const swFile = asset(resolveSource("sw")).slice(1)
  const swScript = readFileSync(`${clientDir}${swFile}`, "utf8")

  // Precache only the core shell and offline-warmed route chunks on install;
  // heavy or auth-only chunks (Three.js, admin, login) cache on demand via fetch.
  const pwaAssets = [
    ...new Set([
      cssPath,
      "/icon.svg",
      "/manifest.webmanifest",
      "/images/terrarium-whimsical.webp",
      ...fonts,
      performance,
      ...performancePreloads,
      ...offlineRouteEntries.flatMap((name) => {
        const route = entries.get(name)
        return route ? [route.script, ...route.preloads] : []
      }),
    ]),
  ]

  const allManifestFiles = Object.values(manifest)
    .map((entry) => entry.file)
    .sort()
    .join("\n")

  const pwaVersion = createHash("sha256")
    .update(swScript)
    .update(cssHash)
    .update(allManifestFiles)
    .digest("hex")
    .slice(0, 12)

  return {
    mtimeMs,
    css,
    cssPath,
    fonts,
    performance,
    entries,
    pwa: { version: pwaVersion, script: swScript, assets: pwaAssets },
  }
}

/** Reads the client build and keeps its URLs and serving policy together. */
export function loadAssets(options?: { readonly devReload?: boolean }) {
  const devReload = options?.devReload ?? false
  const immutable = "public, max-age=31536000, immutable"
  const clientDir = fileURLToPath(new URL("../client/", import.meta.url))
  const manifestPath = `${clientDir}.vite/manifest.json`

  let current = buildSnapshot(clientDir, statSync(manifestPath).mtimeMs)

  const getSnapshot = (): AssetSnapshot => {
    if (!devReload) return current
    try {
      const mtimeMs = statSync(manifestPath).mtimeMs
      if (mtimeMs !== current.mtimeMs) {
        current = buildSnapshot(clientDir, mtimeMs)
      }
    } catch {
      // Keep serving the previous snapshot if Vite is mid-write.
    }
    return current
  }

  const pages: Assets = {
    get css() {
      return getSnapshot().cssPath
    },
    get fonts() {
      return getSnapshot().fonts
    },
    get performance() {
      return getSnapshot().performance
    },
    devReload,
    entry(name) {
      const found = getSnapshot().entries.get(name)
      if (!found) throw new Error(`Unknown client entry "${name}"`)
      return found
    },
  }

  const encoder = new TextEncoder()
  const devReloadRoute = devReload
    ? HttpRouter.add(
        "GET",
        "/__dev/reload",
        Effect.sync(() => {
          const stream = Stream.fromSchedule(Schedule.spaced("400 millis")).pipe(
            Stream.prepend([0]),
            Stream.map(() => getSnapshot().pwa.version),
            Stream.changes,
            Stream.map((version) => encoder.encode(`event: build\ndata: ${version}\n\n`)),
          )
          return HttpServerResponse.stream(stream, {
            contentType: "text/event-stream; charset=utf-8",
            headers: {
              "cache-control": "no-cache",
              connection: "keep-alive",
            },
          })
        }),
      )
    : Layer.empty

  const routes = Layer.mergeAll(
    HttpRouter.add(
      "GET",
      "/assets/style-:hash.css",
      Effect.sync(() =>
        HttpServerResponse.text(getSnapshot().css, {
          contentType: "text/css; charset=utf-8",
          headers: { "cache-control": immutable },
        }),
      ),
    ),
    devReloadRoute,
    pwaRoutes(() => getSnapshot().pwa),
    HttpStaticServer.layer({
      root: `${clientDir}assets`,
      prefix: "/assets",
      cacheControl: immutable,
    }),
    HttpStaticServer.layer({
      root: `${clientDir}images`,
      prefix: "/images",
      cacheControl: "public, max-age=86400",
    }),
  )
  return { pages, routes }
}
