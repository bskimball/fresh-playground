import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { Config, Context, Effect, Layer } from "effect"

/** Resolved once at the application composition boundary for both SQLite connections. */
export class DatabasePath extends Context.Service<DatabasePath, string>()("server/DatabasePath") {
  static readonly layer = Layer.effect(
    DatabasePath,
    Config.String("DATABASE_PATH").pipe(
      Config.withDefault("data/app.db"),
      Config.map((path) => (path === ":memory:" ? path : resolve(path))),
    ),
  )
}

/** Shared SQLite connection (`node:sqlite` in WAL mode for file-backed stores). */
export class Sqlite extends Context.Service<Sqlite, DatabaseSync>()("server/Sqlite") {
  static readonly make = (databasePath: string) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        if (databasePath !== ":memory:") {
          mkdirSync(dirname(databasePath), { recursive: true })
        }
        const database = new DatabaseSync(databasePath)
        database.exec("PRAGMA busy_timeout = 1000")
        if (databasePath !== ":memory:") {
          database.exec("PRAGMA journal_mode = WAL")
        }
        return database
      }),
      (database) => Effect.sync(() => database.close()),
    )

  static readonly layer = Layer.effect(
    Sqlite,
    Effect.gen(function* () {
      const databasePath = yield* Config.String("DATABASE_PATH").pipe(
        Config.withDefault("data/app.db"),
      )
      return yield* Sqlite.make(databasePath)
    }),
  )

  static readonly configured = Layer.effect(
    Sqlite,
    Effect.gen(function* () {
      return yield* Sqlite.make(yield* DatabasePath)
    }),
  )

  static readonly memory = Layer.effect(Sqlite, Sqlite.make(":memory:"))
}
