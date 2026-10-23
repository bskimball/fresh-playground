import { createFreshnessChannel } from "../../machines/offlineSync.ts"

const freshness = createFreshnessChannel("garden-mutated")

/** Notify this page and other tabs only after a successful write. */
export const publishGardenMutation = freshness.publish

/** Revalidate on mount, resume, reconnect, and successful local/remote writes. */
export const watchFreshness = freshness.watch
