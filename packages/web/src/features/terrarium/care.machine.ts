import {
  type Garden,
  GardenSaturated,
  type GardenSettings,
  SATURATED_AT,
} from "@playground/contract"
import { Effect } from "effect"
import { assign, setup, stateIn } from "xstate"
import { ApiClient, clientRuntime } from "../../client/ApiClient.ts"
import { fromEffect } from "../../machines/fromEffect.ts"
import { publishGardenMutation } from "./freshness.ts"
import {
  loadOfflineSnapshot,
  type OfflineSnapshot,
  saveOfflineSnapshot,
  withSyncLock,
} from "./offline.ts"

const SAVE_DELAY_MS = 400
const JOURNAL_LIMIT = 20

const appendJournal = (garden: Garden, text: string): Garden["journal"] =>
  [{ id: (garden.journal[0]?.id ?? 0) + 1, text, at: new Date() }, ...garden.journal].slice(
    0,
    JOURNAL_LIMIT,
  )

const applyOptimisticWater = (garden: Garden): Garden => ({
  ...garden,
  moisture: Math.min(100, garden.moisture + 15),
  waters: garden.waters + 1,
  journal: appendJournal(garden, "Gave the garden a gentle drink."),
})

interface CareContext {
  garden: Garden
  sunlight: number
  night: boolean
  message: string
  revision: number
  saving: GardenSettings | null
  pendingWaters: number
  pendingSettings: boolean
  retryWater: boolean
  retrySettings: boolean
}

const persistOfflineWater = (context: CareContext, garden: Garden, pendingWaters: number) => {
  const existing = loadOfflineSnapshot()
  saveOfflineSnapshot({
    garden,
    sunlight: existing?.pendingSettings ? existing.sunlight : context.sunlight,
    night: existing?.pendingSettings ? existing.night : context.night,
    pendingWaters,
    pendingSettings: existing?.pendingSettings ?? context.pendingSettings,
  })
}

const persistOfflineSettings = (
  context: CareContext,
  overrides: { garden?: Garden; sunlight?: number; night?: boolean; pendingSettings: boolean },
) => {
  const existing = loadOfflineSnapshot()
  const pendingWaters = existing?.pendingWaters ?? context.pendingWaters
  saveOfflineSnapshot({
    garden: pendingWaters > 0 && existing ? existing.garden : (overrides.garden ?? context.garden),
    sunlight: overrides.sunlight ?? context.sunlight,
    night: overrides.night ?? context.night,
    pendingWaters,
    pendingSettings: overrides.pendingSettings,
  })
}

const applyToggleNight = (context: CareContext) => {
  const night = !context.night
  const garden: Garden = {
    ...context.garden,
    night,
    journal: appendJournal(
      context.garden,
      night ? "Tucked the garden in for the night." : "Let the sunshine back in.",
    ),
  }
  persistOfflineSettings(context, { garden, night, pendingSettings: true })
  return {
    night,
    garden,
    pendingSettings: true,
    revision: context.revision + 1,
    message: night ? "Shhh. Even tiny gardens need a little rest." : "Good morning, little leaves.",
  }
}

const applyRestoreOffline = (context: CareContext, snapshot: OfflineSnapshot) => ({
  garden: snapshot.garden,
  sunlight: snapshot.sunlight,
  night: snapshot.night,
  pendingWaters: snapshot.pendingWaters,
  pendingSettings: snapshot.pendingSettings,
  revision: context.revision + 1,
  message: "Saved offline. Will sync when back online.",
})

const waterGarden = fromEffect(clientRuntime, () =>
  Effect.gen(function* () {
    const api = yield* ApiClient
    const garden = yield* api.garden.water()
    publishGardenMutation()
    return garden
  }),
)

