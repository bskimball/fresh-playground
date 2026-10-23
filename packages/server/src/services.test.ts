import { createServer } from "node:net"
import { DatabaseSync } from "node:sqlite"
import { GardenSaturated } from "@playground/contract"
import { ConfigProvider, Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vite-plus/test"
import { Garden, moistureAt } from "./Garden.ts"
import { Kanban, seedCards } from "./Kanban.ts"
import { Sqlite } from "./Sqlite.ts"
import { Mailer } from "./Mailer.ts"
import { Auth } from "./Auth.ts"

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
