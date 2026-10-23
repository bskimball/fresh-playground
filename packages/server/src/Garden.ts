import {
  GardenSaturated,
  type GardenSettings,
  type Garden as GardenView,
  type JournalEntry,
  SATURATED_AT,
} from "@playground/contract"
import { Clock, Context, Effect, Layer, Ref } from "effect"

const JOURNAL_LIMIT = 20
const DRY_FLOOR = 20
const DRY_MS_PER_POINT = 60_000

interface Store {
  readonly moisture: number
  readonly wateredAt: number
  readonly sunlight: number
  readonly night: boolean
  readonly waters: number
  readonly journal: ReadonlyArray<JournalEntry>
}

// Soil dries one point per minute after watering, down to a floor.
const moistureAt = (store: Store, now: number) =>
  Math.max(
    Math.min(store.moisture, DRY_FLOOR),
    store.moisture - Math.floor((now - store.wateredAt) / DRY_MS_PER_POINT),
  )

const view = (store: Store, now: number): GardenView => ({
  moisture: moistureAt(store, now),
  sunlight: store.sunlight,
  night: store.night,
  waters: store.waters,
  journal: store.journal,
})

const record = (store: Store, text: string, now: number): Store => ({
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
      const initial = (now: number) =>
        record(
          { moisture: 54, wateredAt: now, sunlight: 65, night: false, waters: 0, journal: [] },
          "Your little world is ready to grow.",
          now,
        )
      const store = yield* Ref.make<Store>(initial(yield* Clock.currentTimeMillis))

      const get = Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        return view(yield* Ref.get(store), now)
      })

      const water = Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const outcome = yield* Ref.modify(
          store,
          (current): readonly [GardenView | GardenSaturated, Store] => {
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
          let next: Store = { ...current, ...settings }
          if (settings.night !== current.night) {
            next = record(
              next,
              settings.night ? "Tucked the garden in for the night." : "Let the sunshine back in.",
              now,
            )
          }
          return [view(next, now), next] as const
        })
      })

      const reset = Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const next = initial(now)
        yield* Ref.set(store, next)
        return view(next, now)
      }).pipe(Effect.withSpan("Garden.reset"))

      return Garden.of({ get, water, updateSettings, reset })
    }),
  )
}
