import { Button } from "@astryxdesign/core/Button"
import { Card } from "@astryxdesign/core/Card"
import { IconButton } from "@astryxdesign/core/IconButton"
import { Slider } from "@astryxdesign/core/Slider"
import { Garden, SATURATED_AT } from "@playground/contract"
import * as stylex from "@stylexjs/stylex"
import { useActorRef, useSelector } from "@xstate/react"
import { useEffect } from "react"
import { defineIsland } from "../../client/hydrateIsland.ts"
import { AppTheme } from "../../components/AppTheme.tsx"
import { Icon } from "../../components/Icon.tsx"
import { schemaJsonCodec } from "../../machines/offlineSync.ts"
import { text } from "../../styles/text.ts"
import { colors, fonts, media } from "../../styles/tokens.stylex.ts"
import { careMachine } from "./care.machine.ts"
import { watchFreshness } from "./freshness.ts"
import { loadOfflineSnapshot, watchOfflineSnapshots } from "./offline.ts"
import { TerrariumScene } from "./TerrariumScene.tsx"

const moistureNote = (moisture: number) =>
  moisture >= SATURATED_AT
    ? "A lovely drink. That’s plenty for now."
    : moisture >= 65
      ? "Nicely watered. Happy little roots."
      : "Room for a little refreshment."

const sunlightNote = (sunlight: number, night: boolean) => {
  if (night) return "The leaves are taking a well-earned rest."
  if (sunlight > 80) return "A bright and sunny little corner."
  if (sunlight < 35) return "Soft shade for a slower kind of day."
  return "Just the right amount of golden light."
}

const formatSyncStatus = (
  settings: "saved" | "pending" | "saving" | "unsaved",
  watering: "idle" | "pouring" | "queued" | "syncing",
) => {
  if (watering === "syncing" || settings === "pending" || settings === "saving") return "Saving…"
  if (watering === "queued" || settings === "unsaved") {
    return "Saved offline. Will sync when back online."
  }
  return ""
}

export const terrariumIsland = defineIsland("terrarium", schemaJsonCodec(Garden))

