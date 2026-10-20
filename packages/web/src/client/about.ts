// Observe the island's own box: Astryx's Theme child uses display: contents
// and cannot be an IntersectionObserver target.
const root = document.querySelector<HTMLElement>("[data-island=live-status]")
if (root) {
  const observer = new IntersectionObserver(async (entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return
    observer.disconnect()
    const [{ createElement }, { hydrateRoot }, { default: LiveStatusIsland }] = await Promise.all([
      import("react"),
      import("react-dom/client"),
      import("../islands/LiveStatusIsland.tsx"),
    ])
    hydrateRoot(root, createElement(LiveStatusIsland))
  })
  observer.observe(root)
}
