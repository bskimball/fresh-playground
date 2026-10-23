import "vite/modulepreload-polyfill"
import type { Metric } from "web-vitals"
import { createElement } from "react"
import { ThemeToggle } from "../components/ThemeToggle.tsx"
import { hydrateIsland } from "./hydrateIsland.ts"

const themeRoot = document.querySelector<HTMLElement>('[data-island="theme-toggle"]')
if (themeRoot) hydrateIsland(themeRoot, createElement(ThemeToggle))

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
