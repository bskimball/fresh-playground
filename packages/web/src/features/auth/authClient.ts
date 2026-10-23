import { createAuthClient } from "better-auth/client"
import { magicLinkClient } from "better-auth/client/plugins"

/** Browser client for Better Auth's `/api/auth/*` endpoints on this origin. */
export const authClient = createAuthClient({
  baseURL: globalThis.location?.origin,
  plugins: [magicLinkClient()],
})
