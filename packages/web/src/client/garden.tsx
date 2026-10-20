import "../styles/global.css"
import { Garden } from "@playground/contract"
import { Schema } from "effect"
import { hydrateRoot } from "react-dom/client"
import TerrariumIsland from "../features/terrarium/TerrariumIsland.tsx"

const decodeGarden = Schema.decodeSync(Schema.toCodecJson(Garden))

const root = document.querySelector<HTMLElement>("[data-island=terrarium]")
if (root) {
  const garden = decodeGarden(JSON.parse(root.dataset.props ?? "null"))
  hydrateRoot(root, <TerrariumIsland garden={garden} />)
}
