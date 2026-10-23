import { Garden as GardenSchema } from "@playground/contract"
import { Auth, Garden, webHeaders } from "@playground/server"
import { Effect, Option, Schema } from "effect"
import { HttpRouter, type HttpServerRequest, HttpServerResponse } from "effect/http"
import type { ReactNode } from "react"
import { renderToString } from "react-dom/server"
import { AboutArticle } from "../components/AboutArticle.tsx"
import { GardenHeading } from "../components/GardenHeading.tsx"
import { ThemePreferenceContext, themeFromCookie } from "../components/themePreference.ts"
import { JournalTimeline } from "../components/JournalTimeline.tsx"
import type { Section, Viewer } from "../components/Shell.tsx"
import { AdminLayout } from "../features/admin/AdminLayout.tsx"
import { type AdminPanel, adminPanels, panelsFor } from "../features/admin/panels.ts"
import LoginIsland, { type LoginProps } from "../features/auth/LoginIsland.tsx"
import TerrariumIsland from "../features/terrarium/TerrariumIsland.tsx"
import LiveStatusIsland from "../islands/LiveStatusIsland.tsx"
import { Document, Island } from "./Document.tsx"

/** Built client files, from the Vite manifest. */
export interface Assets {
  readonly css: string
  readonly garden: string
  readonly about: string
  readonly login: string
  readonly admin: string
  readonly performance: string
  readonly preloads: {
    readonly garden: string[]
    readonly about: string[]
    readonly login: string[]
    readonly admin: string[]
  }
}

const encodeGarden = Schema.encodeSync(Schema.toCodecJson(GardenSchema))

const searchParams = (request: HttpServerRequest.HttpServerRequest) =>
  new URL(request.url, "http://localhost").searchParams

const localOrigin = "http://local.invalid"

/**
 * Only same-origin paths are followed after sign-in. Parsing the way a browser
 * does catches `/\evil`, `/%09/evil` and similar tricks that become `//evil`.
 * The normalized path is checked too: `/..//evil` keeps the origin but
 * normalizes to `//evil`, which the browser then reads as another host.
 */
const safeNext = (value: string | null) => {
  if (value === null || !value.startsWith("/")) return "/"
  const url = URL.parse(value, localOrigin)
  if (url?.origin !== localOrigin || url.pathname.startsWith("//")) return "/"
  return `${url.pathname}${url.search}${url.hash}`
}

