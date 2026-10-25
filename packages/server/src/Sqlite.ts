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
  /**
   * Runs ordered, idempotent schema migrations for a named service namespace
   * inside a savepoint and records the applied version in `schema_migrations`.
   */
  static readonly migrate = (
    database: DatabaseSync,
    namespace: string,
    migrations: ReadonlyArray<string | ((db: DatabaseSync) => void)>,
  ): number => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        namespace TEXT PRIMARY KEY,
        version INTEGER NOT NULL
      )
    `)
    const row = database
      .prepare("SELECT version FROM schema_migrations WHERE namespace = ?")
      .get(namespace) as { readonly version: number } | undefined
    let current = row?.version ?? 0
    const upsert = database.prepare(`
      INSERT INTO schema_migrations (namespace, version)
      VALUES (?, ?)
      ON CONFLICT(namespace) DO UPDATE SET version = excluded.version
    `)
    for (let index = current; index < migrations.length; index++) {
      const nextVersion = index + 1
      const step = migrations[index]!
      database.exec("SAVEPOINT sqlite_migration")
      try {
        if (typeof step === "string") database.exec(step)
        else step(database)
        upsert.run(namespace, nextVersion)
        database.exec("RELEASE sqlite_migration")
        current = nextVersion
      } catch (error) {
        database.exec("ROLLBACK TO sqlite_migration; RELEASE sqlite_migration")
        throw error
      }
    }
    return current
  }

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
