import { Effect, Option } from "effect"
import { HttpRouter, type HttpServerRequest, HttpServerResponse } from "effect/http"
import { adminPanelHref, hrefFor, loginHref } from "../../components/sections.ts"
import { Island } from "../../server/Document.tsx"
import { Page } from "../../server/Page.ts"
import { AdminLayout } from "./AdminLayout.tsx"
import { type AdminPanel, adminPanelIsland, adminPanels, panelsFor } from "./panels.ts"

/**
 * `/admin` and one page per panel. Listing a panel is not authorization: its API
 * endpoints check the same permissions again.
 */
export const AdminPages = HttpRouter.use(
  Effect.fn(function* (router) {
    const page = yield* Page

    const adminPage = (request: HttpServerRequest.HttpServerRequest, panel?: AdminPanel) =>
      Effect.gen(function* () {
        const viewer = yield* page.viewer(request)
        if (Option.isNone(viewer)) {
          const path = request.url.split("?", 1)[0] ?? hrefFor("admin")
          return HttpServerResponse.redirect(loginHref(path))
        }
        const { user } = viewer.value
        const panels = panelsFor(user.role)
        const first = panels[0]
        if (first === undefined || (panel !== undefined && !panels.includes(panel))) {
          return yield* page.render(request, {
            title: "No access",
            current: "admin",
            viewer,
            status: 403,
            children: <p>Your account doesn’t have access to this page.</p>,
          })
        }
        if (panel === undefined) return HttpServerResponse.redirect(adminPanelHref(first.id))
        return yield* page.render(request, {
          title: `${panel.label} · Admin`,
          description: panel.description,
          current: "admin",
          viewer,
          children: (
            <AdminLayout panels={panels} current={panel}>
              <Island island={adminPanelIsland} props={{ panel: panel.id, user }} />
            </AdminLayout>
          ),
        })
      })

    yield* router.add("GET", hrefFor("admin"), (request) => adminPage(request))
    for (const panel of adminPanels) {
      yield* router.add("GET", adminPanelHref(panel.id), (request) => adminPage(request, panel))
    }
  }),
)