export const PageRoutes = (assets: Assets) =>
  HttpRouter.use(
    Effect.fn(function* (router) {
      const garden = yield* Garden
      const auth = yield* Auth

      const viewerFor = (request: HttpServerRequest.HttpServerRequest) =>
        Effect.map(
          auth.session(webHeaders(request)),
          Option.map((user): Viewer => ({ user, isAdmin: panelsFor(user.role).length > 0 })),
        )

      const themeFor = (request: HttpServerRequest.HttpServerRequest) =>
        themeFromCookie(request.headers.cookie ?? "")
      const renderIsland = (request: HttpServerRequest.HttpServerRequest, children: ReactNode) =>
        renderToString(
          <ThemePreferenceContext value={themeFor(request)}>{children}</ThemePreferenceContext>,
        )

      const page = (
        request: HttpServerRequest.HttpServerRequest,
        options: {
          title: string
          current: Section
          viewer: Option.Option<Viewer>
          script?: string
          preloads?: string[]
          status?: number
          children: ReactNode
        },
      ) => {
        const { viewer, status = 200, ...document } = options
        return HttpServerResponse.html(
          `<!DOCTYPE html>${renderToString(
            <Document
              theme={themeFor(request)}
              css={assets.css}
              performance={assets.performance}
              viewer={Option.getOrUndefined(viewer)}
              {...document}
            />,
          )}`,
        ).pipe(
          HttpServerResponse.setStatus(status),
          // The header shows who is signed in, so shared caches must not store pages.
          HttpServerResponse.setHeader("cache-control", "private, no-cache"),
        )
      }

      // Pages read the garden directly through Effect; no HTTP round trip.
      yield* router.add("GET", "/", (request) =>
        Effect.gen(function* () {
          const state = yield* garden.get
          return page(request, {
            title: "Your tiny terrarium",
            current: "garden",
            viewer: yield* viewerFor(request),
            script: assets.garden,
            preloads: assets.preloads.garden,
            children: (
              <>
                <GardenHeading />
                <Island
                  name="terrarium"
                  html={renderIsland(request, <TerrariumIsland garden={state} />)}
                  props={encodeGarden(state)}
                />
              </>
            ),
          })
        }),
      )

      yield* router.add("GET", "/journal", (request) =>
        Effect.gen(function* () {
          const state = yield* garden.get
          return page(request, {
            title: "Journal",
            current: "journal",
            viewer: yield* viewerFor(request),
            children: <JournalTimeline entries={state.journal} />,
          })
        }),
      )

      yield* router.add("GET", "/about", (request) =>
        Effect.gen(function* () {
          return page(request, {
            title: "About",
            current: "about",
            viewer: yield* viewerFor(request),
            script: assets.about,
            preloads: assets.preloads.about,
            children: (
              <AboutArticle>
                <Island name="live-status" html={renderIsland(request, <LiveStatusIsland />)} />
              </AboutArticle>
            ),
          })
        }),
      )

      yield* router.add("GET", "/login", (request) =>
        Effect.gen(function* () {
          const query = searchParams(request)
          const next = safeNext(query.get("next"))
          const viewer = yield* viewerFor(request)
          if (Option.isSome(viewer)) return HttpServerResponse.redirect(next)
          const props: LoginProps = {
            methods: auth.methods,
            next,
            error: query.get("error") ?? undefined,
          }
          return page(request, {
            title: "Sign in",
            current: "login",
            viewer,
            script: assets.login,
            preloads: assets.preloads.login,
            children: (
              <Island
                name="login"
                html={renderIsland(request, <LoginIsland {...props} />)}
                props={props}
              />
            ),
          })
        }),
      )

      // A plain form post, so signing out works without JavaScript.
      yield* router.add("POST", "/logout", (request) =>
        Effect.gen(function* () {
          if (!auth.isSameOrigin(request)) return HttpServerResponse.empty({ status: 403 })
          const response = yield* Effect.promise(() =>
            auth.api.signOut({ headers: webHeaders(request), asResponse: true }),
          )
          return HttpServerResponse.redirect("/", { status: 303 }).pipe(
            HttpServerResponse.mergeCookies(HttpServerResponse.fromWeb(response).cookies),
            HttpServerResponse.setHeader("clear-site-data", '"cache", "prefetchCache"'),
          )
        }),
      )

      const adminPage = (request: HttpServerRequest.HttpServerRequest, panel?: AdminPanel) =>
        Effect.gen(function* () {
          const viewer = yield* viewerFor(request)
          if (Option.isNone(viewer)) {
            const path = request.url.split("?", 1)[0] ?? "/admin"
            return HttpServerResponse.redirect(`/login?next=${encodeURIComponent(path)}`)
          }
          const { user } = viewer.value
          const panels = panelsFor(user.role)
          const first = panels[0]
          if (first === undefined || (panel !== undefined && !panels.includes(panel))) {
            return page(request, {
              title: "No access",
              current: "admin",
              viewer,
              status: 403,
              children: <p>Your account doesn’t have access to this page.</p>,
            })
          }
          if (panel === undefined) return HttpServerResponse.redirect(`/admin/${first.id}`)
          return page(request, {
            title: `${panel.label} · Admin`,
            current: "admin",
            viewer,
            script: assets.admin,
            preloads: assets.preloads.admin,
            children: (
              <AdminLayout panels={panels} current={panel}>
                <Island
                  name="admin-panel"
                  html={renderIsland(request, <panel.Island user={user} />)}
                  props={{ panel: panel.id, user }}
                />
              </AdminLayout>
            ),
          })
        })

      yield* router.add("GET", "/admin", (request) => adminPage(request))
      for (const panel of adminPanels) {
        yield* router.add("GET", `/admin/${panel.id}`, (request) => adminPage(request, panel))
      }
    }),
  )
