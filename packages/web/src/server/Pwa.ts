import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"

export interface PwaOptions {
  readonly version: string
  readonly script: string
  readonly assets: ReadonlyArray<string>
}

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <rect width="512" height="512" rx="128" fill="#eef1e6"/>
  <circle cx="256" cy="256" r="184" fill="#dfe6d2"/>
  <g transform="translate(116 116) scale(11.6667)" stroke="#243127" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 4C9 2 3 7 5 14c2 7 13 6 15-10ZM4 21 15 10M9 16v-5m0 5h5"/>
  </g>
</svg>`

const webManifest = JSON.stringify({
  id: "/",
  name: "Little world",
  short_name: "Little world",
  description: "A tiny interactive terrarium and garden journal.",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#f7f5ee",
  theme_color: "#f7f5ee",
  icons: [
    {
      src: "/icon.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any maskable",
    },
    {
      src: "/images/terrarium-whimsical.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
  ],
})

export function pwaRoutes(options: PwaOptions | (() => PwaOptions)) {
  const resolve = typeof options === "function" ? options : () => options
  return Layer.mergeAll(
    HttpRouter.add(
      "GET",
      "/manifest.webmanifest",
      HttpServerResponse.text(webManifest, {
        contentType: "application/manifest+json; charset=utf-8",
        headers: { "cache-control": "public, max-age=3600" },
      }),
    ),
    HttpRouter.add(
      "GET",
      "/icon.svg",
      HttpServerResponse.text(iconSvg, {
        contentType: "image/svg+xml; charset=utf-8",
        headers: { "cache-control": "public, max-age=86400" },
      }),
    ),
    HttpRouter.add(
      "GET",
      "/sw.js",
      Effect.sync(() => {
        const { version, script, assets } = resolve()
        const swSource = `globalThis.__PWA__=${JSON.stringify({ version, assets })};\n${script}`
        return HttpServerResponse.text(swSource, {
          contentType: "text/javascript; charset=utf-8",
          headers: { "cache-control": "no-cache" },
        })
      }),
    ),
  )
}
