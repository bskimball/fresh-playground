import { randomUUID } from "node:crypto"
import { existsSync, mkdtempSync, readdirSync, rmSync, truncateSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createServer, type Socket } from "node:net"
import { DatabaseSync } from "node:sqlite"
import { EventsApi, FILE_QUOTA_BYTES, GardenSaturated } from "@playground/contract"
import { HttpApi, HttpApiBuilder } from "effect/http-api"
import {
  HttpMiddleware,
  HttpRouter,
  HttpServer,
  HttpServerResponse,
  type Multipart,
} from "effect/http"
import { ConfigProvider, Effect, Exit, Layer, Option, Schedule, Schema, Stream } from "effect"
import { describe, expect, it } from "vite-plus/test"
import { Garden, moistureAt } from "./Garden.ts"
import { Kanban, seedCards } from "./Kanban.ts"
import { DatabasePath, Sqlite } from "./Sqlite.ts"
import { Events, EventsHandlers } from "./Events.ts"
import { Jobs, PersistedQueue, runWorker } from "./Jobs.ts"
import { MailJob, MailQueue } from "./MailQueue.ts"
import { Mailer } from "./Mailer.ts"
import { Auth } from "./Auth.ts"
import { Files } from "./Files.ts"
import { AppServices } from "./index.ts"
import {
  clientKey,
  RateLimitMiddleware,
  rateLimitRule,
  RateLimits,
  rateLimits,
} from "./RateLimit.ts"
import { Storage } from "./Storage.ts"

