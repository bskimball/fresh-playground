import { Garden } from "@playground/server"
import { Effect } from "effect"
import { HttpRouter } from "effect/http"
import { GardenHeading } from "../../components/GardenHeading.tsx"
import { JournalTimeline } from "../../components/JournalTimeline.tsx"
import { Island } from "../../server/Document.tsx"
import { Page } from "../../server/Page.ts"
import { terrariumIsland } from "./TerrariumIsland.tsx"

/** The garden home page and its journal, read straight from `Garden`; no HTTP round trip. */
export const GardenPages = HttpRouter.use(
  Effect.fn(function* (router) {
    const page = yield* Page
    const garden = yield* Garden

    yield* router.add("GET", "/", (request) =>
      Effect.gen(function* () {
        const state = yield* garden.get
        return yield* page.render(request, {
          title: "Your tiny terrarium",
          current: "garden",
          children: (
            <>
              <GardenHeading />
              <Island island={terrariumIsland} props={state} />
            </>
          ),
        })
      }),
    )

    yield* router.add("GET", "/journal", (request) =>
      Effect.gen(function* () {
        const state = yield* garden.get
        return yield* page.render(request, {
          title: "Journal",
          current: "journal",
          children: <JournalTimeline entries={state.journal} />,
        })
      }),
    )
  }),
)
