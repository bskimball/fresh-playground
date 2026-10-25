import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient"
import { Effect, Layer } from "effect"
import * as PersistedQueue from "effect/persistence/PersistedQueue"
import { DatabasePath } from "./Sqlite.ts"

export { PersistedQueue }
export const JOBS_TABLE = "durable_jobs"

/** Official SQL adapter; a second scoped connection to the same configured file. */
export const JobsSql = Layer.unwrap(
  Effect.gen(function* () {
    const filename = yield* DatabasePath
    if (filename === ":memory:")
      return yield* Effect.die(new Error("Durable jobs require a file-backed DATABASE_PATH"))
    return SqliteClient.layer({ filename, busyTimeout: "1 second" })
  }),
)

export const JobsStore = PersistedQueue.layerStoreSql({
  tableName: JOBS_TABLE,
  pollInterval: "300 millis",
  lockRefreshInterval: "10 seconds",
  lockExpiration: "60 seconds",
})

/** Reuse this factory layer to define schema-typed feature queues. At-least-once, not exactly-once. */
export const Jobs = Layer.mergeAll(
  PersistedQueue.layer,
  PersistedQueue.layerCleanup({
    interval: "1 minute",
    timeToLive: "1 day",
    failedTimeToLive: "7 days",
  }),
).pipe(Layer.provideMerge(JobsStore), Layer.provideMerge(JobsSql))

/** One sequential bounded worker. Fork under the app scope, before its database finalizers. */
export const runWorker = <A, Q, E, R>(
  queue: PersistedQueue.PersistedQueue<A, Q>,
  handle: (
    value: A,
    metadata: { readonly id: string; readonly attempts: number },
  ) => Effect.Effect<void, E, R>,
  afterAttempt: Effect.Effect<void, never, R> = Effect.void,
) =>
  queue
    .take((value, metadata) =>
      handle(value, metadata).pipe(
        Effect.timeout("20 seconds"),
        // Native SQL retains last_failure: never let handler/provider details reach it.
        Effect.catchCause(() => Effect.fail(new Error("Job handler failed"))),
      ),
    )
    .pipe(
      Effect.catchCause(() =>
        Effect.logWarning(
          "Durable job attempt failed; native queue will retry or retain terminal metadata",
        ),
      ),
      Effect.andThen(afterAttempt),
      Effect.andThen(Effect.sleep("100 millis")),
      Effect.forever,
      Effect.forkScoped,
    )
