import {
  GardenSaturated,
  type GardenSettings,
  type Garden as GardenView,
  JournalEntry,
  SATURATED_AT,
} from "@playground/contract"
import { Clock, Context, Effect, Layer, Option, Ref, Schema } from "effect"
import { Sqlite } from "./Sqlite.ts"

const JOURNAL_LIMIT = 20
const DRY_FLOOR = 20
const DRY_MS_PER_POINT = 60_000

const journalCodec = Schema.toCodecJson(Schema.Array(JournalEntry))
const encodeJournal = Schema.encodeSync(journalCodec)
const decodeJournal = Schema.decodeUnknownOption(journalCodec)

export interface GardenStore {
  readonly moisture: number
  readonly wateredAt: number
  readonly sunlight: number
  readonly night: boolean
  readonly waters: number
  readonly journal: ReadonlyArray<JournalEntry>
}

interface GardenRow {
  readonly moisture: number
  readonly watered_at: number
  readonly sunlight: number
  readonly night: number
  readonly waters: number
  readonly journal_json: string
}

// Soil dries one point per minute after watering, down to a floor.
export const moistureAt = (store: Pick<GardenStore, "moisture" | "wateredAt">, now: number) =>
  Math.max(
    Math.min(store.moisture, DRY_FLOOR),
    store.moisture - Math.floor((now - store.wateredAt) / DRY_MS_PER_POINT),
  )

const view = (store: GardenStore, now: number): GardenView => ({
  moisture: moistureAt(store, now),
  sunlight: store.sunlight,
  night: store.night,
  waters: store.waters,
  journal: store.journal,
})

const record = (store: GardenStore, text: string, now: number): GardenStore => ({
  ...store,
  journal: [
    { id: (store.journal[0]?.id ?? 0) + 1, text, at: new Date(now) },
    ...store.journal,
  ].slice(0, JOURNAL_LIMIT),
})

export class Garden extends Context.Service<
  Garden,
  {
    readonly get: Effect.Effect<GardenView>
    readonly water: Effect.Effect<GardenView, GardenSaturated>
    readonly updateSettings: (settings: GardenSettings) => Effect.Effect<GardenView>
    readonly reset: Effect.Effect<GardenView>
  }
>()("garden/Garden") {
  static readonly layer = Layer.effect(
    Garden,
    Effect.gen(function* () {
      const database = yield* Sqlite
      database.exec(`
        CREATE TABLE IF NOT EXISTS garden_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          moisture INTEGER NOT NULL,
          watered_at INTEGER NOT NULL,
          sunlight INTEGER NOT NULL,
          night INTEGER NOT NULL,
          waters INTEGER NOT NULL,
          journal_json TEXT NOT NULL
        )
      `)

      const selectRow = database.prepare(
        `SELECT moisture, watered_at, sunlight, night, waters, journal_json FROM garden_state WHERE id = 1`,
      )
      const upsertRow = database.prepare(`
        INSERT INTO garden_state (id, moisture, watered_at, sunlight, night, waters, journal_json)
        VALUES (1, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          moisture = excluded.moisture,
          watered_at = excluded.watered_at,
          sunlight = excluded.sunlight,
          night = excluded.night,
          waters = excluded.waters,
          journal_json = excluded.journal_json
      `)

      const persist = (next: GardenStore) => {
        upsertRow.run(
          next.moisture,
          next.wateredAt,
          next.sunlight,
          next.night ? 1 : 0,
          next.waters,
          JSON.stringify(encodeJournal(next.journal)),
        )
      }

      const initial = (now: number) =>
        record(
          { moisture: 54, wateredAt: now, sunlight: 65, night: false, waters: 0, journal: [] },
          "Your little world is ready to grow.",
          now,
        )

      const loadInitial = (now: number): GardenStore => {
        const row = selectRow.get() as GardenRow | undefined
        if (!row) {
          const seeded = initial(now)
          persist(seeded)
          return seeded
        }
        try {
          const parsedJournal = decodeJournal(JSON.parse(row.journal_json))
          if (Option.isNone(parsedJournal)) {
            const seeded = initial(now)
            persist(seeded)
            return seeded
          }
          return {
            moisture: Math.max(0, Math.min(100, row.moisture)),
            wateredAt: row.watered_at,
            sunlight: Math.max(10, Math.min(100, row.sunlight)),
            night: row.night !== 0,
            waters: Math.max(0, row.waters),
            journal: parsedJournal.value.slice(0, JOURNAL_LIMIT),
          }
        } catch {
          const seeded = initial(now)
          persist(seeded)
          return seeded
        }
      }

      const store = yield* Ref.make<GardenStore>(loadInitial(yield* Clock.currentTimeMillis))

      const get = Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        return view(yield* Ref.get(store), now)
      })

      const water = Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const outcome = yield* Ref.modify(
          store,
          (current): readonly [GardenView | GardenSaturated, GardenStore] => {
            const moisture = moistureAt(current, now)
            if (moisture >= SATURATED_AT) return [new GardenSaturated({ moisture }), current]
            const next = record(
              {
                ...current,
                moisture: Math.min(100, moisture + 15),
                wateredAt: now,
                waters: current.waters + 1,
              },
              "Gave the garden a gentle drink.",
              now,
            )
            persist(next)
            return [view(next, now), next]
          },
        )
        if (outcome instanceof GardenSaturated) return yield* outcome
        return outcome
      }).pipe(Effect.withSpan("Garden.water"))

      const updateSettings = Effect.fn("Garden.updateSettings")(function* (
        settings: GardenSettings,
      ) {
        const now = yield* Clock.currentTimeMillis
        return yield* Ref.modify(store, (current) => {
          let next: GardenStore = { ...current, ...settings }
          if (settings.night !== current.night) {
            next = record(
              next,
              settings.night ? "Tucked the garden in for the night." : "Let the sunshine back in.",
              now,
            )
          }
          persist(next)
          return [view(next, now), next] as const
        })
      })

      const reset = Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const next = initial(now)
        persist(next)
        yield* Ref.set(store, next)
        return view(next, now)
      }).pipe(Effect.withSpan("Garden.reset"))

      return Garden.of({ get, water, updateSettings, reset })
    }),
  )
}
