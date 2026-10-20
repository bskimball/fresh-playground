import {
  type Garden,
  GardenSaturated,
  type GardenSettings,
  SATURATED_AT,
} from "@playground/contract"
import { Effect } from "effect"
import { assign, setup } from "xstate"
import { ApiClient, clientRuntime } from "../../client/ApiClient.ts"
import { fromEffect } from "../../machines/fromEffect.ts"

const SAVE_DELAY_MS = 400

const waterGarden = fromEffect(clientRuntime, () =>
  Effect.gen(function* () {
    const api = yield* ApiClient
    return yield* api.garden.water()
  }),
)

const saveSettings = fromEffect(clientRuntime, (settings: GardenSettings) =>
  Effect.gen(function* () {
    const api = yield* ApiClient
    return yield* api.garden.settings({ payload: settings })
  }),
)

/**
 * Two independent regions:
 * - `watering`: one request at a time; the server decides when soil is saturated.
 * - `settings`: sunlight/night are applied locally right away, then saved after
 *   a short pause. A new change re-enters `pending`, which cancels an
 *   in-flight save.
 */
export const careMachine = setup({
  types: {
    input: {} as { garden: Garden },
    context: {} as {
      garden: Garden
      sunlight: number
      night: boolean
      message: string
    },
    events: {} as
      | { type: "WATER" }
      | { type: "SET_SUNLIGHT"; sunlight: number }
      | { type: "TOGGLE_NIGHT" },
  },
  actors: { waterGarden, saveSettings },
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
    message: input.garden.night
      ? "Shhh. Even tiny gardens need a little rest."
      : "A tiny world, happy to see you.",
  }),
  states: {
    watering: {
      initial: "idle",
      states: {
        idle: {
          on: { WATER: { guard: "hasRoom", target: "pouring" } },
        },
        pouring: {
          invoke: {
            src: "waterGarden",
            onDone: {
              target: "idle",
              actions: assign({
                garden: ({ event }) => event.output,
                message: "A little rain. A lot of happiness.",
              }),
            },
            onError: {
              target: "idle",
              actions: assign(({ context, event }) =>
                event.error instanceof GardenSaturated
                  ? {
                      garden: { ...context.garden, moisture: event.error.moisture },
                      message: "The soil is already soaked. Maybe later.",
                    }
                  : { message: "The watering can slipped. Try again?" },
              ),
            },
          },
        },
      },
    },
    settings: {
      initial: "saved",
      // Handled on this region (without `reenter`) so the transition only
      // exits and re-enters the active settings state: the debounce restarts
      // and an in-flight save is cancelled, but watering is left alone.
      on: {
        SET_SUNLIGHT: {
          guard: "isDay",
          target: ".pending",
          actions: assign({ sunlight: ({ event }) => event.sunlight }),
        },
        TOGGLE_NIGHT: {
          target: ".pending",
          actions: assign(({ context }) => ({
            night: !context.night,
            message: context.night
              ? "Good morning, little leaves."
              : "Shhh. Even tiny gardens need a little rest.",
          })),
        },
      },
      states: {
        saved: {},
        pending: {
          after: { [SAVE_DELAY_MS]: "saving" },
        },
        saving: {
          invoke: {
            src: "saveSettings",
            input: ({ context }) => ({ sunlight: context.sunlight, night: context.night }),
            onDone: {
              target: "saved",
              actions: assign({ garden: ({ event }) => event.output }),
            },
            onError: { target: "unsaved" },
          },
        },
        unsaved: {},
      },
    },
  },
})
