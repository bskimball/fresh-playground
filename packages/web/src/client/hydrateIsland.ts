import { createElement, type ReactNode, useEffect } from "react"
import { hydrateRoot } from "react-dom/client"

export interface IslandCodec<P> {
  readonly name: string
  readonly encode: (props: P) => unknown
  readonly decode: (encoded: unknown) => P
}

export function defineIsland<P = void>(
  name: string,
  codec?: {
    readonly encode: (props: P) => unknown
    readonly decode: (encoded: unknown) => P
  },
): IslandCodec<P> {
  return {
    name,
    encode: codec ? codec.encode : (props) => props,
    decode: codec ? codec.decode : (encoded) => encoded as P,
  }
}

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

export function bootIsland<P>(island: IslandCodec<P>, render: (props: P) => ReactNode) {
  const root = document.querySelector<HTMLElement>(`[data-island="${island.name}"]`)
  if (!root) return
  try {
    const raw: unknown = root.dataset.props ? JSON.parse(root.dataset.props) : undefined
    const props = island.decode(raw)
    hydrateIsland(root, render(props))
  } catch (error) {
    console.error(`Island "${island.name}" failed to initialize`, error)
    root.inert = true
    root.removeAttribute("aria-busy")
    const status = document.querySelector<HTMLElement>(`[data-island-status="${island.name}"]`)
    if (status) {
      status.hidden = false
      status.textContent = "Interactive controls could not load. Reload the page to try again."
    }
  }
}
