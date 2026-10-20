import { Garden as GardenSchema } from "@playground/contract"
import { Garden } from "@playground/server"
import { Effect, Schema } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"
import type { ReactNode } from "react"
import { renderToString } from "react-dom/server"
import { AboutArticle } from "../components/AboutArticle.tsx"
import { GardenHeading } from "../components/GardenHeading.tsx"
import { JournalTimeline } from "../components/JournalTimeline.tsx"
import type { Section } from "../components/Shell.tsx"
import TerrariumIsland from "../features/terrarium/TerrariumIsland.tsx"
import LiveStatusIsland from "../islands/LiveStatusIsland.tsx"
import { Document, Island } from "./Document.tsx"

/** Built client files, from the Vite manifest. */
export interface Assets {
  readonly css: string
  readonly garden: string
  readonly about: string
}

const encodeGarden = Schema.encodeSync(Schema.toCodecJson(GardenSchema))

export const PageRoutes = (assets: Assets) =>
  HttpRouter.use(
    Effect.fn(function* (router) {
      const garden = yield* Garden

      const page = (options: {
        title: string
        current: Section
        script?: string
        children: ReactNode
      }) =>
        HttpServerResponse.html(
          `<!DOCTYPE html>${renderToString(<Document css={assets.css} {...options} />)}`,
        )

      // Pages read the garden directly through Effect; no HTTP round trip.
      yield* router.add(
        "GET",
        "/",
        Effect.map(garden.get, (state) =>
          page({
            title: "Your tiny terrarium",
            current: "garden",
            script: assets.garden,
            children: (
              <>
                <GardenHeading />
                <Island
                  name="terrarium"
                  html={renderToString(<TerrariumIsland garden={state} />)}
                  props={encodeGarden(state)}
                />
              </>
            ),
          }),
        ),
      )

      yield* router.add(
        "GET",
        "/journal",
        Effect.map(garden.get, (state) =>
          page({
            title: "Journal",
            current: "journal",
            children: <JournalTimeline entries={state.journal} />,
          }),
        ),
      )

      yield* router.add(
        "GET",
        "/about",
        Effect.sync(() =>
          page({
            title: "About",
            current: "about",
            script: assets.about,
            children: (
              <AboutArticle>
                <Island name="live-status" html={renderToString(<LiveStatusIsland />)} />
              </AboutArticle>
            ),
          }),
        ),
      )
    }),
  )
