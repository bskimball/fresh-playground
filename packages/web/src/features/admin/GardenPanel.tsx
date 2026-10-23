import { Button } from "@astryxdesign/core/Button"
import { Card } from "@astryxdesign/core/Card"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as stylex from "@stylexjs/stylex"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useState } from "react"
import { ApiClient } from "../../client/ApiClient.ts"
import { AppTheme } from "../../components/AppTheme.tsx"
import { colors } from "../../styles/tokens.stylex.ts"
import { publishGardenMutation } from "../terrarium/freshness.ts"

const gardenKey = ["garden"]
const gardenAtom = ApiClient.query("garden", "get", { reactivityKeys: gardenKey })
const resetAtom = ApiClient.mutation("admin", "resetGarden")

/** Shows the shared garden and resets it through the admin API. */
export default function GardenPanel() {
  const garden = useAtomValue(gardenAtom)
  const reset = useAtomSet(resetAtom, { mode: "promiseExit" })
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const onReset = async () => {
    if (!window.confirm("Reset the garden and clear its journal?")) return
    setPending(true)
    const exit = await reset({ reactivityKeys: gardenKey })
    setPending(false)
    if (Exit.isSuccess(exit)) publishGardenMutation()
    setMessage(Exit.isSuccess(exit) ? "Garden reset." : "The garden couldn’t be reset.")
  }

  return (
    <AppTheme>
      <Card xstyle={styles.card}>
        <p {...stylex.props(styles.summary)} aria-live="polite">
          {AsyncResult.match(garden, {
            onInitial: () => "Loading…",
            onFailure: () => "The garden is unreachable.",
            onSuccess: ({ value }) =>
              `Moisture ${value.moisture}% · sunlight ${value.sunlight}% · watered ${value.waters} times · ${value.journal.length} journal entries`,
          })}
        </p>
        <Button
          variant="destructive"
          label="Reset garden"
          isLoading={pending}
          isDisabled={pending}
          onClick={() => void onReset()}
        />
        {message && (
          <p role="status" {...stylex.props(styles.summary)}>
            {message}
          </p>
        )}
      </Card>
    </AppTheme>
  )
}

const styles = stylex.create({
  card: { display: "grid", gap: 14, justifyItems: "start" },
  summary: { margin: 0, fontSize: 13, color: colors.muted },
})
