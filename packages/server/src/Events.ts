import { randomUUID } from "node:crypto"
import { AppApi, type EventTopic, type PublicEvent } from "@playground/contract"
import { Context, Effect, Layer, Stream } from "effect"
import { HttpApiBuilder, HttpApiSchema } from "effect/http-api"
import { Sqlite } from "./Sqlite.ts"

const RETENTION = 1000
const BATCH_SIZE = 100

/** Public invalidations only. The synchronous savepoint never spans an Effect yield. */
export class Events extends Context.Service<
  Events,
  {
    readonly commit: <A>(topic: EventTopic, write: () => A) => A
    readonly replay: (cursor?: string) => ReadonlyArray<PublicEvent>
    readonly stream: (cursor?: string) => Stream.Stream<PublicEvent>
    readonly stop: () => void
  }
>()("server/Events") {
  static readonly layer = Layer.effect(
    Events,
    Effect.gen(function* () {
      const db = yield* Sqlite
      db.exec(`
      CREATE TABLE IF NOT EXISTS event_generation (id INTEGER PRIMARY KEY CHECK (id = 1), generation TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS public_events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, topic TEXT NOT NULL CHECK(topic IN ('garden', 'kanban')));
    `)
      db.prepare("INSERT OR IGNORE INTO event_generation VALUES (1, ?)").run(randomUUID())
      const generation = (
        db.prepare("SELECT generation FROM event_generation WHERE id = 1").get() as {
          generation: string
        }
      ).generation
      const head = () =>
        Number(
          (
            db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'public_events'").get() as
              | { seq: number }
              | undefined
          )?.seq ?? 0,
        )
      const id = (sequence: number) => `${generation}:${sequence}`
      let stopped = false
      const replay = (cursor?: string): ReadonlyArray<PublicEvent> => {
        const current = head()
        const prefix = `${generation}:`
        const suffix = cursor?.startsWith(prefix) ? cursor.slice(prefix.length) : ""
        const sequence = /^(0|[1-9]\d*)$/.test(suffix) ? Number(suffix) : NaN
        const oldest = Number(
          (
            db.prepare("SELECT MIN(sequence) AS oldest FROM public_events").get() as {
              oldest: number | null
            }
          ).oldest ?? current + 1,
        )
        if (!Number.isSafeInteger(sequence) || sequence > current || sequence < oldest - 1) {
          return [{ id: id(current), event: "resync", data: { topics: ["garden", "kanban"] } }]
        }
        return (
          db
            .prepare(
              "SELECT sequence, topic FROM public_events WHERE sequence > ? ORDER BY sequence LIMIT ?",
            )
            .all(sequence, BATCH_SIZE) as Array<{ sequence: number; topic: EventTopic }>
        ).map((row) => ({ id: id(row.sequence), event: "invalidate", data: { topic: row.topic } }))
      }
      return Events.of({
        commit: (topic, write) => {
          db.exec("SAVEPOINT public_mutation")
          try {
            const result = write()
            db.prepare("INSERT INTO public_events(topic) VALUES (?)").run(topic)
            db.prepare("DELETE FROM public_events WHERE sequence <= ?").run(head() - RETENTION)
            db.exec("RELEASE public_mutation")
            return result
          } catch (error) {
            db.exec("ROLLBACK TO public_mutation; RELEASE public_mutation")
            throw error
          }
        },
        replay,
        stop: () => {
          stopped = true
        },
        stream: (cursor) =>
          Stream.suspend(() => {
            let position = cursor
            const started = Date.now()
            let heartbeat = started
            return Stream.unfold(undefined, () =>
              Effect.gen(function* () {
                if (stopped || Date.now() - started >= 120_000) return undefined
                const batch = replay(position)
                if (batch.length > 0) {
                  const last = batch[batch.length - 1]!
                  if ("id" in last) position = last.id
                  return [batch, undefined] as const
                }
                yield* Effect.sleep("300 millis")
                if (Date.now() - heartbeat >= 15_000) {
                  heartbeat = Date.now()
                  return [
                    [{ event: "heartbeat", data: {} } satisfies PublicEvent],
                    undefined,
                  ] as const
                }
                return [[], undefined] as const
              }),
            ).pipe(Stream.flatMap(Stream.fromIterable))
          }),
      })
    }),
  )
}

export const EventsHandlers = HttpApiBuilder.group(
  AppApi,
  "events",
  Effect.fn(function* (handlers) {
    const events = yield* Events
    return handlers.handleAll({
      events: ({ request }) =>
        Effect.succeed(
          HttpApiSchema.withHeaders({
            body: events.stream(request.headers["last-event-id"]),
            headers: {
              "cache-control": "no-store, no-transform",
              "content-encoding": "identity",
              "x-accel-buffering": "no",
            },
          }),
        ),
    })
  }),
)
