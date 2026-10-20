import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { Layer } from "effect"
import { HttpRouter, HttpServerResponse, HttpStaticServer } from "effect/http"
import type { Assets } from "./pages.tsx"

/** Reads the production build once and keeps its URLs and serving policy together. */
export function loadAssets() {
  const immutable = "public, max-age=31536000, immutable"
  const clientDir = fileURLToPath(new URL("../client/", import.meta.url))
  const manifest: Record<string, { file: string }> = JSON.parse(
    readFileSync(`${clientDir}.vite/manifest.json`, "utf8"),
  )
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

  const pages: Assets = {
    css: cssPath,
    garden: asset("src/client/garden.tsx"),
    about: asset("src/client/about.ts"),
  }
  const routes = Layer.mergeAll(
    HttpRouter.add(
      "GET",
      cssPath,
      HttpServerResponse.text(css, {
        contentType: "text/css; charset=utf-8",
        headers: { "cache-control": immutable },
      }),
    ),
    HttpStaticServer.layer({
      root: `${clientDir}assets`,
      prefix: "/assets",
      cacheControl: immutable,
    }),
    HttpStaticServer.layer({ root: `${clientDir}images`, prefix: "/images" }),
  )
  return { pages, routes }
}
