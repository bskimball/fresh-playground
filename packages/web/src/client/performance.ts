import "vite/modulepreload-polyfill"
import "../styles/global.css"
import type { Metric } from "web-vitals"
import {
  applyThemePreference,
  computeNavPillDelta,
  nextTheme,
  readDocumentTheme,
  type StoredNavPillRect,
  syncThemeFromCookie,
} from "../components/themeDom.ts"
import type { RegisteredIsland } from "./hydrateIsland.ts"
import { type IslandName, islandRegistry } from "./islandRegistry.ts"

const failIslandLoad = (root: HTMLElement, error: unknown) => {
  const name = root.dataset.island ?? "unknown"
  console.error(`Island "${name}" failed to load`, error)
  root.inert = true
  root.removeAttribute("aria-busy")
  const status = document.querySelector<HTMLElement>(`[data-island-status="${name}"]`)
  const statusText = "Interactive controls could not load. Reload the page to try again."
  const detail = error instanceof Error ? error.message : String(error)
  if (status) {
    status.hidden = false
    status.textContent = import.meta.env.DEV
      ? `${statusText} (Island "${name}" failed to load: ${detail})`
      : statusText
  }
}

const mountIsland = (root: HTMLElement, load: () => Promise<RegisteredIsland>) => {
  void load()
    .then((island) => {
      island.boot(root)
    })
    .catch((error: unknown) => {
      failIslandLoad(root, error)
    })
}

const scheduleIdle = (task: () => void) => {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(task, { timeout: 2000 })
  } else {
    setTimeout(task, 0)
  }
}

const bootIslandRoot = (root: HTMLElement, load: () => Promise<RegisteredIsland>) => {
  const trigger = root.dataset.hydrate
  if (trigger === "visible" && typeof IntersectionObserver !== "undefined") {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((item) => item.isIntersecting)) return
      observer.disconnect()
      mountIsland(root, load)
    })
    observer.observe(root)
    return
  }
  if (trigger === "idle") {
    scheduleIdle(() => mountIsland(root, load))
    return
  }
  mountIsland(root, load)
}

const bootIslands = () => {
  for (const root of document.querySelectorAll<HTMLElement>("[data-island]")) {
    const name = root.dataset.island
    if (!name || !Object.hasOwn(islandRegistry, name)) continue
    const { load } = islandRegistry[name as IslandName]
    bootIslandRoot(root, load)
  }
}

syncThemeFromCookie()
bootIslands()

const themeRoot = document.querySelector<HTMLElement>('[data-island="theme-toggle"]')
themeRoot?.addEventListener("click", () => {
  applyThemePreference(nextTheme(readDocumentTheme()))
})

const NAV_PILL_STORAGE_KEY = "playground:nav-pill"
let activePillAnimation: Animation | null = null

const readCurrentNavPillRect = (): {
  readonly pill: HTMLElement
  readonly rect: StoredNavPillRect
} | null => {
  const nav = document.querySelector<HTMLElement>("[data-main-nav]")
  const pill = document.querySelector<HTMLElement>("[data-nav-pill]")
  if (!nav || !pill) return null
  const navRect = nav.getBoundingClientRect()
  const pillRect = pill.getBoundingClientRect()
  if (pillRect.width === 0 || pillRect.height === 0) return null
  return {
    pill,
    rect: {
      left: pillRect.left - navRect.left,
      top: pillRect.top - navRect.top,
      width: pillRect.width,
      height: pillRect.height,
      path: window.location.pathname,
    },
  }
}

const saveCurrentNavPillRect = () => {
  const current = readCurrentNavPillRect()
  if (!current) return
  try {
    sessionStorage.setItem(NAV_PILL_STORAGE_KEY, JSON.stringify(current.rect))
  } catch {
    // Ignore storage quota or privacy-mode errors.
  }
}

const syncAndAnimateNavPill = () => {
  const current = readCurrentNavPillRect()
  if (!current) return
  const { pill, rect } = current

  let prev: StoredNavPillRect | null = null
  try {
    const raw = sessionStorage.getItem(NAV_PILL_STORAGE_KEY)
    if (raw) prev = JSON.parse(raw) as StoredNavPillRect
    sessionStorage.setItem(NAV_PILL_STORAGE_KEY, JSON.stringify(rect))
  } catch {
    // Ignore storage quota or privacy-mode errors.
  }

  const handledByViewTransition = (window as Window & { __vt?: number }).__vt === 1
  if (handledByViewTransition) {
    activePillAnimation?.cancel()
    activePillAnimation = null
    return
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const delta = computeNavPillDelta(prev, rect, handledByViewTransition, reducedMotion)
  if (!delta || typeof pill.animate !== "function") return

  activePillAnimation?.cancel()
  pill.style.transformOrigin = "top left"
  activePillAnimation = pill.animate(
    [
      { transform: `translate(${delta.dx}px, ${delta.dy}px) scale(${delta.sx}, ${delta.sy})` },
      { transform: "translate(0px, 0px) scale(1, 1)" },
    ],
    {
      duration: 280,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    },
  )
}

const supportsPageReveal = "onpagereveal" in window
if (supportsPageReveal) {
  window.addEventListener("pagereveal", () => {
    syncAndAnimateNavPill()
  })
  // Only run immediately if pagereveal already fired before module evaluation.
  if ((window as Window & { __vt?: number }).__vt !== undefined) {
    syncAndAnimateNavPill()
  }
} else {
  syncAndAnimateNavPill()
}

window.addEventListener("pageshow", (event) => {
  syncThemeFromCookie()
  if (event.persisted && !supportsPageReveal) {
    syncAndAnimateNavPill()
  }
})
window.addEventListener("pagehide", saveCurrentNavPillRect)
document.querySelector<HTMLElement>("[data-main-nav]")?.addEventListener("click", (event) => {
  if ((event.target as HTMLElement | null)?.closest("[data-nav-link]")) {
    saveCurrentNavPillRect()
  }
})

// `vp dev` serves source modules; a worker left by a production run on this origin
// would answer with stale pages and chunks.
if (import.meta.env.DEV) {
  void navigator.serviceWorker
    ?.getRegistrations()
    .then((registrations) => Promise.all(registrations.map((worker) => worker.unregister())))
}

const route = location.pathname

const report = ({ name, value, id, rating }: Metric) => {
  const body = JSON.stringify({ name, value, id, rating, route })
  try {
    if (
      navigator.sendBeacon?.("/api/performance", new Blob([body], { type: "application/json" }))
    ) {
      return
    }
  } catch {
    // A rejected beacon can still use the keepalive transport.
  }
  void fetch("/api/performance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {})
}

const start = () => {
  const collect = () => {
    if (import.meta.env.PROD) void navigator.serviceWorker?.register("/sw.js").catch(() => {})
    void import("web-vitals")
      .then(({ onLCP, onINP, onCLS }) => {
        onLCP(report)
        onINP(report)
        onCLS(report)
      })
      .catch(() => {})
  }
  if ("requestIdleCallback" in window) window.requestIdleCallback(collect, { timeout: 2000 })
  else setTimeout(collect, 0)
}

if (document.readyState === "complete") start()
else window.addEventListener("load", start, { once: true })
