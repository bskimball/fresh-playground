import "vite/modulepreload-polyfill"
import "../styles/global.css"
import { createElement } from "react"
import TerrariumIsland, { terrariumIsland } from "../features/terrarium/TerrariumIsland.tsx"
import { bootIsland } from "./hydrateIsland.ts"

bootIsland(terrariumIsland, (garden) => createElement(TerrariumIsland, { garden }))