describe("email configuration and SMTP delivery", () => {
  const configured = (values: Record<string, string>) =>
    Mailer.layer.pipe(Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord(values))))

  it("defaults production mail to disabled and refuses the log transport", async () => {
    const transport = await Effect.runPromise(
      Effect.gen(function* () {
        return (yield* Mailer).transport
      }).pipe(Effect.provide(configured({ NODE_ENV: "production" }))),
    )
    expect(transport).toBe("disabled")
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          return yield* Mailer
        }).pipe(Effect.provide(configured({ NODE_ENV: "production", MAIL_TRANSPORT: "log" }))),
      ),
    ).rejects.toThrow("not allowed in production")
  })

  it("refuses enabled magic links without a delivery transport", async () => {
    const config = ConfigProvider.layer(
      ConfigProvider.fromEnvRecord({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "test-only-secret-that-is-at-least-32-characters",
        AUTH_MAGIC_LINK: "true",
        MAIL_TRANSPORT: "disabled",
      }),
    )
    const auth = Auth.layer.pipe(
      Layer.provide(Mailer.layer),
      Layer.provide(Layer.succeed(MailQueue, { enqueue: () => Effect.void })),
      Layer.provide(Sqlite.memory),
      Layer.provide(config),
    )
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          return yield* Auth
        }).pipe(Effect.provide(auth)),
      ),
    ).rejects.toThrow("AUTH_MAGIC_LINK=true requires")
  })

  it("closes hanging SMTP attempts on timeout and scoped interruption before the next send", async () => {
    const sockets = new Set<Socket>()
    let messages = 0
    let peakConnections = 0
    const receiver = createServer((socket) => {
      sockets.add(socket)
      peakConnections = Math.max(peakConnections, sockets.size)
      socket.on("close", () => sockets.delete(socket))
      socket.on("error", () => {})
      socket.setEncoding("utf8")
      socket.write("220 localhost SMTP ready\r\n")
      let buffer = ""
      let data = false
      socket.on("data", (chunk) => {
        buffer += chunk
        let end: number
        while ((end = buffer.indexOf("\r\n")) !== -1) {
          const line = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          if (data) {
            // Simulate a receiver that consumed DATA but never acknowledges it.
            if (line === ".") messages++
          } else if (line.startsWith("EHLO")) socket.write("250 localhost\r\n")
          else if (line === "DATA") {
            data = true
            socket.write("354 send message\r\n")
          } else socket.write("250 OK\r\n")
        }
      })
    })
    await new Promise<void>((resolve) => receiver.listen(0, "127.0.0.1", resolve))
    try {
      const address = receiver.address()
      if (address === null || typeof address === "string") throw new Error("No SMTP address")
      const layer = configured({
        NODE_ENV: "test",
        MAIL_TRANSPORT: "smtp",
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: String(address.port),
        SMTP_REQUIRE_TLS: "false",
        MAIL_FROM: "sender@example.test",
      })
      const started = Date.now()
      await Effect.runPromise(
        Effect.gen(function* () {
          const mailer = yield* Mailer
          const send = mailer.send({ to: "reader@example.test", subject: "Hang", text: "Local" })
          expect(Exit.isFailure(yield* Effect.exit(send.pipe(Effect.timeout("600 millis"))))).toBe(
            true,
          )
          expect(messages).toBe(1)
          yield* waitFor(() => sockets.size === 0)
          yield* send.pipe(Effect.forkScoped)
          yield* waitFor(() => messages === 2)
          // Returning releases the scope while the second send is still waiting for SMTP.
        }).pipe(Effect.scoped, Effect.provide(layer)),
      )
      await Effect.runPromise(waitFor(() => sockets.size === 0))
      expect(messages).toBe(2)
      expect(peakConnections).toBe(1)
      expect(Date.now() - started).toBeLessThan(3000)
    } finally {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve, reject) =>
        receiver.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })

  it("delivers through a local SMTP receiver and propagates recipient rejection", async () => {
    const messages: string[] = []
    const receiver = createServer((socket) => {
      socket.setEncoding("utf8")
      socket.write("220 localhost SMTP ready\r\n")
      let buffer = ""
      let message: string[] | undefined
      socket.on("data", (chunk) => {
        buffer += chunk
        let end: number
        while ((end = buffer.indexOf("\r\n")) !== -1) {
          const line = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          if (message !== undefined) {
            if (line === ".") {
              messages.push(message.join("\r\n"))
              message = undefined
              socket.write("250 queued\r\n")
            } else message.push(line)
          } else if (line.startsWith("EHLO")) socket.write("250 localhost\r\n")
          else if (line.startsWith("RCPT TO:") && line.includes("reject@"))
            socket.write("550 rejected\r\n")
          else if (line === "DATA") {
            message = []
            socket.write("354 send message\r\n")
          } else if (line === "QUIT") socket.end("221 bye\r\n")
          else socket.write("250 OK\r\n")
        }
      })
    })
    await new Promise<void>((resolve) => receiver.listen(0, "127.0.0.1", resolve))
    try {
      const address = receiver.address()
      if (address === null || typeof address === "string") throw new Error("No SMTP address")
      const layer = configured({
        NODE_ENV: "test",
        MAIL_TRANSPORT: "smtp",
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: String(address.port),
        SMTP_REQUIRE_TLS: "false",
        MAIL_FROM: "sender@example.test",
      })
      await Effect.runPromise(
        Effect.gen(function* () {
          const mailer = yield* Mailer
          yield* mailer.send({
            to: "reader@example.test",
            subject: "SMTP smoke",
            text: "A local delivery",
          })
          const rejected = yield* Effect.exit(
            mailer.send({ to: "reject@example.test", subject: "Reject", text: "Not delivered" }),
          )
          expect(Exit.isFailure(rejected)).toBe(true)
        }).pipe(Effect.provide(layer)),
      )
      expect(messages).toHaveLength(1)
      expect(messages[0]).toContain("Subject: SMTP smoke")
      expect(messages[0]).toContain("A local delivery")
      const temp = temporaryDatabase()
      try {
        const queued = MailQueue.layer.pipe(
          Layer.provide(layer),
          Layer.provide(jobLayer(temp.filename)),
        )
        await Effect.runPromise(
          Effect.gen(function* () {
            yield* (yield* MailQueue).enqueue({
              to: "reader@example.test",
              subject: "Queued SMTP",
              text: "Durably delivered",
            })
            yield* waitFor(() => messages.length === 2)
          }).pipe(Effect.provide(queued)),
        )
        expect(messages[1]).toContain("Subject: Queued SMTP")
        expect(messages[1]).toContain("Durably delivered")
        expect(messages[1]).toMatch(/Message-ID: <[a-f0-9-]+@auth-mail.local>/)
        const db = new DatabaseSync(temp.filename)
        try {
          expect(
            db
              .prepare("SELECT state, element FROM durable_jobs WHERE queue_name = 'auth-mail'")
              .get(),
          ).toMatchObject({ state: "completed", element: "{}" })
        } finally {
          db.close()
        }
      } finally {
        temp.close()
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        receiver.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })
})

describe("moistureAt", () => {
  it("dries one point per minute down to the 20% floor", () => {
    const start = 1_000_000
    expect(moistureAt({ moisture: 54, wateredAt: start }, start + 10 * 60_000)).toBe(44)
    expect(moistureAt({ moisture: 54, wateredAt: start }, start + 60 * 60_000)).toBe(20)
    expect(moistureAt({ moisture: 15, wateredAt: start }, start + 5 * 60_000)).toBe(15)
  })
})

