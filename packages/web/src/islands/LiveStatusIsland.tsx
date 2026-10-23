import { Button } from "@astryxdesign/core/Button"
import { Card } from "@astryxdesign/core/Card"
import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import * as stylex from "@stylexjs/stylex"
import { AsyncResult } from "effect/reactivity"
import { useEffect } from "react"
import { watchFreshness } from "../features/terrarium/freshness.ts"
import { ApiClient } from "../client/ApiClient.ts"
import { AppTheme } from "../components/AppTheme.tsx"
import { colors } from "../styles/tokens.stylex.ts"

const helloAtom = ApiClient.query("system", "hello", {})
const gardenAtom = ApiClient.query("garden", "get", {})

const timeFormat = new Intl.DateTimeFormat("en", { timeStyle: "medium" })

/** Hydrated when visible. Reads the API through atoms, no hand-written fetch. */
export default function LiveStatusIsland() {
  const hello = useAtomValue(helloAtom)
  const garden = useAtomValue(gardenAtom)
  const refreshHello = useAtomRefresh(helloAtom)
  const refreshGarden = useAtomRefresh(gardenAtom)
  useEffect(
    () =>
      watchFreshness(() => {
        refreshHello()
        refreshGarden()
      }),
    [refreshHello, refreshGarden],
  )
  const waiting = hello.waiting || garden.waiting

  return (
    <AppTheme>
      <Card variant="muted" xstyle={styles.card}>
        <dl {...stylex.props(styles.list)}>
          <dt {...stylex.props(styles.term)}>GET /api/hello</dt>
          <dd {...stylex.props(styles.value)} aria-live="polite">
            {AsyncResult.match(hello, {
              onInitial: () => "Loading…",
              onFailure: () => "The server didn’t answer.",
              onSuccess: ({ value }) => `${value.message} (${timeFormat.format(value.time)})`,
            })}
          </dd>
          <dt {...stylex.props(styles.term)}>GET /api/garden</dt>
          <dd {...stylex.props(styles.value)} aria-live="polite">
            {AsyncResult.match(garden, {
              onInitial: () => "Loading…",
              onFailure: () => "The garden is unreachable.",
              onSuccess: ({ value }) =>
                `Moisture ${value.moisture}% · sunlight ${value.sunlight}% · ${
                  value.night ? "night" : "day"
                } · watered ${value.waters} times`,
            })}
          </dd>
        </dl>
        <Button
          label={waiting ? "Refreshing…" : "Refresh"}
          isDisabled={waiting}
          isLoading={waiting}
          onClick={() => {
            refreshHello()
            refreshGarden()
          }}
        />
      </Card>
    </AppTheme>
  )
}

const styles = stylex.create({
  card: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 16,
    marginTop: 12,
  },
  list: { margin: 0, display: "grid", gap: 4 },
  term: {
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: 700,
    color: colors.sage,
    marginTop: 8,
  },
  value: { margin: 0, fontSize: 13, color: colors.ink },
})
