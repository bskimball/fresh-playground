import { DatabaseSync } from "node:sqlite"
import { GardenSaturated } from "@playground/contract"
import { Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vite-plus/test"
import { Garden, moistureAt } from "./Garden.ts"
import { Kanban, seedCards } from "./Kanban.ts"
import { Sqlite } from "./Sqlite.ts"

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