describe("Garden & Kanban SQLite persistence", () => {
  it("waters, updates settings, enforces saturation, and survives service restarts on the same SQLite db", async () => {
    const db = new DatabaseSync(":memory:")
    try {
      const sqliteLayer = Layer.succeed(Sqlite, db)
      const gardenLayer = Garden.layer.pipe(Layer.provide(sqliteLayer))

      const afterMutations = await Effect.runPromise(
        Effect.gen(function* () {
          const garden = yield* Garden
          const initial = yield* garden.get
          expect(initial.moisture).toBe(54)
          expect(initial.waters).toBe(0)

          const watered = yield* garden.water
          expect(watered.moisture).toBe(69)
          expect(watered.waters).toBe(1)

          yield* garden.water // 84
          const third = yield* garden.water // 99
          expect(third.moisture).toBe(99)

          const saturatedExit = yield* Effect.exit(garden.water)
          expect(Exit.isFailure(saturatedExit)).toBe(true)
          if (Exit.isFailure(saturatedExit)) {
            const error = saturatedExit.cause.reasons[0]
            expect(error?._tag === "Fail" && error.error instanceof GardenSaturated).toBe(true)
          }

          return yield* garden.updateSettings({ sunlight: 80, night: true })
        }).pipe(Effect.provide(gardenLayer)),
      )

      expect(afterMutations.sunlight).toBe(80)
      expect(afterMutations.night).toBe(true)

      // Re-create the Garden service layer against the same SQLite database to verify persistence
      const restored = await Effect.runPromise(
        Effect.gen(function* () {
          const garden = yield* Garden
          return yield* garden.get
        }).pipe(Effect.provide(Garden.layer.pipe(Layer.provide(sqliteLayer)))),
      )

      expect(restored.waters).toBe(3)
      expect(restored.sunlight).toBe(80)
      expect(restored.night).toBe(true)
      expect(restored.journal[0]?.text).toBe("Tucked the garden in for the night.")
    } finally {
      db.close()
    }
  })

  it("seeds Kanban cards and persists saved boards across service restarts", async () => {
    const db = new DatabaseSync(":memory:")
    try {
      const sqliteLayer = Layer.succeed(Sqlite, db)
      const kanbanLayer = Kanban.layer.pipe(Layer.provide(sqliteLayer))

      const updatedCards = seedCards.slice(0, 2).map((card) => ({
        ...card,
        status: "done" as const,
      }))

      await Effect.runPromise(
        Effect.gen(function* () {
          const kanban = yield* Kanban
          const initial = yield* kanban.get
          expect(initial.cards.length).toBe(seedCards.length)
          yield* kanban.save({ cards: updatedCards })
        }).pipe(Effect.provide(kanbanLayer)),
      )

      const restored = await Effect.runPromise(
        Effect.gen(function* () {
          const kanban = yield* Kanban
          return yield* kanban.get
        }).pipe(Effect.provide(Kanban.layer.pipe(Layer.provide(sqliteLayer)))),
      )

      expect(restored.cards).toEqual(updatedCards)
    } finally {
      db.close()
    }
  })
})

const temporaryDatabase = () => {
  const directory = mkdtempSync(join(tmpdir(), "playground-services-"))
  return {
    filename: join(directory, "app.db"),
    close: () => rmSync(directory, { recursive: true, force: true }),
  }
}
const jobLayer = (filename: string) =>
  Jobs.pipe(Layer.provide(Layer.succeed(DatabasePath, filename)))
const waitFor = (predicate: () => boolean) =>
  Effect.gen(function* () {
    for (let i = 0; i < 100; i++) {
      if (predicate()) return
      yield* Effect.sleep("50 millis")
    }
    throw new Error("Condition did not settle")
  })

