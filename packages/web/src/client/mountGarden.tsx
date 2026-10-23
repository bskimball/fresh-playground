import { Garden } from "@playground/contract"
import { Schema } from "effect"
import { createElement } from "react"
import TerrariumIsland from "../features/terrarium/TerrariumIsland.tsx"
import { hydrateIsland } from "./hydrateIsland.ts"

const decodeGarden = Schema.decodeSync(Schema.toCodecJson(Garden))

export function mountGarden(root: HTMLElement) {
  const garden = decodeGarden(JSON.parse(root.dataset.props ?? "null"))
  hydrateIsland(root, createElement(TerrariumIsland, { garden }))
}
