import {
  KANBAN_BOARD_MAX,
  KANBAN_NOTE_MAX,
  KANBAN_TITLE_MAX,
  type KanbanBoard,
  type KanbanCard,
  type KanbanStatus,
  type KanbanTag,
} from "@playground/contract"
import { Effect } from "effect"
import { assign, setup, stateIn } from "xstate"
import { ApiClient, clientRuntime } from "../../client/ApiClient.ts"
import { fromEffect } from "../../machines/fromEffect.ts"
import {
  acknowledgeKanbanSnapshot,
  createSnapshotToken,
  type KanbanOfflineSnapshot,
  loadKanbanOfflineSnapshot,
  publishKanbanMutation,
  saveKanbanOfflineSnapshot,
  withKanbanSyncLock,
} from "./offline.ts"

const SAVE_DELAY_MS = 250

export interface KanbanContext {
  cards: ReadonlyArray<KanbanCard>
  updatedAt: Date
  snapshotToken: string
  filterTag: KanbanTag | "all"
  search: string
  revision: number
  savingRevision: number
  retrySave: boolean
}

export type KanbanEvent =
  | {
      type: "ADD_CARD"
      id?: string | undefined
      title: string
      note: string
      status: KanbanStatus
      tag: KanbanTag
    }
  | {
      type: "MOVE_CARD"
      cardId: string
      toStatus: KanbanStatus
      beforeCardId?: string | null | undefined
    }
  | {
      type: "SHIFT_CARD"
      cardId: string
      direction: -1 | 1
    }
  | { type: "DELETE_CARD"; cardId: string }
  | { type: "SET_FILTER"; tag: KanbanTag | "all" }
  | { type: "SET_SEARCH"; search: string }
  | { type: "RESTORE_OFFLINE"; snapshot: KanbanOfflineSnapshot }
  | { type: "CLEAR_OFFLINE" }
  | { type: "REVALIDATE" }

