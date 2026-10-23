const eventName = "garden-mutated"
const channelName = "playground-garden"

/** Notify this page and other tabs only after a successful write. */
export function publishGardenMutation() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(eventName))
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(channelName)
    channel.postMessage(eventName)
    channel.close()
  }
}

/** Revalidate on mount, resume, reconnect, and successful local/remote writes. */
export function watchFreshness(refresh: () => void) {
  const visible = () => {
    if (document.visibilityState === "visible") refresh()
  }
  const restored = (event: PageTransitionEvent) => {
    if (event.persisted) refresh()
  }
  const channel =
    typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel(channelName)
  if (channel) channel.onmessage = refresh
  document.addEventListener("visibilitychange", visible)
  window.addEventListener("online", refresh)
  window.addEventListener("pageshow", restored)
  window.addEventListener(eventName, refresh)
  refresh()
  return () => {
    channel?.close()
    document.removeEventListener("visibilitychange", visible)
    window.removeEventListener("online", refresh)
    window.removeEventListener("pageshow", restored)
    window.removeEventListener(eventName, refresh)
  }
}