describe("durable public invalidations", () => {
  it("commits domain rows and events together; failures leave rows and Refs unchanged, including reset", async () => {
    const db = new DatabaseSync(":memory:")
    try {
      const layer = Layer.mergeAll(Garden.layer, Kanban.layer, Events.layer).pipe(
        Layer.provide(Layer.succeed(Sqlite, db)),
      )
      await Effect.runPromise(
        Effect.gen(function* () {
          const garden = yield* Garden
          const kanban = yield* Kanban
          const events = yield* Events
          const initial = events.replay()[0]!
          expect(initial.event).toBe("resync")
          if (!("id" in initial)) throw new Error("Missing head")
          yield* garden.water
          yield* kanban.save({ cards: [] })
          yield* garden.reset
          const replay = events.replay(initial.id)
          expect(
            replay.map((event) => (event.event === "invalidate" ? event.data.topic : "wrong")),
          ).toEqual(["garden", "kanban", "garden"])
          const before = yield* garden.get
          db.exec(
            "CREATE TRIGGER fail_event BEFORE INSERT ON public_events BEGIN SELECT RAISE(ABORT, 'event insert failed'); END",
          )
          expect(Exit.isFailure(yield* Effect.exit(garden.water))).toBe(true)
          expect(Exit.isFailure(yield* Effect.exit(garden.reset))).toBe(true)
          expect(Exit.isFailure(yield* Effect.exit(kanban.save({ cards: seedCards })))).toBe(true)
          expect(yield* garden.get).toEqual(before)
          expect((yield* kanban.get).cards).toEqual([])
          expect(
            (db.prepare("SELECT waters FROM garden_state").get() as { waters: number }).waters,
          ).toBe(before.waters)
          expect(events.replay(initial.id)).toEqual(replay)
          db.exec("DROP TRIGGER fail_event")
          yield* garden.water
          yield* garden.water
          yield* garden.water
          const count = db.prepare("SELECT count(*) AS n FROM public_events").get()
          expect(Exit.isFailure(yield* Effect.exit(garden.water))).toBe(true)
          expect(db.prepare("SELECT count(*) AS n FROM public_events").get()).toEqual(count)
        }).pipe(Effect.provide(layer)),
      )
    } finally {
      db.close()
    }
  })

  it("reopens a real file, replays in bounded order and explicitly resets invalid, future, foreign and pruned cursors", async () => {
    const temp = temporaryDatabase()
    try {
      const build = () =>
        Layer.mergeAll(Events.layer, Garden.layer).pipe(
          Layer.provideMerge(Layer.effect(Sqlite, Sqlite.make(temp.filename))),
        )
      const cursor = await Effect.runPromise(
        Effect.gen(function* () {
          const events = yield* Events
          const head = events.replay()[0]!
          if (!("id" in head)) throw new Error("Missing head")
          const garden = yield* Garden
          yield* garden.water
          return head.id
        }).pipe(Effect.provide(build())),
      )
      await Effect.runPromise(
        Effect.gen(function* () {
          const events = yield* Events
          const garden = yield* Garden
          expect((yield* garden.get).waters).toBe(1)
          expect(events.replay(cursor)).toHaveLength(1)
          for (const invalid of [
            undefined,
            "bad",
            "foreign:1",
            cursor.replace(/:\d+$/, ":9999999"),
          ])
            expect(events.replay(invalid)[0]?.event).toBe("resync")
          for (let i = 0; i < 1005; i++) events.commit("kanban", () => undefined)
          expect(events.replay(cursor)[0]?.event).toBe("resync")
          const db = yield* Sqlite
          expect(
            (db.prepare("SELECT count(*) AS n FROM public_events").get() as { n: number }).n,
          ).toBe(1000)
          const generation = cursor.split(":")[0]
          const batch = events.replay(`${generation}:6`)
          expect(batch).toHaveLength(100)
          expect(batch.map((e) => ("id" in e ? Number(e.id.split(":")[1]) : 0))).toEqual(
            Array.from({ length: 100 }, (_, i) => i + 7),
          )
          events.stop()
          expect(yield* Stream.runCollect(events.stream(cursor))).toEqual([])
        }).pipe(Effect.provide(build())),
      )
    } finally {
      temp.close()
    }
  })
})

