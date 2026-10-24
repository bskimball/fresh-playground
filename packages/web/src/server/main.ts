import { createServer } from "node:http"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer, Logger, References } from "effect"
import { HttpRouter } from "effect/http"
import { App } from "./app.ts"
import { loadAssets } from "./assets.ts"
import { requestLogging, serverConfig } from "./runtime.ts"

Effect.gen(function* () {
  const config = yield* serverConfig
  const logger = config.environment === "production" ? Logger.consoleJson : Logger.consolePretty()
  const server = Effect.gen(function* () {
    const assets = yield* Effect.sync(loadAssets)
    yield* HttpRouter.serve(App(assets), { disableLogger: true, middleware: requestLogging }).pipe(
      Layer.provide(NodeHttpServer.layer(createServer, { port: config.port, host: config.host })),
      Layer.launch,
    )
  })
  yield* server.pipe(
    Effect.provide(Logger.layer([logger])),
    Effect.provideService(References.MinimumLogLevel, config.logLevel),
  )
}).pipe(NodeRuntime.runMain)
