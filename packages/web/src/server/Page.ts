import { Auth, webHeaders } from "@playground/server"
import { Context, Effect, Layer, Option } from "effect"
import { type HttpServerRequest, HttpServerResponse } from "effect/http"
import type { ReactNode } from "react"
import type { IslandName } from "../client/islandRegistry.ts"
import type { Section } from "../components/sections.ts"
import type { Viewer } from "../components/Shell.tsx"
import { themeFromCookie } from "../components/themePreference.ts"
import { panelsFor } from "../features/admin/panels.ts"
import { type OpenGraphMeta, renderDocument } from "./Document.tsx"

/** Built client files, from the Vite manifest. */
export interface Assets {
  readonly css: string
  readonly fonts: ReadonlyArray<string>
  readonly performance: string
  readonly preloadsFor: (islands: Iterable<IslandName>) => ReadonlyArray<string>
  /** Dev only: Vite's HTML transform, which adds its client, React Refresh, and StyleX. */
  readonly transformHtml?: ((url: string, html: string) => Promise<string>) | undefined
}

export interface PageOptions {
  readonly title: string
  readonly description?: string | undefined
  readonly canonical?: string | undefined
  readonly openGraph?: OpenGraphMeta | undefined
  readonly current: Section
  /** Omit to look up the signed-in viewer; pass it when the route already did. */
  readonly viewer?: Option.Option<Viewer>
  readonly status?: number
  readonly headers?: Readonly<Record<string, string>> | undefined
  readonly children: ReactNode
}

type Request = HttpServerRequest.HttpServerRequest

/** Renders full pages for feature routes: document, theme, viewer, assets, and caching. */
export class Page extends Context.Service<
  Page,
  {
    readonly viewer: (request: Request) => Effect.Effect<Option.Option<Viewer>>
    readonly render: (
      request: Request,
      options: PageOptions,
    ) => Effect.Effect<HttpServerResponse.HttpServerResponse>
  }
>()("web/Page") {
  static readonly layer = (assets: Assets) =>
    Layer.effect(
      Page,
      Effect.gen(function* () {
        const auth = yield* Auth

        const viewer = (request: Request) =>
          Effect.map(
            auth.session(webHeaders(request)),
            Option.map((user): Viewer => ({ user, isAdmin: panelsFor(user.role).length > 0 })),
          )

        const render = (request: Request, options: PageOptions) =>
          Effect.gen(function* () {
            const { viewer: known, status = 200, headers, ...document } = options
            const signedIn = known ?? (yield* viewer(request))
            const html = renderDocument({
              theme: themeFromCookie(request.headers.cookie ?? ""),
              css: assets.css,
              fonts: assets.fonts,
              performance: assets.performance,
              preloadsFor: assets.preloadsFor,
              viewer: Option.getOrUndefined(signedIn),
              ...document,
            })
            const transform = assets.transformHtml
            const baseResponse = HttpServerResponse.html(
              transform ? yield* Effect.promise(() => transform(request.url, html)) : html,
            ).pipe(
              HttpServerResponse.setStatus(status),
              // The header shows who is signed in, so shared caches must not store pages.
              HttpServerResponse.setHeader("cache-control", "private, no-cache"),
            )
            return headers ? HttpServerResponse.setHeaders(baseResponse, headers) : baseResponse
          })

        return Page.of({ viewer, render })
      }),
    )
}