const createCardId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `card-${crypto.randomUUID().slice(0, 8)}`
    : `card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

const isSameBoardOrder = (a: ReadonlyArray<KanbanCard>, b: ReadonlyArray<KanbanCard>): boolean =>
  a.length === b.length &&
  a.every(
    (card, index) =>
      card.id === b[index]?.id &&
      card.status === b[index]?.status &&
      card.title === b[index]?.title &&
      card.note === b[index]?.note &&
      card.tag === b[index]?.tag,
  )

export function moveCardInList(
  cards: ReadonlyArray<KanbanCard>,
  cardId: string,
  toStatus: KanbanStatus,
  beforeCardId?: string | null,
): ReadonlyArray<KanbanCard> {
  const existing = cards.find((card) => card.id === cardId)
  if (!existing) return cards
  if (beforeCardId === cardId && existing.status === toStatus) return cards

  const moved: KanbanCard = { ...existing, status: toStatus }
  const remaining = cards.filter((card) => card.id !== cardId)

  if (beforeCardId && beforeCardId !== cardId) {
    const targetIndex = remaining.findIndex((card) => card.id === beforeCardId)
    if (targetIndex !== -1) {
      return [...remaining.slice(0, targetIndex), moved, ...remaining.slice(targetIndex)]
    }
  }

  let lastInColumn = -1
  for (let i = 0; i < remaining.length; i++) {
    if (remaining[i]?.status === toStatus) lastInColumn = i
  }
  if (lastInColumn === -1) return [...remaining, moved]
  return [...remaining.slice(0, lastInColumn + 1), moved, ...remaining.slice(lastInColumn + 1)]
}

export function shiftCardInColumn(
  cards: ReadonlyArray<KanbanCard>,
  cardId: string,
  direction: -1 | 1,
): ReadonlyArray<KanbanCard> {
  const target = cards.find((card) => card.id === cardId)
  if (!target) return cards
  const columnIndices: number[] = []
  cards.forEach((card, index) => {
    if (card.status === target.status) columnIndices.push(index)
  })
  const position = columnIndices.findIndex((idx) => cards[idx]?.id === cardId)
  const swapPosition = position + direction
  if (position === -1 || swapPosition < 0 || swapPosition >= columnIndices.length) return cards
  const indexA = columnIndices[position]
  const indexB = columnIndices[swapPosition]
  if (indexA === undefined || indexB === undefined) return cards
  const next = [...cards]
  const cardA = next[indexA]
  const cardB = next[indexB]
  if (!cardA || !cardB) return cards
  next[indexA] = cardB
  next[indexB] = cardA
  return next
}

export function canAcceptNewCard(
  cards: ReadonlyArray<KanbanCard>,
  title: string,
  note: string,
): boolean {
  const trimmedTitle = title.trim()
  const trimmedNote = note.trim()
  return (
    cards.length < KANBAN_BOARD_MAX &&
    trimmedTitle.length >= 1 &&
    trimmedTitle.length <= KANBAN_TITLE_MAX &&
    trimmedNote.length <= KANBAN_NOTE_MAX
  )
}

const applyRestoreSnapshot = (context: KanbanContext, snapshot: KanbanOfflineSnapshot) => ({
  cards: snapshot.cards,
  updatedAt: snapshot.updatedAt,
  snapshotToken: snapshot.token,
  revision: context.revision + 1,
})

const applyCardMutation = (context: KanbanContext, nextCards: ReadonlyArray<KanbanCard>) => {
  if (isSameBoardOrder(context.cards, nextCards)) return {}
  const updatedAt = new Date()
  const token = createSnapshotToken()
  const persisted = saveKanbanOfflineSnapshot({
    token,
    cards: nextCards,
    updatedAt,
    pendingSave: true,
  })
  return {
    cards: nextCards,
    updatedAt,
    snapshotToken: persisted ? token : "",
    revision: context.revision + 1,
  }
}

const mutateFromEvent = (context: KanbanContext, event: KanbanEvent) => {
  switch (event.type) {
    case "ADD_CARD": {
      if (!canAcceptNewCard(context.cards, event.title, event.note)) return {}
      const nextCard: KanbanCard = {
        id: event.id ?? createCardId(),
        title: event.title.trim(),
        note: event.note.trim(),
        status: event.status,
        tag: event.tag,
      }
      return applyCardMutation(context, [nextCard, ...context.cards])
    }
    case "MOVE_CARD":
      return applyCardMutation(
        context,
        moveCardInList(context.cards, event.cardId, event.toStatus, event.beforeCardId),
      )
    case "SHIFT_CARD":
      return applyCardMutation(
        context,
        shiftCardInColumn(context.cards, event.cardId, event.direction),
      )
    case "DELETE_CARD":
      return applyCardMutation(
        context,
        context.cards.filter((card) => card.id !== event.cardId),
      )
    default:
      return {}
  }
}

export const reconcileKanbanSave = (
  input: { readonly cards: ReadonlyArray<KanbanCard>; readonly token: string },
  persisted: KanbanOfflineSnapshot | null,
):
  | { readonly action: "skip" }
  | {
      readonly action: "save"
      readonly cards: ReadonlyArray<KanbanCard>
      readonly tokenToAck: string
    } => {
  if (input.token === "") {
    return {
      action: "save",
      cards: input.cards,
      tokenToAck: persisted?.token ?? "",
    }
  }
  if (persisted === null) {
    return { action: "skip" }
  }
  if (persisted.token !== input.token) {
    return { action: "save", cards: persisted.cards, tokenToAck: persisted.token }
  }
  return { action: "save", cards: input.cards, tokenToAck: input.token }
}

const saveBoard = fromEffect(
  clientRuntime,
  (input: { cards: ReadonlyArray<KanbanCard>; token: string }) =>
    withKanbanSyncLock(
      Effect.gen(function* () {
        const api = yield* ApiClient
        const decision = reconcileKanbanSave(input, loadKanbanOfflineSnapshot())
        if (decision.action === "skip") {
          return yield* api.kanban.get()
        }
        const board = yield* api.kanban.save({ payload: { cards: decision.cards } })
        if (decision.tokenToAck !== "") {
          acknowledgeKanbanSnapshot(decision.tokenToAck)
        }
        publishKanbanMutation()
        return board
      }),
    ),
)

const readBoard = fromEffect(clientRuntime, (revision: number) =>
  Effect.gen(function* () {
    const api = yield* ApiClient
    return { board: yield* api.kanban.get(), revision }
  }),
)

const isEventEffective = (context: KanbanContext, event: KanbanEvent): boolean => {
  switch (event.type) {
    case "ADD_CARD":
      return canAcceptNewCard(context.cards, event.title, event.note)
    case "MOVE_CARD":
      return !isSameBoardOrder(
        context.cards,
        moveCardInList(context.cards, event.cardId, event.toStatus, event.beforeCardId),
      )
    case "SHIFT_CARD":
      return !isSameBoardOrder(
        context.cards,
        shiftCardInColumn(context.cards, event.cardId, event.direction),
      )
    case "DELETE_CARD":
      return context.cards.some((card) => card.id === event.cardId)
    default:
      return false
  }
}

export const kanbanMachine = setup({
  types: {
    input: {} as { board: KanbanBoard },
    context: {} as KanbanContext,
    events: {} as KanbanEvent,
  },
  actors: { saveBoard, readBoard },
  guards: {
    hasChanges: ({ context }) => context.revision !== context.savingRevision,
    canMutate: ({ context, event }) => isEventEffective(context, event),
  },
}).createMachine({
  id: "kanban",
  type: "parallel",
  context: ({ input }) => ({
    cards: input.board.cards,
    updatedAt: input.board.updatedAt,
    snapshotToken: "",
    filterTag: "all",
    search: "",
    revision: 0,
    savingRevision: 0,
    retrySave: false,
  }),
  states: {
    freshness: {
      initial: "idle",
      on: {
        REVALIDATE: { target: ".waiting" },
        SET_FILTER: {
          actions: assign({ filterTag: ({ event }) => event.tag }),
        },
        SET_SEARCH: {
          actions: assign({ search: ({ event }) => event.search }),
        },
      },
      states: {
        idle: {},
        waiting: {
          always: {
            guard: stateIn({ board: "saved" }),
            target: "loading",
          },
        },
        loading: {
          invoke: {
            src: "readBoard",
            input: ({ context }) => context.revision,
            onDone: {
              target: "idle",
              actions: assign(({ context, event }) =>
                event.output.revision === context.revision
                  ? {
                      cards: event.output.board.cards,
                      updatedAt: event.output.board.updatedAt,
                    }
                  : {},
              ),
            },
            onError: "idle",
          },
        },
      },
    },
    board: {
      initial: "saved",
      on: {
        ADD_CARD: {
          guard: "canMutate",
          target: ".pending",
          actions: assign(({ context, event }) => mutateFromEvent(context, event)),
        },
        MOVE_CARD: {
          guard: "canMutate",
          target: ".pending",
          actions: assign(({ context, event }) => mutateFromEvent(context, event)),
        },
        SHIFT_CARD: {
          guard: "canMutate",
          target: ".pending",
          actions: assign(({ context, event }) => mutateFromEvent(context, event)),
        },
        DELETE_CARD: {
          guard: "canMutate",
          target: ".pending",
          actions: assign(({ context, event }) => mutateFromEvent(context, event)),
        },
      },
      states: {
        saved: {
          on: {
            RESTORE_OFFLINE: [
              {
                guard: ({ event }) => event.snapshot.pendingSave,
                target: "unsaved",
                actions: assign(({ context, event }) =>
                  applyRestoreSnapshot(context, event.snapshot),
                ),
              },
            ],
          },
        },
        pending: {
          after: { [SAVE_DELAY_MS]: "saving" },
          on: {
            RESTORE_OFFLINE: [
              {
                guard: ({ event }) => event.snapshot.pendingSave,
                actions: assign(({ context, event }) =>
                  applyRestoreSnapshot(context, event.snapshot),
                ),
              },
            ],
          },
        },
        saving: {
          entry: assign({
            savingRevision: ({ context }) => context.revision,
            retrySave: false,
          }),
          on: {
            ADD_CARD: {
              guard: "canMutate",
              actions: assign(({ context, event }) => mutateFromEvent(context, event)),
            },
            MOVE_CARD: {
              guard: "canMutate",
              actions: assign(({ context, event }) => mutateFromEvent(context, event)),
            },
            SHIFT_CARD: {
              guard: "canMutate",
              actions: assign(({ context, event }) => mutateFromEvent(context, event)),
            },
            DELETE_CARD: {
              guard: "canMutate",
              actions: assign(({ context, event }) => mutateFromEvent(context, event)),
            },
            RESTORE_OFFLINE: [
              {
                guard: ({ event }) => event.snapshot.pendingSave,
                actions: assign(({ context, event }) =>
                  applyRestoreSnapshot(context, event.snapshot),
                ),
              },
            ],
            REVALIDATE: {
              actions: assign({ retrySave: true }),
            },
          },
          invoke: {
            src: "saveBoard",
            input: ({ context }) => ({ cards: context.cards, token: context.snapshotToken }),
            onDone: [
              {
                guard: "hasChanges",
                target: "pending",
              },
              {
                target: "saved",
                actions: assign(({ event }) => ({
                  cards: event.output.cards,
                  updatedAt: event.output.updatedAt,
                })),
              },
            ],
            onError: [
              {
                guard: "hasChanges",
                target: "pending",
              },
              {
                guard: ({ context }) => context.retrySave,
                target: "saving",
                reenter: true,
              },
              { target: "unsaved" },
            ],
          },
        },
        unsaved: {
          on: {
            REVALIDATE: { target: "saving" },
            CLEAR_OFFLINE: {
              target: "saved",
              actions: assign({ retrySave: false }),
            },
            RESTORE_OFFLINE: [
              {
                guard: ({ event }) => event.snapshot.pendingSave,
                actions: assign(({ context, event }) =>
                  applyRestoreSnapshot(context, event.snapshot),
                ),
              },
              {
                target: "saved",
              },
            ],
          },
        },
      },
    },
  },
})