/** Hydrated island. The server seeds it with the garden it just loaded. */
export default function TerrariumIsland({ garden: initial }: { garden: Garden }) {
  const care = useActorRef(careMachine, { input: { garden: initial } })
  useEffect(() => {
    const offline = loadOfflineSnapshot()
    if (offline) care.send({ type: "RESTORE_OFFLINE", snapshot: offline })
    const stopOffline = watchOfflineSnapshots((next) => {
      if (next) {
        care.send({ type: "RESTORE_OFFLINE", snapshot: next })
      } else {
        care.send({ type: "CLEAR_OFFLINE" })
        care.send({ type: "REVALIDATE" })
      }
    })
    const stopFreshness = watchFreshness(() => care.send({ type: "REVALIDATE" }))
    return () => {
      stopOffline()
      stopFreshness()
    }
  }, [care])
  const garden = useSelector(care, (s) => s.context.garden)
  const sunlight = useSelector(care, (s) => s.context.sunlight)
  const night = useSelector(care, (s) => s.context.night)
  const message = useSelector(care, (s) => s.context.message)
  const watering = useSelector(care, (s) => s.value.watering)
  const pouring = watering === "pouring"
  const settings = useSelector(care, (s) => s.value.settings)

  const saturated = garden.moisture >= SATURATED_AT

  return (
    <AppTheme>
      <div {...stylex.props(styles.layout)}>
        <section
          {...stylex.props(styles.stage, night && styles.stageNight)}
          aria-label="Your terrarium"
        >
          <div {...stylex.props(styles.stageTop)}>
            <span {...stylex.props(styles.livePill, night && styles.livePillNight)}>
              <span {...stylex.props(styles.liveDot)} />
              {night ? "RESTING PEACEFULLY" : "HAPPILY GROWING"}
            </span>
            <div {...stylex.props(styles.modeControl)}>
              <span {...stylex.props(styles.modeLabel, night && styles.dimNight)}>
                {night ? "Nightfall" : "Daylight"}
              </span>
              <IconButton
                label={night ? "Switch to daytime" : "Switch to nighttime"}
                icon={<Icon name={night ? "moon" : "sun"} size={18} />}
                onClick={() => care.send({ type: "TOGGLE_NIGHT" })}
                aria-pressed={night}
              />
            </div>
          </div>
          <TerrariumScene sunlight={sunlight} night={night} waters={garden.waters} />
          <div {...stylex.props(styles.caption)}>
            <span {...stylex.props(text.eyebrow, styles.captionEyebrow, night && styles.dimNight)}>
              A WORLD OF YOUR OWN
            </span>
            <h2 {...stylex.props(text.serif, styles.captionTitle)}>The little grove</h2>
            <p
              {...stylex.props(text.pretty, styles.captionText, night && styles.dimNight)}
              aria-live="polite"
            >
              {message}
            </p>
          </div>
          <div {...stylex.props(styles.stageFooter, night && styles.stageFooterNight)}>
            <span {...stylex.props(styles.footerItem)}>
              <Icon name="leaf" size={15} /> A miniature woodland
            </span>
            <span
              {...stylex.props(text.tabular, styles.watersBadge, night && styles.watersBadgeNight)}
            >
              <Icon name="drop" size={13} />
              Watered {garden.waters} {garden.waters === 1 ? "time" : "times"}
            </span>
            <span {...stylex.props(styles.footerItem, styles.footerAside)}>
              Made for quiet moments{" "}
              <span {...stylex.props(styles.footerArrow)} aria-hidden="true">
                ↗
              </span>
            </span>
          </div>
        </section>

        <Card xstyle={styles.panel} role="complementary" aria-label="Garden care">
          <span {...stylex.props(text.eyebrow, styles.panelEyebrow)}>A LITTLE TLC</span>
          <h2 {...stylex.props(text.serif, styles.panelTitle)}>How’s it growing?</h2>
          <p {...stylex.props(styles.panelText)}>Your tiny ecosystem is in good hands.</p>

          <div {...stylex.props(styles.statWell)}>
            <div {...stylex.props(styles.statHeading)}>
              <span {...stylex.props(styles.statLabel)}>
                <span {...stylex.props(styles.statIcon, styles.waterIcon)}>
                  <Icon name="drop" size={17} />
                </span>
                Soil moisture
              </span>
              <strong {...stylex.props(text.tabular, styles.statValue)}>{garden.moisture}%</strong>
            </div>
            <progress
              {...stylex.props(styles.meter)}
              value={garden.moisture}
              max={100}
              aria-label="Soil moisture"
            />
            <p {...stylex.props(styles.statNote)}>{moistureNote(garden.moisture)}</p>
          </div>

          <div {...stylex.props(styles.statWell)}>
            <div {...stylex.props(styles.statHeading)}>
              <span {...stylex.props(styles.statLabel)}>
                <span {...stylex.props(styles.statIcon, styles.sunIcon)}>
                  <Icon name="sun" size={17} />
                </span>
                Sunlight
              </span>
              <strong {...stylex.props(text.tabular, styles.statValue)}>
                {night ? "Resting" : `${sunlight}%`}
              </strong>
            </div>
            <Slider
              label="Sunlight"
              isLabelHidden
              min={10}
              max={100}
              value={sunlight}
              isDisabled={night}
              onChange={(value: number) => care.send({ type: "SET_SUNLIGHT", sunlight: value })}
              formatValue={(value) => `${value} percent`}
              valueDisplay="none"
            />
            <p {...stylex.props(styles.statNote)}>{sunlightNote(sunlight, night)}</p>
          </div>

          <Button
            label={pouring ? "Watering…" : saturated ? "All watered for now" : "Water your garden"}
            variant="primary"
            size="lg"
            width="100%"
            icon={<Icon name="drop" size={18} />}
            onClick={() => care.send({ type: "WATER" })}
            isDisabled={saturated || pouring}
            isLoading={pouring}
          />
          <p {...stylex.props(styles.saveStatus)} role="status">
            {formatSyncStatus(settings, watering)}
          </p>

          <div {...stylex.props(styles.note)}>
            <span {...stylex.props(styles.noteIcon)}>
              <Icon name="spark" size={20} />
            </span>
            <div>
              <strong {...stylex.props(styles.noteTitle)}>No rush. Just grow.</strong>
              <p {...stylex.props(text.pretty, styles.noteText)}>
                A little attention goes a long way. Your garden is a place to enjoy the small
                things.
              </p>
            </div>
          </div>

          <div {...stylex.props(styles.journalSection)}>
            <h3 {...stylex.props(styles.journalTitle)}>
              <span>Little moments</span>
              <a href="/journal" {...stylex.props(styles.journalLink)}>
                View journal →
              </a>
            </h3>
            <ul {...stylex.props(styles.journalList)}>
              {garden.journal.slice(0, 3).map((entry) => (
                <li key={entry.id} {...stylex.props(styles.journalItem)}>
                  <span {...stylex.props(styles.journalDot)} />
                  <span {...stylex.props(text.pretty)}>{entry.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>
    </AppTheme>
  )
}

const styles = stylex.create({
  layout: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr) 360px",
      [media.tablet]: "minmax(0, 1fr) 310px",
      [media.mobile]: "1fr",
    },
    gap: { default: 28, [media.tablet]: 18 },
    alignItems: "stretch",
  },
  stage: {
    position: "relative",
    overflow: "hidden",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    borderRadius: 24,
    backgroundImage:
      "radial-gradient(ellipse at 50% 37%, light-dark(#f9fbed, #414e36) 0%, light-dark(#eef2e2, #303b2b) 55%, light-dark(#e9efdf, #283324) 100%)",
    minHeight: { default: 650, [media.tablet]: 620, [media.mobile]: 600, [media.tiny]: 550 },
    display: "flex",
    flexDirection: "column",
    boxShadow: colors.shadowSm,
    transitionProperty: "background-image, color, border-color",
    transitionDuration: "0.7s",
  },
  stageNight: {
    backgroundImage:
      "radial-gradient(ellipse at 50% 40%, light-dark(#536477, #283c4d), light-dark(#344757, #192a37))",
    color: "light-dark(#eef1d9, #eef1d9)",
  },
  dimNight: { color: "light-dark(#bdcabb, #c3d2c6)" },
  stageTop: {
    position: "relative",
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBlock: 20,
    paddingInline: 24,
  },
  livePill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.4,
    color: colors.mossDark,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    borderRadius: 999,
    paddingBlock: 6,
    paddingInline: 12,
    boxShadow: colors.shadowSm,
  },
  livePillNight: {
    backgroundColor: "light-dark(#ffffff14, #ffffff12)",
    borderColor: "light-dark(#ffffff24, #ffffff20)",
    color: "light-dark(#e2ebd8, #d8e6cc)",
  },
  liveDot: {
    width: 6,
    height: 6,
    backgroundColor: "light-dark(#7d9a5f, #adc68d)",
    borderRadius: "50%",
    boxShadow: "0 0 0 4px light-dark(#7d9a5f22, #adc68d28)",
  },
  modeControl: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  modeLabel: {
    fontSize: 11,
    fontWeight: 500,
    color: colors.muted,
    display: { default: "inline", [media.tiny]: "none" },
  },
  caption: {
    textAlign: "center",
    zIndex: 2,
    marginTop: { default: 22, [media.tablet]: 30, [media.mobile]: 20 },
    paddingTop: 0,
    paddingInline: 20,
    paddingBottom: 24,
  },
  captionEyebrow: { fontSize: 9, display: "block", marginBottom: 0 },
  captionTitle: {
    fontSize: 30,
    letterSpacing: -0.8,
    marginTop: 5,
    marginInline: 0,
    marginBottom: 6,
  },
  captionText: {
    fontSize: 13,
    color: "light-dark(#6e7861, #c2ccb5)",
    marginBlock: 0,
    marginInline: "auto",
    maxWidth: 420,
    minHeight: 20,
  },
  stageFooter: {
    marginTop: "auto",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "light-dark(#dce3cf, #4c5942)",
    paddingBlock: { default: 14, [media.tablet]: 14 },
    paddingInline: { default: 24, [media.tablet]: 16 },
    fontSize: 11,
    color: "light-dark(#6e7960, #bdcbb0)",
  },
  stageFooterNight: {
    borderTopColor: "light-dark(#ffffff18, #ffffff18)",
    color: "light-dark(#bdcabb, #c3d2c6)",
  },
  footerItem: { display: "inline-flex", alignItems: "center", gap: 7 },
  watersBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    fontWeight: 600,
    color: colors.water,
    backgroundColor: colors.waterBg,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    borderRadius: 999,
    paddingBlock: 3,
    paddingInline: 10,
  },
  watersBadgeNight: {
    backgroundColor: "light-dark(#ffffff14, #ffffff12)",
    borderColor: "light-dark(#ffffff24, #ffffff20)",
    color: "light-dark(#d8ecec, #bfe3e5)",
  },
  footerAside: {
    fontSize: 11,
    display: {
      default: "inline-flex",
      [media.tablet]: "none",
      [media.mobile]: "inline-flex",
      [media.tiny]: "none",
    },
  },
  footerArrow: { fontSize: 14, marginLeft: 4 },
  panel: {
    borderRadius: 24,
    paddingBlock: { default: 28, [media.tablet]: 24, [media.mobile]: 24 },
    paddingInline: { default: 26, [media.tablet]: 20, [media.mobile]: 22 },
  },
  panelEyebrow: { display: "block", marginBottom: 6 },
  panelTitle: {
    fontSize: 27,
    letterSpacing: -0.7,
    marginTop: 0,
    marginInline: 0,
    marginBottom: 6,
  },
  panelText: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 0,
    marginInline: 0,
    marginBottom: { default: 20, [media.mobile]: 18 },
  },
  statWell: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    borderRadius: 16,
    paddingBlock: 14,
    paddingInline: 16,
    marginBottom: 14,
  },
  statHeading: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 13,
    fontWeight: 600,
    color: colors.ink,
    marginBottom: 10,
  },
  statLabel: { display: "flex", alignItems: "center", gap: 9 },
  statValue: {
    fontFamily: fonts.serif,
    fontSize: 15,
    fontWeight: 600,
    color: colors.ink,
  },
  statIcon: {
    width: 30,
    height: 30,
    display: "grid",
    placeItems: "center",
    borderRadius: 9,
  },
  waterIcon: {
    backgroundColor: colors.waterBg,
    color: colors.water,
  },
  sunIcon: {
    backgroundColor: colors.sunBg,
    color: colors.sun,
  },
  statNote: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 8,
    marginBottom: 0,
  },
  meter: {
    appearance: "none",
    display: "block",
    width: "100%",
    height: 7,
    borderWidth: 0,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "light-dark(#e2e5d8, #384130)",
    "::-webkit-progress-bar": { backgroundColor: "light-dark(#e2e5d8, #384130)" },
    "::-webkit-progress-value": {
      backgroundColor: colors.water,
      borderRadius: 999,
      transitionProperty: "width",
      transitionDuration: "0.5s",
    },
    "::-moz-progress-bar": { backgroundColor: colors.water },
  },
  saveStatus: {
    minHeight: 16,
    fontSize: 11,
    color: colors.faint,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 0,
  },
  note: {
    display: "flex",
    gap: 12,
    backgroundColor: colors.surfaceTint,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    borderRadius: 16,
    paddingBlock: 14,
    paddingInline: 15,
    marginBlock: 14,
    color: colors.mossDark,
  },
  noteIcon: { flexShrink: 0, marginTop: 2 },
  noteTitle: {
    color: colors.ink,
    fontFamily: fonts.serif,
    fontWeight: 500,
    fontSize: 15,
  },
  noteText: {
    fontSize: 11,
    lineHeight: 1.65,
    color: colors.muted,
    marginTop: 4,
    marginBottom: 0,
  },
  journalSection: {
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.borderSubtle,
  },
  journalTitle: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 12,
    fontWeight: 600,
    color: colors.ink,
    marginTop: 0,
    marginInline: 0,
    marginBottom: 12,
  },
  journalLink: {
    fontSize: 11,
    fontWeight: 500,
    color: { default: colors.mossDark, ":hover": colors.ink },
    backgroundColor: { default: colors.surfaceSubtle, ":hover": colors.surfaceTint },
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    borderRadius: 999,
    paddingBlock: 3,
    paddingInline: 10,
    textDecoration: "none",
    transitionProperty: "background-color, color",
    transitionDuration: "150ms",
  },
  journalList: {
    listStyle: "none",
    paddingBlock: 0,
    paddingInline: 0,
    marginBlock: 0,
    marginInline: 0,
  },
  journalItem: {
    display: "flex",
    alignItems: "baseline",
    gap: 9,
    color: colors.muted,
    fontSize: 11,
    marginBlock: 8,
    lineHeight: 1.55,
  },
  journalDot: {
    width: 5,
    height: 5,
    borderRadius: "50%",
    backgroundColor: colors.moss,
    flexShrink: 0,
  },
})