const syncOneWater = fromEffect(clientRuntime, () =>
  withSyncLock(
    Effect.gen(function* () {
      const api = yield* ApiClient
      const before = loadOfflineSnapshot()
      if (typeof localStorage !== "undefined" && (before === null || before.pendingWaters <= 0)) {
        return { garden: yield* api.garden.get(), alreadySynced: true }
      }
      const garden = yield* api.garden.water()
      const after = loadOfflineSnapshot()
      if (after !== null) {
        const remainingWaters = Math.max(0, after.pendingWaters - 1)
        saveOfflineSnapshot({
          ...after,
          garden: remainingWaters > 0 ? after.garden : garden,
          pendingWaters: remainingWaters,
        })
      }
      publishGardenMutation()
      return { garden, alreadySynced: false }
    }),
  ),
)

const saveSettings = fromEffect(clientRuntime, (settings: GardenSettings) =>
  withSyncLock(
    Effect.gen(function* () {
      const api = yield* ApiClient
      const garden = yield* api.garden.settings({ payload: settings })
      publishGardenMutation()
      return garden
    }),
  ),
)

const readGarden = fromEffect(clientRuntime, (revision: number) =>
  Effect.gen(function* () {
    const api = yield* ApiClient
    return { garden: yield* api.garden.get(), revision }
  }),
)

/**
 * Three coordinated regions:
 * - `watering`: one request at a time; queues optimistically if offline and replays one by one on reconnect.
 * - `settings`: sunlight/night apply locally right away, then save after a short pause.
 * - `freshness`: waits until queued waters and settings finish syncing before reading the server.
 */
