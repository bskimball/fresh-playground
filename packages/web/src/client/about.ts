import "vite/modulepreload-polyfill"

const root = document.querySelector<HTMLElement>("[data-island=live-status]")
if (root) {
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return
    observer.disconnect()
    void Promise.all([
      import("react"),
      import("./hydrateIsland.ts"),
      import("../islands/LiveStatusIsland.tsx"),
    ])
      .then(([{ createElement }, { hydrateIsland }, { default: LiveStatusIsland }]) => {
        hydrateIsland(root, createElement(LiveStatusIsland))
      })
      .catch((error: unknown) => {
        console.error("Status loading failed", error)
        root.removeAttribute("aria-busy")
        const status = document.querySelector<HTMLElement>("[data-island-status=live-status]")
        if (status) status.textContent = "Live status could not load. Reload the page to try again."
      })
  })
  observer.observe(root)
}
