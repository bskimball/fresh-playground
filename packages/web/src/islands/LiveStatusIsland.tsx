import { Button } from "@astryxdesign/core/Button"
import { useAtomInitialValues, useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { Garden, Hello } from "@playground/contract"
import * as stylex from "@stylexjs/stylex"
import { Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useEffect } from "react"
import { ApiClient, seedAtom } from "../client/ApiClient.ts"
import { defineIsland } from "../client/hydrateIsland.ts"
import { Icon } from "../components/Icon.tsx"
import { watchFreshness } from "../features/terrarium/freshness.ts"
import { schemaJsonCodec } from "../machines/offlineSync.ts"
import { text } from "../styles/text.ts"
import { colors, media } from "../styles/tokens.stylex.ts"

const helloAtom = ApiClient.query("system", "hello", {})
const gardenAtom = ApiClient.query("garden", "get", {})

export const LiveStatusSnapshot = Schema.Struct({
  hello: Hello,
  garden: Garden,
})
export type LiveStatusSnapshot = typeof LiveStatusSnapshot.Type

const timeFormat = new Intl.DateTimeFormat("en", { timeStyle: "medium", timeZone: "UTC" })

/** Hydrated when visible. Seeds SSR snapshot into atoms, then refreshes via AtomHttpApi. */
export default function LiveStatusIsland(initial: LiveStatusSnapshot) {
  useAtomInitialValues([seedAtom(helloAtom, initial.hello), seedAtom(gardenAtom, initial.garden)])
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
    <div {...stylex.props(styles.console)}>
      <div {...stylex.props(styles.consoleHeader)}>
        <span {...stylex.props(styles.consoleLabel)}>
          <Icon name="spark" size={14} />
          <span>LIVE TELEMETRY CONSOLE</span>
        </span>
        <Button
          size="sm"
          label={waiting ? "Refreshing…" : "Refresh"}
          isDisabled={waiting}
          isLoading={waiting}
          onClick={() => {
            refreshHello()
            refreshGarden()
          }}
        />
      </div>
      <dl {...stylex.props(styles.grid)}>
        <div {...stylex.props(styles.endpointCard)}>
          <dt {...stylex.props(styles.term)}>
            <span {...stylex.props(styles.statusDot)} />
            <span>GET /api/hello</span>
          </dt>
          <dd {...stylex.props(styles.value, text.tabular)} aria-live="polite">
            {AsyncResult.match(hello, {
              onInitial: () => "Loading…",
              onFailure: () => "The server didn’t answer.",
              onSuccess: ({ value }) => `${value.message} (${timeFormat.format(value.time)} UTC)`,
            })}
          </dd>
        </div>
        <div {...stylex.props(styles.endpointCard)}>
          <dt {...stylex.props(styles.term)}>
            <span {...stylex.props(styles.statusDot)} />
            <span>GET /api/garden</span>
          </dt>
          <dd {...stylex.props(styles.value, text.tabular)} aria-live="polite">
            {AsyncResult.match(garden, {
              onInitial: () => "Loading…",
              onFailure: () => "The garden is unreachable.",
              onSuccess: ({ value }) =>
                `Moisture ${value.moisture}% · sunlight ${value.sunlight}% · ${
                  value.night ? "night" : "day"
                } · watered ${value.waters} times`,
            })}
          </dd>
        </div>
      </dl>
    </div>
  )
}

export const liveStatusIsland = defineIsland("live-status", LiveStatusIsland, {
  hydrate: "visible",
  codec: schemaJsonCodec(LiveStatusSnapshot),
})

const styles = stylex.create({
  console: {
    display: "grid",
    gap: 16,
    padding: 20,
    borderRadius: 18,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
  },
  consoleHeader: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  consoleLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.6,
    color: colors.mossDark,
  },
  grid: {
    margin: 0,
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(2, minmax(0, 1fr))",
      [media.mobile]: "1fr",
    },
    gap: 14,
  },
  endpointCard: {
    display: "grid",
    gap: 8,
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    boxShadow: colors.shadowSm,
  },
  term: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 11,
    letterSpacing: 0.8,
    fontWeight: 700,
    color: colors.sage,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    backgroundColor: colors.moss,
  },
  value: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.55,
    color: colors.ink,
  },
})
