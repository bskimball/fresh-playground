import "vite/modulepreload-polyfill"
import type { Metric } from "web-vitals"
import {
  applyThemePreference,
  computeNavPillDelta,
  nextTheme,
  readDocumentTheme,
  type StoredNavPillRect,
  syncThemeFromCookie,
} from "../components/themeDom.ts"

syncThemeFromCookie()

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

if (
  document.documentElement.hasAttribute("data-dev-reload") &&
  typeof EventSource !== "undefined"
) {
  let activeBuildId: string | null = null
  const events = new EventSource("/__dev/reload")
  events.addEventListener("build", (event) => {
    const nextId = (event as MessageEvent<string>).data
    if (activeBuildId !== null && activeBuildId !== nextId) {
      window.location.reload()
      return
    }
    activeBuildId = nextId
  })
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
    void navigator.serviceWorker?.register("/sw.js").catch(() => {})
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
