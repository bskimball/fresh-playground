import { Cause, type Effect, Exit, type ManagedRuntime } from "effect"
import { fromPromise } from "xstate"

/**
 * XState actor logic backed by an Effect.
 *
 * When the machine leaves the invoking state, XState aborts `signal`, which
 * interrupts the fiber (and any in-flight `fetch`). Expected failures reach
 * `onError` as the typed error value, so `instanceof` narrows them.
 */
export const fromEffect = <A, E, I, R, ER>(
  runtime: ManagedRuntime.ManagedRuntime<R, ER>,
  run: (input: I) => Effect.Effect<A, E, R>,
) =>
  fromPromise<A, I>(async ({ input, signal }) => {
    const exit = await runtime.runPromiseExit(run(input), { signal })
    if (Exit.isSuccess(exit)) return exit.value
    throw Cause.squash(exit.cause)
  })
