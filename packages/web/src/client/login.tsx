import "vite/modulepreload-polyfill"
import { createElement } from "react"
import LoginIsland, { loginIsland } from "../features/auth/LoginIsland.tsx"
import { bootIsland } from "./hydrateIsland.ts"

bootIsland(loginIsland, (props) => createElement(LoginIsland, props))