describe("native durable jobs", () => {
  it("persists delayed acceptance across recreation and reclaims an expired lease with its attempt count", async () => {
    const temp = temporaryDatabase()
    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const q = yield* PersistedQueue.make({
            name: "restart",
            schema: Schema.String,
            maxAttempts: 5,
          })
          yield* q.offer("retained", { id: "stable", delay: "1 second" })
        }).pipe(Effect.provide(jobLayer(temp.filename))),
      )
      const db = new DatabaseSync(temp.filename)
      try {
        const row = db.prepare("SELECT * FROM durable_jobs WHERE id = 'stable'").get()!
        expect(row.state).toBe("pending")
        expect(String(row.visible_at) > String(row.created_at)).toBe(true)
        // Simulate a process that died after claiming attempt 1, without its release finalizer.
        db.exec(
          "UPDATE durable_jobs SET acquired_at = datetime('now', '-120 seconds'), acquired_by = 'dead-process', attempts = 1, visible_at = datetime('now', '-1 second')",
        )
      } finally {
        db.close()
      }
      await Effect.runPromise(
        Effect.gen(function* () {
          const q = yield* PersistedQueue.make({
            name: "restart",
            schema: Schema.String,
            maxAttempts: 5,
          })
          yield* q.take((value, metadata) =>
            Effect.sync(() => {
              expect(value).toBe("retained")
              expect(metadata).toEqual({ id: "stable", attempts: 2 })
            }),
          )
        }).pipe(Effect.timeout("5 seconds"), Effect.provide(jobLayer(temp.filename))),
      )
    } finally {
      temp.close()
    }
  })

  it("retries handler failures, retains terminal metadata, and keeps the scoped worker alive", async () => {
    const temp = temporaryDatabase()
    const db = new DatabaseSync(temp.filename)
    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const q = yield* PersistedQueue.make({
            name: "retry",
            schema: Schema.String,
            maxAttempts: 2,
            retrySchedule: Schedule.spaced("1 millis"),
          })
          yield* q.offer("secret payload", { id: "failing" })
          const attempts: number[] = []
          yield* runWorker(q, (_, metadata) =>
            Effect.sync(() => {
              attempts.push(metadata.attempts)
            }).pipe(Effect.andThen(Effect.fail(new Error("secret provider failure")))),
          )
          yield* waitFor(
            () =>
              db.prepare("SELECT state FROM durable_jobs WHERE id = 'failing'").get()?.state ===
              "failed",
          )
          expect(attempts).toEqual([1, 2])
          expect(
            String(
              db.prepare("SELECT last_failure FROM durable_jobs WHERE id = 'failing'").get()
                ?.last_failure,
            ),
          ).not.toContain("secret")
          yield* q.offer("next", { id: "next" })
          yield* waitFor(
            () =>
              db.prepare("SELECT state FROM durable_jobs WHERE id = 'next'").get()?.state ===
              "failed",
          )
        }).pipe(Effect.scoped, Effect.provide(jobLayer(temp.filename))),
      )
    } finally {
      db.close()
      temp.close()
    }
  })
})

describe("auth mail durable handoff", () => {
  it("suppresses expired mail after restart and removes its secrets", async () => {
    const temp = temporaryDatabase()
    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const q = yield* PersistedQueue.make({ name: "auth-mail", schema: MailJob })
          yield* q.offer(
            {
              to: "expired@example.test",
              subject: "Expired",
              text: "expired secret link",
              deadline: Date.now() - 1,
            },
            { id: "expired" },
          )
        }).pipe(Effect.provide(jobLayer(temp.filename))),
      )
      let sent = 0
      const db = new DatabaseSync(temp.filename)
      try {
        const layer = MailQueue.layer.pipe(
          Layer.provide(
            Layer.succeed(Mailer, {
              transport: "smtp",
              send: () =>
                Effect.sync(() => {
                  sent += 1
                }),
            }),
          ),
          Layer.provide(jobLayer(temp.filename)),
        )
        await Effect.runPromise(
          Effect.gen(function* () {
            yield* MailQueue
            yield* Effect.sleep("500 millis")
            expect(sent).toBe(0)
            expect(
              db.prepare("SELECT * FROM durable_jobs WHERE id = 'expired'").get(),
            ).toBeUndefined()
          }).pipe(Effect.provide(layer)),
        )
      } finally {
        db.close()
      }
    } finally {
      temp.close()
    }
  })

  it("propagates durable enqueue failure through the auth callback rather than sending SMTP", async () => {
    const db = new DatabaseSync(":memory:")
    let enqueues = 0
    try {
      const layer = Auth.layer.pipe(
        Layer.provide(Layer.succeed(Sqlite, db)),
        Layer.provide(
          Layer.succeed(Mailer, {
            transport: "smtp",
            send: () => Effect.die("SMTP must not be called"),
          }),
        ),
        Layer.provide(
          Layer.succeed(MailQueue, {
            enqueue: () =>
              Effect.suspend(() => {
                enqueues++
                return Effect.fail(
                  new PersistedQueue.PersistedQueueError({ message: "Durable acceptance failed" }),
                )
              }),
          }),
        ),
        Layer.provide(
          ConfigProvider.layer(
            ConfigProvider.fromEnvRecord({
              NODE_ENV: "test",
              AUTH_MAGIC_LINK: "true",
              BETTER_AUTH_SECRET: "test-only-secret-that-is-at-least-32-characters",
            }),
          ),
        ),
      )
      await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* Auth
          const outcome = yield* Effect.exit(
            Effect.tryPromise(() =>
              auth.api.signInMagicLink({
                headers: new Headers(),
                body: { email: "reader@example.test" },
              }),
            ),
          )
          expect(Exit.isFailure(outcome)).toBe(true)
          expect(enqueues).toBe(1)
        }).pipe(Effect.provide(layer)),
      )
    } finally {
      db.close()
    }
  })

  it("does not report durable acceptance when the native queue cannot write", async () => {
    const temp = temporaryDatabase()
    try {
      const db = new DatabaseSync(temp.filename)
      try {
        const layer = MailQueue.layer.pipe(
          Layer.provide(Layer.succeed(Mailer, { transport: "smtp", send: () => Effect.void })),
          Layer.provide(jobLayer(temp.filename)),
        )
        await Effect.runPromise(
          Effect.gen(function* () {
            const queue = yield* MailQueue
            db.exec(
              "CREATE TRIGGER reject_job BEFORE INSERT ON durable_jobs BEGIN SELECT RAISE(ABORT, 'disk acceptance failed'); END",
            )
            const outcome = yield* Effect.exit(
              queue.enqueue({
                to: "reader@example.test",
                subject: "No write",
                text: "Do not lose me",
              }),
            )
            expect(Exit.isFailure(outcome)).toBe(true)
          }).pipe(Effect.provide(layer)),
        )
      } finally {
        db.close()
      }
    } finally {
      temp.close()
    }
  })
})

