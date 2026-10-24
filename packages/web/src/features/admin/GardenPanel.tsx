import { Button } from "@astryxdesign/core/Button"
import { Card } from "@astryxdesign/core/Card"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as stylex from "@stylexjs/stylex"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useState } from "react"
import { ApiClient } from "../../client/ApiClient.ts"
import { text } from "../../styles/text.ts"
import { colors, media } from "../../styles/tokens.stylex.ts"
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
    <Card xstyle={styles.card}>
      <div aria-live="polite" {...stylex.props(styles.telemetryWrap)}>
        {AsyncResult.match(garden, {
          onInitial: () => <p {...stylex.props(styles.summary)}>Loading…</p>,
          onFailure: () => <p {...stylex.props(styles.summary)}>The garden is unreachable.</p>,
          onSuccess: ({ value }) => (
            <div {...stylex.props(styles.statsGrid)}>
              <div {...stylex.props(styles.statTile)}>
                <span {...stylex.props(styles.statLabel)}>Soil moisture</span>
                <strong {...stylex.props(text.serif, text.tabular, styles.statValue)}>
                  {value.moisture}%
                </strong>
              </div>
              <div {...stylex.props(styles.statTile)}>
                <span {...stylex.props(styles.statLabel)}>Sunlight</span>
                <strong {...stylex.props(text.serif, text.tabular, styles.statValue)}>
                  {value.sunlight}%
                </strong>
              </div>
              <div {...stylex.props(styles.statTile)}>
                <span {...stylex.props(styles.statLabel)}>Total waterings</span>
                <strong {...stylex.props(text.serif, text.tabular, styles.statValue)}>
                  {value.waters}
                </strong>
              </div>
              <div {...stylex.props(styles.statTile)}>
                <span {...stylex.props(styles.statLabel)}>Journal entries</span>
                <strong {...stylex.props(text.serif, text.tabular, styles.statValue)}>
                  {value.journal.length}
                </strong>
              </div>
            </div>
          ),
        })}
      </div>

      <div {...stylex.props(styles.dangerZone)}>
        <div {...stylex.props(styles.dangerCopy)}>
          <strong {...stylex.props(styles.dangerTitle)}>Reset shared conservatory</strong>
          <p {...stylex.props(styles.summary, text.pretty)}>
            Restores moisture and sunlight to their initial balance and clears all recorded field
            journal entries.
          </p>
        </div>
        <Button
          variant="destructive"
          label="Reset garden"
          isLoading={pending}
          isDisabled={pending}
          onClick={() => void onReset()}
        />
      </div>

      {message && (
        <p role="status" {...stylex.props(styles.statusPill)}>
          {message}
        </p>
      )}
    </Card>
  )
}

const styles = stylex.create({
  card: {
    display: "grid",
    gap: 20,
    paddingBlock: 24,
    paddingInline: 24,
    borderRadius: 20,
  },
  telemetryWrap: {
    minWidth: 0,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(4, minmax(0, 1fr))",
      [media.tablet]: "repeat(2, minmax(0, 1fr))",
      [media.mobile]: "1fr",
    },
    gap: 12,
  },
  statTile: {
    display: "grid",
    gap: 6,
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.4,
    color: colors.muted,
  },
  statValue: {
    fontSize: 32,
    lineHeight: 1.05,
    letterSpacing: -0.8,
    color: colors.ink,
  },
  dangerZone: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.borderSubtle,
  },
  dangerCopy: {
    display: "grid",
    gap: 4,
    maxWidth: 460,
  },
  dangerTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: colors.ink,
  },
  summary: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.55,
    color: colors.muted,
  },
  statusPill: {
    margin: 0,
    justifySelf: "start",
    paddingBlock: 6,
    paddingInline: 12,
    borderRadius: 999,
    backgroundColor: colors.surfaceTint,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    fontSize: 12,
    fontWeight: 500,
    color: colors.ink,
  },
})
