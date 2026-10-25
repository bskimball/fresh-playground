import { Garden } from "@playground/server"
import { Effect } from "effect"
import { HttpRouter } from "effect/http"
import { GardenHeading } from "../../components/GardenHeading.tsx"
import { JournalTimeline } from "../../components/JournalTimeline.tsx"
import { hrefFor } from "../../components/sections.ts"
import { Island } from "../../server/Document.tsx"
import { Page } from "../../server/Page.ts"
import { terrariumIsland } from "./TerrariumIsland.tsx"

/** The garden home page and its journal, read straight from `Garden`; no HTTP round trip. */
export const GardenPages = HttpRouter.use(
  Effect.fn(function* (router) {
    const page = yield* Page
    const garden = yield* Garden

    yield* router.add("GET", hrefFor("garden"), (request) =>
      Effect.gen(function* () {
        const state = yield* garden.get
        return yield* page.render(request, {
          title: "Your tiny terrarium",
          description:
            "Tend a quiet glasshouse terrarium with interactive watering, sunlight, and day-night controls.",
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

    yield* router.add("GET", hrefFor("journal"), (request) =>
      Effect.gen(function* () {
        const state = yield* garden.get
        return yield* page.render(request, {
          title: "Journal",
          description: "Recent care notes and watering history from the conservatory terrarium.",
          current: "journal",
          children: <JournalTimeline entries={state.journal} />,
        })
      }),
    )
  }),
)
