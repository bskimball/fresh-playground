import { AppApi, type KanbanBoard, KanbanCard, type KanbanUpdate } from "@playground/contract"
import { Clock, Context, Effect, Layer, Option, Ref, Schema } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Events } from "./Events.ts"
import { Sqlite } from "./Sqlite.ts"

const cardsCodec = Schema.toCodecJson(Schema.Array(KanbanCard))
const encodeCards = Schema.encodeSync(cardsCodec)
const decodeCards = Schema.decodeUnknownOption(cardsCodec)

export const seedCards: ReadonlyArray<KanbanCard> = [
  {
    id: "seed-mist-canopy",
    title: "Mist the fern canopy before noon",
    note: "Keep humidity gentle around the upper fronds so new fiddleheads uncurl evenly.",
    status: "todo",
    tag: "care",
  },
  {
    id: "seed-propagation-log",
    title: "Sketch seasonal propagation notes",
    note: "Record which cuttings rooted fastest in warm afternoon light.",
    status: "todo",
    tag: "study",
  },
  {
    id: "seed-pebble-layer",
    title: "Refresh river-pebble drainage bed",
    note: "Rinse stones and top up activated charcoal along the north glass.",
    status: "todo",
    tag: "craft",
  },
  {
    id: "seed-sunlight-balance",
    title: "Balance morning sunlight exposure",
    note: "Holding the east louver at 65% for steady, unhurried leaf growth.",
    status: "doing",
    tag: "care",
  },
  {
    id: "seed-prune-runners",
    title: "Trim golden ground-cover runners",
    note: "Pinching back long stems to encourage a denser cushion beside the moss.",
    status: "doing",
    tag: "craft",
  },
  {
    id: "seed-settle-moss",
    title: "Anchor cushion moss by the oak stone",
    note: "Pressed into damp substrate; bright velvet tips have already taken hold.",
    status: "done",
    tag: "harvest",
  },
]

interface KanbanRow {
  readonly cards_json: string
  readonly updated_at: number
}

export class Kanban extends Context.Service<
  Kanban,
  {
    readonly get: Effect.Effect<KanbanBoard>
    readonly save: (update: KanbanUpdate) => Effect.Effect<KanbanBoard>
  }
>()("kanban/Kanban") {
  static readonly layer = Layer.effect(
    Kanban,
    Effect.gen(function* () {
      const database = yield* Sqlite
      const events = yield* Events
      database.exec(`
        CREATE TABLE IF NOT EXISTS kanban_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          cards_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `)

      const selectRow = database.prepare(
        `SELECT cards_json, updated_at FROM kanban_state WHERE id = 1`,
      )
      const upsertRow = database.prepare(`
        INSERT INTO kanban_state (id, cards_json, updated_at)
        VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          cards_json = excluded.cards_json,
          updated_at = excluded.updated_at
      `)

      const persist = (board: KanbanBoard) => {
        upsertRow.run(JSON.stringify(encodeCards(board.cards)), board.updatedAt.getTime())
      }

      const loadInitial = (now: number): KanbanBoard => {
        const row = selectRow.get() as KanbanRow | undefined
        if (!row) {
          const seeded: KanbanBoard = { cards: seedCards, updatedAt: new Date(now) }
          persist(seeded)
          return seeded
        }
        try {
          const parsed = decodeCards(JSON.parse(row.cards_json))
          if (Option.isNone(parsed)) {
            const seeded: KanbanBoard = { cards: seedCards, updatedAt: new Date(now) }
            persist(seeded)
            return seeded
          }
          return {
            cards: parsed.value,
            updatedAt: new Date(row.updated_at),
          }
        } catch {
          const seeded: KanbanBoard = { cards: seedCards, updatedAt: new Date(now) }
          persist(seeded)
          return seeded
        }
      }

      const now = yield* Clock.currentTimeMillis
      const store = yield* Ref.make<KanbanBoard>(loadInitial(now))

      const get = Ref.get(store)

      const save = Effect.fn("Kanban.save")(function* (update: KanbanUpdate) {
        const timestamp = yield* Clock.currentTimeMillis
        const next: KanbanBoard = {
          cards: update.cards,
          updatedAt: new Date(timestamp),
        }
        events.commit("kanban", () => persist(next))
        yield* Ref.set(store, next)
        return next
      })

      return Kanban.of({ get, save })
    }),
  ).pipe(Layer.provide(Events.layer))
}

export const KanbanHandlers = HttpApiBuilder.group(
  AppApi,
  "kanban",
  Effect.fn(function* (handlers) {
    const kanban = yield* Kanban
    return handlers.handleAll({
      get: () => kanban.get,
      save: ({ payload }) => kanban.save(payload),
    })
  }),
)
