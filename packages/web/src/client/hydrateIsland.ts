import { type ComponentType, createElement, type ReactNode, useEffect } from "react"
import { hydrateRoot } from "react-dom/client"
import { AppTheme } from "../components/AppTheme.tsx"

export type HydrationTrigger = "load" | "visible" | "idle"

export interface IslandCodec<P> {
  readonly encode: (props: P) => unknown
  readonly decode: (encoded: unknown) => P
}

export interface IslandOptions<P> {
  readonly codec?: IslandCodec<P>
  readonly hydrate?: HydrationTrigger
}

export interface RegisteredIsland<Name extends string = string> {
  readonly name: Name
  readonly hydrate: HydrationTrigger
  readonly boot: (root?: HTMLElement) => void
}

export interface IslandDefinition<
  P = void,
  Name extends string = string,
> extends RegisteredIsland<Name> {
  readonly render: (props: P) => ReactNode
  readonly encode: (props: P) => unknown
  readonly decode: (encoded: unknown) => P
}

export function failIsland(
  root: HTMLElement,
  logMessage: string,
  error: unknown,
  statusText = "Interactive controls could not load. Reload the page to try again.",
) {
  console.error(logMessage, error)
  root.inert = true
  root.removeAttribute("aria-busy")
  const name = root.dataset.island
  const status = name ? document.querySelector<HTMLElement>(`[data-island-status="${name}"]`) : null
  const detail = error instanceof Error ? error.message : String(error)
  if (status) {
    status.hidden = false
    status.textContent = import.meta.env.DEV
      ? `${statusText} (${logMessage}: ${detail})`
      : statusText
  }
  if (import.meta.env.DEV && typeof document !== "undefined") {
    const Overlay = globalThis.customElements?.get("vite-error-overlay")
    if (Overlay && !document.querySelector("vite-error-overlay")) {
      const normalized = error instanceof Error ? error : new Error(`${logMessage}: ${detail}`)
      document.body.appendChild(new Overlay(normalized))
    }
  }
}

// Under Vite HMR an edited island module runs again. Handing back the same definition
// object keeps that export unchanged, which lets React Fast Refresh swap the component
// in place instead of reloading the page.
const hotDefinitions = new Map<string, object>()

export function defineIsland<Name extends string>(
  name: Name,
  component: () => ReactNode,
  options?: { readonly hydrate?: HydrationTrigger },
): IslandDefinition<void, Name>
export function defineIsland<P extends object, Name extends string = string>(
  name: Name,
  component: ComponentType<P>,
  options?: IslandOptions<P>,
): IslandDefinition<P, Name>
export function defineIsland<P extends object, Name extends string = string>(
  name: Name,
  component: ComponentType<P>,
  options?: IslandOptions<P>,
): IslandDefinition<P, Name> {
  const codec = options?.codec
  const encode = codec ? codec.encode : (props: P) => props
  const decode = codec ? codec.decode : (encoded: unknown) => encoded as P
  const render = (props: P): ReactNode => createElement(component, props)
  const definition: IslandDefinition<P, Name> = {
    name,
    hydrate: options?.hydrate ?? "load",
    render,
    encode,
    decode,
    boot(target) {
      const root = target ?? document.querySelector<HTMLElement>(`[data-island="${name}"]`)
      if (!root) return
      try {
        const raw: unknown = root.dataset.props ? JSON.parse(root.dataset.props) : undefined
        const props = decode(raw)
        hydrateIsland(root, render(props))
      } catch (error) {
        failIsland(root, `Island "${name}" failed to initialize`, error)
      }
    },
  }
  if (!import.meta.hot) return definition
  const previous = hotDefinitions.get(name)
  if (previous) return Object.assign(previous, definition)
  hotDefinitions.set(name, definition)
  return definition
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
    return createElement(AppTheme, null, children)
  }
  hydrateRoot(root, createElement(Ready), {
    onUncaughtError(error) {
      failIsland(root, "Island hydration failed", error)
    },
    onRecoverableError(error) {
      if (import.meta.env.DEV) {
        console.error(
          `Island "${root.dataset.island ?? "unknown"}" recoverable hydration error`,
          error,
        )
      }
    },
  })
}
