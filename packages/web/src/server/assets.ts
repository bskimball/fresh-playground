import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerResponse, HttpStaticServer } from "effect/http"
import { type IslandName, islandRegistry } from "../client/islandRegistry.ts"
import { offlinePaths } from "../components/sections.ts"
import type { Assets } from "./Page.ts"
import { type PwaOptions, pwaRoutes } from "./Pwa.ts"

interface ManifestEntry {
  readonly file: string
  readonly imports?: ReadonlyArray<string>
  readonly dynamicImports?: ReadonlyArray<string>
}

type Manifest = Record<string, ManifestEntry>

const islandNames = Object.keys(islandRegistry) as ReadonlyArray<IslandName>

interface AssetSnapshot {
  readonly css: string
  readonly cssPath: string
  readonly fonts: ReadonlyArray<string>
  readonly performance: string
  readonly performancePreloads: ReadonlyArray<string>
  readonly islands: ReadonlyMap<IslandName, ReadonlyArray<string>>
  readonly pwa: PwaOptions
}

const buildSnapshot = (clientDir: string): AssetSnapshot => {
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

  const islands = new Map<IslandName, ReadonlyArray<string>>()
  for (const name of islandNames) {
    const { source } = islandRegistry[name]
    if (!manifest[source]) {
      throw new Error(
        `Island "${name}": source "${source}" is not in the client build manifest; it must be the module its load() imports`,
      )
    }
    islands.set(name, [asset(source), ...preloads(source)])
  }

  const performanceSource = resolveSource("performance")
  const performance = asset(performanceSource)
  const performancePreloads = preloads(performanceSource)

  const swFile = asset(resolveSource("sw")).slice(1)
  const swScript = readFileSync(`${clientDir}${swFile}`, "utf8")

  // Precache only the core shell and offline-warmed island chunks on install;
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
      ...islandNames
        .filter((name) => islandRegistry[name].offline)
        .flatMap((name) => islands.get(name) ?? []),
    ]),
  ]

  const allManifestFiles = Object.values(manifest)
    .map((entry) => entry.file)
    .sort()
    .join("\n")

  const pwaVersion = createHash("sha256")
    .update(swScript)
    .update(offlinePaths.join("\n"))
    .update(cssHash)
    .update(allManifestFiles)
    .digest("hex")
    .slice(0, 12)

  return {
    css,
    cssPath,
    fonts,
    performance,
    performancePreloads,
    islands,
    pwa: { version: pwaVersion, script: swScript, assets: pwaAssets, pages: offlinePaths },
  }
}

/** Reads the client build and keeps its URLs and serving policy together. */
export function loadAssets() {
  const immutable = "public, max-age=31536000, immutable"
  const clientDir = fileURLToPath(new URL("../client/", import.meta.url))
  const snapshot = buildSnapshot(clientDir)

  const pages: Assets = {
    css: snapshot.cssPath,
    fonts: snapshot.fonts,
    performance: snapshot.performance,
    preloadsFor(names) {
      const result = new Set<string>(snapshot.performancePreloads)
      for (const name of names) {
        const found = snapshot.islands.get(name)
        if (!found) throw new Error(`Unknown island "${name}"`)
        for (const href of found) result.add(href)
      }
      return [...result]
    },
  }

  const routes = Layer.mergeAll(
    HttpRouter.add(
      "GET",
      "/assets/style-:hash.css",
      Effect.sync(() =>
        HttpServerResponse.text(snapshot.css, {
          contentType: "text/css; charset=utf-8",
          headers: { "cache-control": immutable },
        }),
      ),
    ),
    pwaRoutes(snapshot.pwa),
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