it("serves the native public SSE contract without compression and releases an aborted connection", async () => {
  const db = new DatabaseSync(":memory:")
  const routes = HttpApiBuilder.layer(HttpApi.make("app").add(EventsApi)).pipe(
    Layer.provide(EventsHandlers),
    Layer.provide(Events.layer),
    Layer.provide(Layer.succeed(Sqlite, db)),
  )
  const app = HttpRouter.toWebHandler(
    Layer.mergeAll(
      routes,
      HttpRouter.middleware(HttpMiddleware.compression(), { global: true }),
    ).pipe(Layer.provideMerge(HttpServer.layerServices)),
    { disableLogger: true },
  )
  try {
    const controller = new AbortController()
    const response = await app.handler(
      new Request("http://localhost/api/events", {
        headers: { "accept-encoding": "gzip, br" },
        signal: controller.signal,
      }),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/event-stream")
    expect(response.headers.get("cache-control")).toBe("no-store, no-transform")
    expect([null, "identity"]).toContain(response.headers.get("content-encoding"))
    const reader = response.body!.getReader()
    const first = new TextDecoder().decode((await reader.read()).value)
    expect(first).toContain("event: resync")
    expect(first).toContain('"topics":["garden","kanban"]')
    expect(first).not.toMatch(/user|mail|job|token/)
    controller.abort()
    await reader.cancel().catch(() => undefined)
  } finally {
    await app.dispose()
    db.close()
  }
})

it("composes auth, events and the mail worker once over the same configured file and closes their scopes", async () => {
  const temp = temporaryDatabase()
  try {
    await Effect.runPromise(
      Effect.gen(function* () {
        const auth = yield* Auth
        expect(auth.methods.magicLink).toBe(false)
        yield* auth.session(new Headers())
        const events = yield* Events
        expect(events.replay()[0]?.event).toBe("resync")
        yield* (yield* Garden).water
      }).pipe(
        Effect.provide(AppServices),
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromEnvRecord({
              DATABASE_PATH: temp.filename,
              NODE_ENV: "test",
              AUTH_MAGIC_LINK: "false",
              MAIL_TRANSPORT: "disabled",
              BETTER_AUTH_SECRET: "test-only-secret-that-is-at-least-32-characters",
            }),
          ),
        ),
      ),
    )
    const db = new DatabaseSync(temp.filename)
    try {
      expect(db.prepare("SELECT count(*) AS n FROM public_events").get()?.n).toBe(1)
      expect(db.prepare("SELECT count(*) AS n FROM durable_jobs").get()?.n).toBe(0)
      expect(db.prepare('SELECT count(*) AS n FROM "user"').get()?.n).toBe(0)
    } finally {
      db.close()
    }
  } finally {
    temp.close()
  }
})

