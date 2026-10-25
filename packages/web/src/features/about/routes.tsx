import { Garden } from "@playground/server"
import { Clock, Effect } from "effect"
import { HttpRouter } from "effect/http"
import { AboutArticle } from "../../components/AboutArticle.tsx"
import { liveStatusIsland } from "../../islands/LiveStatusIsland.tsx"
import { Island } from "../../server/Document.tsx"
import { Page } from "../../server/Page.ts"

export const AboutPages = HttpRouter.use(
  Effect.fn(function* (router) {
    const page = yield* Page
    const garden = yield* Garden

    yield* router.add("GET", "/about", (request) =>
      Effect.gen(function* () {
        const [state, now] = yield* Effect.all([garden.get, Clock.currentTimeMillis])
        return yield* page.render(request, {
          title: "About",
          current: "about",
          description:
            "How Little world pairs Effect HTTP services, SQLite, StyleX, and isolated React islands.",
          children: (
            <AboutArticle>
              <Island
                island={liveStatusIsland}
                props={{
                  hello: { message: "Hello from Effect!", time: new Date(now) },
                  garden: state,
                }}
              />
            </AboutArticle>
          ),
        })
      }),
    )
  }),
)
