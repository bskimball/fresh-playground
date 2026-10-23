import "vite/modulepreload-polyfill"
import "../styles/global.css"

const root = document.querySelector<HTMLElement>("[data-island=terrarium]")
if (root) {
  void import("./mountGarden.tsx")
    .then(({ mountGarden }) => mountGarden(root))
    .catch((error: unknown) => {
      console.error("Garden loading failed", error)
      root.removeAttribute("aria-busy")
      const status = document.querySelector<HTMLElement>("[data-island-status=terrarium]")
      if (status)
        status.textContent = "Interactive controls could not load. Reload the page to try again."
    })
}