export const careMachine = setup({
  types: {
    input: {} as { garden: Garden },
    context: {} as CareContext,
    events: {} as
      | { type: "REVALIDATE" }
      | { type: "RESTORE_OFFLINE"; snapshot: OfflineSnapshot }
      | { type: "CLEAR_OFFLINE" }
      | { type: "WATER" }
      | { type: "SET_SUNLIGHT"; sunlight: number }
      | { type: "TOGGLE_NIGHT" },
  },
  actors: { waterGarden, syncOneWater, saveSettings, readGarden },
  guards: {
    hasRoom: ({ context }) => context.garden.moisture < SATURATED_AT,
    isDay: ({ context }) => !context.night,
  },
}).createMachine({
  id: "care",
  type: "parallel",
  context: ({ input }) => ({
    garden: input.garden,
    sunlight: input.garden.sunlight,
    night: input.garden.night,
    revision: 0,
    saving: null,
    pendingWaters: 0,
    pendingSettings: false,
    retryWater: false,
    retrySettings: false,
    message: input.garden.night
      ? "Shhh. Even tiny gardens need a little rest."
      : "A tiny world, happy to see you.",
  }),
  states: {
    freshness: {
      initial: "idle",
      on: { REVALIDATE: { target: ".waiting" } },
      states: {
        idle: {},
        waiting: {
          always: {
            guard: stateIn({ settings: "saved", watering: "idle" }),
            target: "loading",
          },
        },
        loading: {
          invoke: {
            src: "readGarden",
            input: ({ context }) => context.revision,
            onDone: {
              target: "idle",
              actions: assign(({ context, event }) =>
                event.output.revision === context.revision
                  ? {
                      garden: event.output.garden,
                      sunlight: event.output.garden.sunlight,
                      night: event.output.garden.night,
                    }
                  : {},
              ),
            },
            onError: "idle",
          },
        },
      },
    },
    watering: {
      initial: "idle",
      on: {
        CLEAR_OFFLINE: {
          target: ".idle",
          actions: assign({ pendingWaters: 0, retryWater: false }),
        },
      },
      states: {
        idle: {
          on: {
            WATER: {
              guard: "hasRoom",
              target: "pouring",
              actions: assign({ revision: ({ context }) => context.revision + 1 }),
            },
            RESTORE_OFFLINE: [
              {
                guard: ({ event }) => event.snapshot.pendingWaters > 0,
                target: "queued",
                actions: assign(({ context, event }) =>
                  applyRestoreOffline(context, event.snapshot),
                ),
              },
              {
                actions: assign(({ context, event }) =>
                  applyRestoreOffline(context, event.snapshot),
                ),
              },
            ],
          },
        },
        pouring: {
          entry: assign({ retryWater: false }),
          on: {
            REVALIDATE: {
              actions: assign({ retryWater: true }),
            },
          },
          invoke: {
            src: "waterGarden",
            onDone: {
              target: "idle",
              actions: assign(({ context, event }) => {
                const garden: Garden = {
                  ...context.garden,
                  moisture: event.output.moisture,
                  waters: event.output.waters,
                  journal: event.output.journal,
                }
                persistOfflineWater(context, garden, 0)
                return {
                  garden,
                  pendingWaters: 0,
                  message: "A little rain. A lot of happiness.",
                }
              }),
            },
            onError: [
              {
                guard: ({ event }) => event.error instanceof GardenSaturated,
                target: "idle",
                actions: assign(({ context, event }) => {
                  const moisture =
                    event.error instanceof GardenSaturated
                      ? event.error.moisture
                      : context.garden.moisture
                  const garden: Garden = { ...context.garden, moisture }
                  persistOfflineWater(context, garden, 0)
                  return {
                    garden,
                    pendingWaters: 0,
                    message: "The soil is already soaked. Maybe later.",
                  }
                }),
              },
              {
                guard: ({ context }) => context.retryWater,
                target: "syncing",
                actions: assign(({ context }) => {
                  const garden = applyOptimisticWater(context.garden)
                  const pendingWaters = context.pendingWaters + 1
                  persistOfflineWater(context, garden, pendingWaters)
                  return {
                    garden,
                    pendingWaters,
                    retryWater: false,
                    message: "Saved offline. Will sync when back online.",
                  }
                }),
              },
              {
                target: "queued",
                actions: assign(({ context }) => {
                  const garden = applyOptimisticWater(context.garden)
                  const pendingWaters = context.pendingWaters + 1
                  persistOfflineWater(context, garden, pendingWaters)
                  return {
                    garden,
                    pendingWaters,
                    message: "Saved offline. Will sync when back online.",
                  }
                }),
              },
            ],
          },
        },
        queued: {
          on: {
            WATER: {
              guard: "hasRoom",
              target: "syncing",
              actions: assign(({ context }) => {
                const garden = applyOptimisticWater(context.garden)
                const pendingWaters = context.pendingWaters + 1
                persistOfflineWater(context, garden, pendingWaters)
                return {
                  garden,
                  pendingWaters,
                  revision: context.revision + 1,
                  message: "Saved offline. Will sync when back online.",
                }
              }),
            },
            RESTORE_OFFLINE: [
              {
                guard: ({ event }) => event.snapshot.pendingWaters > 0,
                actions: assign(({ context, event }) =>
                  applyRestoreOffline(context, event.snapshot),
                ),
              },
              {
                target: "idle",
                actions: assign(({ context, event }) =>
                  applyRestoreOffline(context, event.snapshot),
                ),
              },
            ],
            REVALIDATE: { target: "syncing" },
          },
        },
        syncing: {
          entry: assign({ retryWater: false }),
          on: {
            WATER: {
              guard: "hasRoom",
              actions: assign(({ context }) => {
                const garden = applyOptimisticWater(context.garden)
                const pendingWaters = context.pendingWaters + 1
                persistOfflineWater(context, garden, pendingWaters)
                return {
                  garden,
                  pendingWaters,
                  revision: context.revision + 1,
                  message: "Saved offline. Will sync when back online.",
                }
              }),
            },
            REVALIDATE: {
              actions: assign({ retryWater: true }),
            },
          },
          invoke: {
            src: "syncOneWater",
            onDone: [
              {
                guard: ({ context, event }) =>
                  !event.output.alreadySynced && context.pendingWaters > 1,
                target: "syncing",
                reenter: true,
                actions: assign(({ context, event }) => {
                  const pendingWaters = Math.max(0, context.pendingWaters - 1)
                  const garden: Garden = {
                    ...context.garden,
                    moisture: Math.min(100, event.output.garden.moisture + pendingWaters * 15),
                    waters: event.output.garden.waters + pendingWaters,
                  }
                  persistOfflineWater(context, garden, pendingWaters)
                  return { garden, pendingWaters }
                }),
              },
              {
                target: "idle",
                actions: assign(({ context, event }) => {
                  const garden: Garden = {
                    ...context.garden,
                    moisture: event.output.garden.moisture,
                    waters: event.output.garden.waters,
                    journal: event.output.garden.journal,
                  }
                  persistOfflineWater(context, garden, 0)
                  return {
                    garden,
                    pendingWaters: 0,
                    message: "A little rain. A lot of happiness.",
                  }
                }),
              },
            ],
            onError: [
              {
                guard: ({ event }) => event.error instanceof GardenSaturated,
                target: "idle",
                actions: assign(({ context, event }) => {
                  const moisture =
                    event.error instanceof GardenSaturated
                      ? event.error.moisture
                      : context.garden.moisture
                  const garden: Garden = { ...context.garden, moisture }
                  persistOfflineWater(context, garden, 0)
                  return {
                    garden,
                    pendingWaters: 0,
                    message: "The soil is already soaked. Maybe later.",
                  }
                }),
              },
              {
                guard: ({ context }) => context.retryWater,
                target: "syncing",
                reenter: true,
                actions: assign({ retryWater: false }),
              },
              {
                target: "queued",
              },
            ],
          },
        },
      },
    },
    settings: {
      initial: "saved",
      // Saving overrides these transitions so an active write is never cancelled.
      on: {
        SET_SUNLIGHT: {
          guard: "isDay",
          target: ".pending",
          actions: assign(({ context, event }) => {
            persistOfflineSettings(context, { sunlight: event.sunlight, pendingSettings: true })
            return {
              sunlight: event.sunlight,
              pendingSettings: true,
              revision: context.revision + 1,
            }
          }),
        },
        TOGGLE_NIGHT: {
          target: ".pending",
          actions: assign(({ context }) => applyToggleNight(context)),
        },
        CLEAR_OFFLINE: {
          target: ".saved",
          actions: assign({ pendingSettings: false, retrySettings: false }),
        },
      },
      states: {
        saved: {
          on: {
            RESTORE_OFFLINE: [
              {
                guard: ({ event }) => event.snapshot.pendingSettings,
                target: "unsaved",
              },
            ],
          },
        },
        pending: {
          after: { [SAVE_DELAY_MS]: "saving" },
        },
        saving: {
          entry: assign({
            saving: ({ context }) => ({ sunlight: context.sunlight, night: context.night }),
            retrySettings: false,
          }),
          on: {
            SET_SUNLIGHT: {
              guard: "isDay",
              actions: assign(({ context, event }) => {
                persistOfflineSettings(context, { sunlight: event.sunlight, pendingSettings: true })
                return {
                  sunlight: event.sunlight,
                  pendingSettings: true,
                  revision: context.revision + 1,
                }
              }),
            },
            TOGGLE_NIGHT: {
              actions: assign(({ context }) => applyToggleNight(context)),
            },
            REVALIDATE: {
              actions: assign({ retrySettings: true }),
            },
          },
          invoke: {
            src: "saveSettings",
            input: ({ context }) => ({ sunlight: context.sunlight, night: context.night }),
            onDone: [
              {
                guard: ({ context }) =>
                  context.sunlight !== context.saving?.sunlight ||
                  context.night !== context.saving?.night,
                target: "pending",
              },
              {
                target: "saved",
                actions: assign(({ context, event }) => {
                  const garden = context.pendingWaters > 0 ? context.garden : event.output
                  persistOfflineSettings(context, { garden, pendingSettings: false })
                  return {
                    garden,
                    pendingSettings: false,
                  }
                }),
              },
            ],
            onError: [
              {
                guard: ({ context }) =>
                  context.sunlight !== context.saving?.sunlight ||
                  context.night !== context.saving?.night,
                target: "pending",
              },
              {
                guard: ({ context }) => context.retrySettings,
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
            RESTORE_OFFLINE: [
              {
                guard: ({ event }) => !event.snapshot.pendingSettings,
                target: "saved",
              },
            ],
          },
        },
      },
    },
  },
})
