import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { Layer } from "effect"
import { HttpRouter, HttpServerResponse, HttpStaticServer } from "effect/http"
import type { Assets } from "./pages.tsx"
import { pwaRoutes } from "./Pwa.ts"

/** Reads the production build once and keeps its URLs and serving policy together. */
export function loadAssets() {
  const immutable = "public, max-age=31536000, immutable"
  const clientDir = fileURLToPath(new URL("../client/", import.meta.url))
  const manifest: Record<string, { file: string; imports?: string[]; dynamicImports?: string[] }> =
    JSON.parse(readFileSync(`${clientDir}.vite/manifest.json`, "utf8"))
  const asset = (source: string) => {
    const entry = manifest[source]
    if (!entry) throw new Error(`${source} is missing from the client build manifest`)
    return `/${entry.file}`
  }

  // The server graph contains every app StyleX rule, including non-hydrated pages.
  const css =
    readFileSync(`${clientDir}${asset("style.css").slice(1)}`, "utf8") +
    readFileSync(new URL("./assets/stylex.css", import.meta.url), "utf8")
  const cssPath: HttpRouter.PathInput = `/assets/style-${createHash("sha256").update(css).digest("hex").slice(0, 12)}.css`

  const preloads = (source: string) => {
    const seen = new Set<string>()
    const visit = (key: string) => {
      for (const dependency of manifest[key]?.imports ?? []) {
        if (seen.has(dependency)) continue
        seen.add(dependency)
        visit(dependency)
      }
    }
    visit(source)
    if (source === "src/client/garden.tsx") {
      for (const dependency of manifest[source]?.dynamicImports ?? []) {
        seen.add(dependency)
        visit(dependency)
      }
    }
    return [...seen].map(asset)
  }
  const pages: Assets = {
    css: cssPath,
    garden: asset("src/client/garden.tsx"),
    about: asset("src/client/about.ts"),
    login: asset("src/client/login.tsx"),
    admin: asset("src/client/admin.tsx"),
    performance: asset("src/client/performance.ts"),
    preloads: {
      garden: preloads("src/client/garden.tsx"),
      about: preloads("src/client/about.ts"),
      login: preloads("src/client/login.tsx"),
      admin: preloads("src/client/admin.tsx"),
    },
  }
  const swFile = asset("src/client/sw.ts").slice(1)
  const rawStyleFile = asset("style.css").slice(1)
  const swScript = readFileSync(`${clientDir}${swFile}`, "utf8")
  const pwaAssets = [
    cssPath,
    "/icon.svg",
    "/manifest.webmanifest",
    "/images/terrarium-whimsical.webp",
    ...new Set(
      Object.values(manifest)
        .map((entry) => entry.file)
        .filter((file) => file !== swFile && file !== rawStyleFile)
        .map((file) => `/${file}`),
    ),
  ]
  const pwaVersion = createHash("sha256")
    .update(swScript)
    .update(pwaAssets.join("\n"))
    .digest("hex")
    .slice(0, 12)

  const routes = Layer.mergeAll(
    HttpRouter.add(
      "GET",
      cssPath,
      HttpServerResponse.text(css, {
        contentType: "text/css; charset=utf-8",
        headers: { "cache-control": immutable },
      }),
    ),
    pwaRoutes({ version: pwaVersion, script: swScript, assets: pwaAssets }),
    HttpStaticServer.layer({
      root: `${clientDir}assets`,
      prefix: "/assets",
      cacheControl: immutable,
    }),
    HttpStaticServer.layer({ root: `${clientDir}images`, prefix: "/images" }),
  )
  return { pages, routes }
}