describe("Sqlite.migrate and Events topic constraint migration", () => {
  it("applies versioned migrations per namespace and rolls back failed steps in a savepoint", () => {
    const db = new DatabaseSync(":memory:")
    try {
      expect(
        Sqlite.migrate(db, "specimen", [
          "CREATE TABLE specimen (id INTEGER PRIMARY KEY, label TEXT NOT NULL)",
          (database) => {
            database.exec("ALTER TABLE specimen ADD COLUMN notes TEXT NOT NULL DEFAULT ''")
          },
        ]),
      ).toBe(2)

      // Re-running with the same migrations is a no-op
      expect(
        Sqlite.migrate(db, "specimen", [
          "CREATE TABLE specimen (id INTEGER PRIMARY KEY, label TEXT NOT NULL)",
          "ALTER TABLE specimen ADD COLUMN notes TEXT NOT NULL DEFAULT ''",
        ]),
      ).toBe(2)

      // A failing step rolls back its DDL/DML and leaves the recorded version at 2
      expect(() =>
        Sqlite.migrate(db, "specimen", [
          "CREATE TABLE specimen (id INTEGER PRIMARY KEY, label TEXT NOT NULL)",
          "ALTER TABLE specimen ADD COLUMN notes TEXT NOT NULL DEFAULT ''",
          (database) => {
            database
              .prepare("INSERT INTO specimen (id, label, notes) VALUES (1, 'fern', 'ok')")
              .run()
            throw new Error("migration step 3 failed")
          },
        ]),
      ).toThrow("migration step 3 failed")

      expect(
        db.prepare("SELECT version FROM schema_migrations WHERE namespace = 'specimen'").get(),
      ).toEqual({ version: 2 })
      expect(db.prepare("SELECT count(*) AS n FROM specimen").get()).toEqual({ n: 0 })
    } finally {
      db.close()
    }
  })

  it("upgrades an older public_events topic CHECK constraint while preserving sequence history", async () => {
    const db = new DatabaseSync(":memory:")
    try {
      db.exec(`
        CREATE TABLE event_generation (id INTEGER PRIMARY KEY CHECK (id = 1), generation TEXT NOT NULL);
        INSERT INTO event_generation VALUES (1, 'gen-legacy');
        CREATE TABLE public_events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, topic TEXT NOT NULL CHECK(topic IN ('garden')));
        INSERT INTO public_events (topic) VALUES ('garden');
      `)
      await Effect.runPromise(
        Effect.gen(function* () {
          const events = yield* Events
          events.commit("kanban", () => undefined)
          const replayed = events.replay("gen-legacy:0")
          expect(
            replayed.map((event) => (event.event === "invalidate" ? event.data.topic : "resync")),
          ).toEqual(["garden", "kanban"])
        }).pipe(Effect.provide(Events.layer), Effect.provide(Layer.succeed(Sqlite, db))),
      )
    } finally {
      db.close()
    }
  })
})

describe("uploaded files", () => {
  const withFiles = async (
    run: (files: Files["Service"], root: string) => Effect.Effect<void, unknown>,
  ) => {
    const root = mkdtempSync(join(tmpdir(), "files-"))
    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          yield* run(yield* Files, join(root, "objects"))
        }).pipe(
          Effect.provide(Files.layer),
          Effect.provide(Layer.succeed(Storage, Storage.local(join(root, "objects")))),
          Effect.provide(Sqlite.memory),
        ),
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
  const upload = (root: string, name: string, contentType: string, size: number) => {
    const path = join(root, `${randomUUID()}.upload`)
    writeFileSync(path, "")
    truncateSync(path, size)
    return {
      _tag: "PersistedFile",
      key: "file",
      name,
      contentType,
      path,
    } as Multipart.PersistedFile
  }
  const read = (body: ReadableStream<Uint8Array>) => new Response(body).text()

  it("keeps files private to their owner and removes stored bytes on delete", async () => {
    await withFiles((files, objects) =>
      Effect.gen(function* () {
        const stored = yield* files.upload("alice", upload(tmpdir(), "notes.txt", "text/plain", 5))
        expect((yield* files.list("alice")).map((file) => file.id)).toEqual([stored.id])
        expect(yield* files.list("bob")).toEqual([])
        expect(Option.isNone(yield* files.open("bob", stored.id))).toBe(true)
        expect(Exit.isFailure(yield* Effect.exit(files.remove("bob", stored.id)))).toBe(true)

        const opened = yield* files.open("alice", stored.id)
        expect(Option.isSome(opened) && opened.value.file.size).toBe(5)
        if (Option.isSome(opened)) yield* Effect.promise(() => read(opened.value.body))

        yield* files.remove("alice", stored.id)
        expect(yield* files.list("alice")).toEqual([])
        expect(existsSync(join(objects, stored.id))).toBe(false)
      }),
    )
  })

  it("normalizes names and media types from the client", async () => {
    await withFiles((files) =>
      Effect.gen(function* () {
        const pdf = yield* files.upload(
          "alice",
          upload(
            tmpdir(),
            String.raw`C:\fakepath\re` + "\u0000port.pdf",
            "Application/PDF; x=1",
            1,
          ),
        )
        expect(pdf.name).toBe("report.pdf")
        expect(pdf.contentType).toBe("application/pdf")
        const odd = yield* files.upload("alice", upload(tmpdir(), "   ", "text/html<script>", 1))
        expect(odd.name).toBe("upload")
        expect(odd.contentType).toBe("application/octet-stream")
      }),
    )
  })

  it("rejects uploads past the per-user quota and discards their bytes", async () => {
    await withFiles((files, objects) =>
      Effect.gen(function* () {
        const tooBig = yield* Effect.exit(
          files.upload("alice", upload(tmpdir(), "huge.bin", "", FILE_QUOTA_BYTES + 1)),
        )
        expect(Exit.isFailure(tooBig)).toBe(true)
        yield* files.upload("alice", upload(tmpdir(), "small.bin", "", 10))
        const overQuota = yield* Effect.exit(
          files.upload("alice", upload(tmpdir(), "rest.bin", "", FILE_QUOTA_BYTES - 9)),
        )
        expect(Exit.isFailure(overQuota)).toBe(true)
        expect((yield* files.list("alice")).map((file) => file.name)).toEqual(["small.bin"])
        expect(readdirSync(objects)).toHaveLength(1)
        // Quotas are per user.
        yield* files.upload("bob", upload(tmpdir(), "bob.bin", "", FILE_QUOTA_BYTES - 9))
      }),
    )
  })
})

