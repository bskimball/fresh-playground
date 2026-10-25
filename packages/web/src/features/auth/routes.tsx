import { Auth, webHeaders } from "@playground/server"
import { Effect, Option } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"
import { hrefFor } from "../../components/sections.ts"
import { Island } from "../../server/Document.tsx"
import { Page } from "../../server/Page.ts"
import { safeNext } from "../../server/runtime.ts"
import { type LoginProps, loginIsland } from "./LoginIsland.tsx"

export const AuthPages = HttpRouter.use(
  Effect.fn(function* (router) {
    const page = yield* Page
    const auth = yield* Auth

    yield* router.add("GET", hrefFor("login"), (request) =>
      Effect.gen(function* () {
        const query = new URL(request.url, "http://localhost").searchParams
        const next = safeNext(query.get("next"))
        const viewer = yield* page.viewer(request)
        if (Option.isSome(viewer)) return HttpServerResponse.redirect(next)
        const props: LoginProps = {
          methods: auth.methods,
          next,
          error: query.get("error") ?? undefined,
        }
        return yield* page.render(request, {
          title: "Sign in",
          description: "Sign in to manage the Little world conservatory.",
          current: "login",
          viewer,
          children: <Island island={loginIsland} props={props} />,
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
        return HttpServerResponse.redirect(hrefFor("garden"), { status: 303 }).pipe(
          HttpServerResponse.mergeCookies(HttpServerResponse.fromWeb(response).cookies),
          HttpServerResponse.setHeader("clear-site-data", '"cache", "prefetchCache"'),
        )
      }),
    )
  }),
)
