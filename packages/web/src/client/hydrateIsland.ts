import { createElement, useEffect, type ReactNode } from "react"
import { hydrateRoot } from "react-dom/client"

export function hydrateIsland(root: HTMLElement, children: ReactNode) {
  const status = document.querySelector<HTMLElement>(
    `[data-island-status="${root.dataset.island}"]`,
  )
  const start = performance.now()
  function Ready() {
    useEffect(() => {
      root.inert = false
      root.removeAttribute("aria-busy")
      if (status) status.hidden = true
      performance.measure(`hydrate:${root.dataset.island}`, { start, end: performance.now() })
    }, [])
    return children
  }
  hydrateRoot(root, createElement(Ready), {
    onUncaughtError(error) {
      console.error("Island hydration failed", error)
      root.inert = true
      root.removeAttribute("aria-busy")
      if (status) {
        status.hidden = false
        status.textContent = "Interactive controls could not load. Reload the page to try again."
      }
    },
  })
}
