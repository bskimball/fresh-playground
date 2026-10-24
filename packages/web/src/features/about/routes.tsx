import { Effect } from "effect"
import { HttpRouter } from "effect/http"
import { AboutArticle } from "../../components/AboutArticle.tsx"
import { liveStatusIsland } from "../../islands/LiveStatusIsland.tsx"
import { Island } from "../../server/Document.tsx"
import { Page } from "../../server/Page.ts"

export const AboutPages = HttpRouter.use(
  Effect.fn(function* (router) {
    const page = yield* Page

    yield* router.add("GET", "/about", (request) =>
      page.render(request, {
        title: "About",
        current: "about",
        children: (
          <AboutArticle>
            <Island island={liveStatusIsland} />
          </AboutArticle>
        ),
      }),
    )
  }),
)
