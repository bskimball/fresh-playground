import "vite/modulepreload-polyfill"
import { createElement } from "react"
import LoginIsland, { type LoginProps } from "../features/auth/LoginIsland.tsx"
import { hydrateIsland } from "./hydrateIsland.ts"

const root = document.querySelector<HTMLElement>("[data-island=login]")
if (root) {
  const props: LoginProps = JSON.parse(root.dataset.props ?? "null")
  hydrateIsland(root, createElement(LoginIsland, props))
}