describe("API rate limits", () => {
  const handler = () =>
    HttpRouter.toWebHandler(
      Layer.mergeAll(
        HttpRouter.use((router) =>
          Effect.all([
            router.add("POST", "/api/kanban", HttpServerResponse.empty({ status: 204 })),
            router.add("POST", "/api/auth/sign-in", HttpServerResponse.empty({ status: 204 })),
            router.add("GET", "/kanban", HttpServerResponse.empty({ status: 204 })),
          ]),
        ),
        RateLimitMiddleware,
      ).pipe(
        Layer.provide(RateLimits),
        Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord({ TRUST_PROXY: "true" }))),
        Layer.provideMerge(HttpServer.layerServices),
      ),
      { disableLogger: true },
    )
  const send = (
    app: ReturnType<typeof handler>,
    method: string,
    path: string,
    forwardedFor: string,
  ) =>
    app.handler(
      new Request(`http://localhost${path}`, {
        method,
        headers: { "x-forwarded-for": forwardedFor },
      }),
    )

  it("limits each client's API writes, leaving pages, auth, and other clients alone", async () => {
    const app = handler()
    try {
      // The proxy appends the real client last; earlier entries are client-supplied.
      for (let index = 0; index < rateLimits.write; index++) {
        expect((await send(app, "POST", "/api/kanban", `9.9.9.${index}, 1.1.1.1`)).status).toBe(204)
      }
      const limited = await send(app, "POST", "/api/kanban", "1.1.1.1")
      expect(limited.status).toBe(429)
      expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0)
      // The router matches these to /api/kanban too, so they share the exhausted bucket.
      for (const alias of [
        "/API/kanban",
        "//api/kanban",
        "/api/kanban/",
        "/%61pi/kanban",
        "/api/kanban;x",
      ]) {
        expect((await send(app, "POST", alias, "1.1.1.1")).status, alias).toBe(429)
      }
      expect((await send(app, "POST", "/api/kanban", "2.2.2.2")).status).toBe(204)
      expect((await send(app, "GET", "/kanban", "1.1.1.1")).status).toBe(204)
      expect((await send(app, "POST", "/api/auth/sign-in", "1.1.1.1")).status).toBe(204)
    } finally {
      await app.dispose()
    }
  })

  it("classifies raw request targets the way the router matches them", () => {
    // Request targets as Node delivers them; `new Request` would normalize these.
    expect(rateLimitRule("POST", "http://localhost/api/kanban;/../../outside")).toBe("write")
    expect(rateLimitRule("POST", "/api/kanban/../../outside")).toBe("write")
    expect(rateLimitRule("GET", "http://localhost//API/Events/")).toBe("events")
    expect(rateLimitRule("GET", "/api/kanban?x=1")).toBe("read")
    expect(rateLimitRule("POST", "/API/AUTH/sign-in/email")).toBeUndefined()
    expect(rateLimitRule("GET", "/kanban")).toBeUndefined()
  })

  it("groups IPv6 clients by /64 and unwraps IPv4-mapped addresses", () => {
    expect(clientKey("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64")
    expect(clientKey("2001:db8:1:2:bbbb::2%eth0")).toBe("2001:db8:1:2::/64")
    expect(clientKey("::1")).toBe("0:0:0:0::/64")
    expect(clientKey("::ffff:10.0.0.7")).toBe("10.0.0.7")
    expect(clientKey("not an address")).toBe("unknown")
  })
})
