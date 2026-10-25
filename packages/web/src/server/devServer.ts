import { existsSync } from "node:fs"
import type { IncomingMessage, ServerResponse } from "node:http"
import { finished } from "node:stream"
import { fileURLToPath } from "node:url"
import { Effect } from "effect"
import { isRunnableDevEnvironment, type Plugin, type ViteDevServer } from "vite-plus"
import { serverConfig } from "./runtime.ts"

type DevEntry = typeof import("./dev.ts")
type DevApp = Awaited<ReturnType<DevEntry["start"]>>

interface RunningApp {
  /** False once retired: the request belongs to the app that replaced this one. */
  readonly handle: (request: IncomingMessage, response: ServerResponse) => boolean
  /** Takes no new requests; closes once the ones in flight finish. */
  readonly retire: () => Promise<void>
  readonly close: () => Promise<void>
}

const running = ({ handler, close }: DevApp, onClosed: () => void): RunningApp => {
  let active = 0
  const streams = new Set<ServerResponse>()
  let retired = false
  let closing: Promise<void> | undefined
  const closed = Promise.withResolvers<void>()
  const closeOnce = () =>
    (closing ??= close()
      .catch(() => undefined)
      .finally(() => {
        onClosed()
        closed.resolve()
      }))
  const closeWhenIdle = () => {
    if (retired && active === 0) void closeOnce()
  }
  return {
    handle(request, response) {
      if (retired) return false
      active += 1
      if (request.url?.split("?", 1)[0] === "/api/events") streams.add(response)
      // Also fires for a response whose client left while the app was starting.
      finished(response, () => {
        streams.delete(response)
        active -= 1
        closeWhenIdle()
      })
      handler(request, response)
      return true
    },
    retire() {
      retired = true
      // SSE is intentionally long-lived; retire it before waiting for ordinary writes.
      for (const response of streams) response.destroy()
      streams.clear()
      closeWhenIdle()
      return closed.promise
    },
    close: closeOnce,
  }
}

/**
 * Hosts the Effect app inside `vp dev`. Vite serves source modules, CSS, and HMR;
 * every other request reaches the app, which Vite's SSR module runner loads from
 * `dev.ts`. After a server-side edit the runner re-imports that entry, and the next
 * request starts a fresh app on the new modules, so Node never restarts. The
 * replaced app finishes its requests before its services close.
 */
export function effectDevServer(): Plugin {
  let vite: ViteDevServer | undefined
  let stopped = false
  // Started and not yet closed; the latest is the one serving.
  const apps = new Set<Promise<RunningApp>>()

  return {
    name: "effect-dev-server",
    apply: "serve",

    config() {
      // Same .env as `npm run start`; variables already set take precedence.
      const env = fileURLToPath(new URL("../../../../.env", import.meta.url))
      if (existsSync(env)) process.loadEnvFile(env)
      // Listen where the app's config, and so Better Auth's trusted origins, expect.
      const { host, port } = Effect.runSync(serverConfig)
      // "custom": the app renders HTML, so Vite must not rewrite paths to index.html.
      return { appType: "custom", server: { host, port, strictPort: true } }
    },

    configureServer(server) {
      vite = server
      const ssr = server.environments.ssr
      if (!ssr || !isRunnableDevEnvironment(ssr)) {
        throw new Error("effect-dev-server needs Vite's runnable ssr environment")
      }

      let current: { readonly entry: DevEntry; readonly app: Promise<RunningApp> } | undefined
      const appFor = async () => {
        const entry = await ssr.runner.import<DevEntry>("/src/server/dev.ts")
        if (stopped) throw new Error("The dev server is shutting down")
        if (current?.entry === entry) return current.app
        // Drain writes before replacement services read their SQLite snapshots.
        const previous = current?.app
        const app: Promise<RunningApp> = Promise.resolve(previous)
          .then((old) => old?.retire())
          .then(() => {
            if (stopped) throw new Error("The dev server is shutting down")
            return entry.start(server)
          })
          .then((started) => running(started, () => apps.delete(app)))
        current = { entry, app }
        apps.add(app)
        app.then(
          (ready) => {
            if (stopped) return void ready.close()
          },
          () => {
            apps.delete(app)
            // Retry on the next request rather than serving this failure until the next edit.
            if (current?.app === app) current = undefined
          },
        )
        return app
      }

      // Runs after Vite's own middleware, so only app requests get here.
      return () => {
        server.middlewares.use(function serve(request, response, next) {
          // A request that waited on an app a later edit replaced goes to the current one.
          appFor().then(
            (app) => app.handle(request, response) || serve(request, response, next),
            next,
          )
        })
      }
    },

    hotUpdate({ file, modules }) {
      // A server-only module (a route, Shell, Document) has no client module to
      // hot-swap, so reload the page to render it again.
      if (this.environment.name !== "ssr" || modules.length === 0 || !vite) return
      const client = vite.environments.client
      if (!client?.moduleGraph.getModulesByFile(file)?.size) {
        client?.hot.send({ type: "full-reload" })
      }
    },

    // During dev, Vite awaits buildEnd once as the dev server closes or restarts.
    async buildEnd() {
      stopped = true
      await Promise.allSettled([...apps].map((app) => app.then((ready) => ready.close())))
    },
  }
}
