import { Button } from "@astryxdesign/core/Button"
import { Card } from "@astryxdesign/core/Card"
import { IconButton } from "@astryxdesign/core/IconButton"
import { Slider } from "@astryxdesign/core/Slider"
import { type Garden, SATURATED_AT } from "@playground/contract"
import * as stylex from "@stylexjs/stylex"
import { useActorRef, useSelector } from "@xstate/react"
import { useEffect } from "react"
import { AppTheme } from "../../components/AppTheme.tsx"
import { Icon } from "../../components/Icon.tsx"
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
            <span {...stylex.props(styles.livePill, night && styles.dimNight)}>
              <span {...stylex.props(styles.liveDot)} />
              {night ? "RESTING PEACEFULLY" : "HAPPILY GROWING"}
            </span>
            <IconButton
              label={night ? "Switch to daytime" : "Switch to nighttime"}
              icon={<Icon name={night ? "moon" : "sun"} />}
              onClick={() => care.send({ type: "TOGGLE_NIGHT" })}
              aria-pressed={night}
            />
          </div>
          <TerrariumScene sunlight={sunlight} night={night} waters={garden.waters} />
          <div {...stylex.props(styles.caption)}>
            <span {...stylex.props(text.eyebrow, styles.captionEyebrow, night && styles.dimNight)}>
              A WORLD OF YOUR OWN
            </span>
            <h2 {...stylex.props(text.serif, styles.captionTitle)}>The little grove</h2>
            <p {...stylex.props(styles.captionText, night && styles.dimNight)} aria-live="polite">
              {message}
            </p>
          </div>
          <div {...stylex.props(styles.stageFooter, night && styles.stageFooterNight)}>
            <span {...stylex.props(styles.footerItem)}>
              <Icon name="leaf" size={16} /> A miniature woodland
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

          <div {...stylex.props(styles.stat)}>
            <div {...stylex.props(styles.statHeading)}>
              <span {...stylex.props(styles.statLabel)}>
                <span {...stylex.props(styles.statIcon, styles.waterIcon)}>
                  <Icon name="drop" size={18} />
                </span>
                Soil moisture
              </span>
              <strong {...stylex.props(styles.statValue)}>{garden.moisture}%</strong>
            </div>
            <progress
              {...stylex.props(styles.meter)}
              value={garden.moisture}
              max={100}
              aria-label="Soil moisture"
            />
            <p {...stylex.props(styles.statNote)}>{moistureNote(garden.moisture)}</p>
          </div>

          <div {...stylex.props(styles.stat)}>
            <div {...stylex.props(styles.statHeading)}>
              <span {...stylex.props(styles.statLabel)}>
                <span {...stylex.props(styles.statIcon, styles.sunIcon)}>
                  <Icon name="sun" size={18} />
                </span>
                Sunlight
              </span>
              <strong {...stylex.props(styles.statValue)}>
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
              <Icon name="spark" size={24} />
            </span>
            <div>
              <strong {...stylex.props(styles.noteTitle)}>No rush. Just grow.</strong>
              <p {...stylex.props(styles.noteText)}>
                A little attention goes a long way. Your garden is a place to enjoy the small
                things.
              </p>
            </div>
          </div>

          <div>
            <h3 {...stylex.props(styles.journalTitle)}>
              Little moments
              <a href="/journal" {...stylex.props(styles.journalLink)}>
                SEE ALL
              </a>
            </h3>
            <ul {...stylex.props(styles.journalList)}>
              {garden.journal.slice(0, 3).map((entry) => (
                <li key={entry.id} {...stylex.props(styles.journalItem)}>
                  <span {...stylex.props(styles.journalDot)} />
                  {entry.text}
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
      default: "minmax(0, 1fr) 330px",
      [media.tablet]: "minmax(0, 1fr) 295px",
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
    borderColor: "light-dark(#e0e5d5, #4c5942)",
    borderRadius: 24,
    backgroundImage:
      "radial-gradient(ellipse at 50% 37%, light-dark(#f9fbed, #414e36) 0%, light-dark(#eef2e2, #303b2b) 55%, light-dark(#e9efdf, #283324) 100%)",
    minHeight: { default: 650, [media.tablet]: 620, [media.mobile]: 600, [media.tiny]: 550 },
    display: "flex",
    flexDirection: "column",
    transition: "background 0.7s, color 0.7s",
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
    paddingBlock: 23,
    paddingInline: 26,
  },
  livePill: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 1.4,
    color: "light-dark(#758768, #c0d2a9)",
  },
  liveDot: {
    width: 6,
    height: 6,
    backgroundColor: "light-dark(#91aa75, #adc68d)",
    borderRadius: "50%",
    boxShadow: "0 0 0 4px light-dark(#91aa7517, #adc68d25)",
  },
  caption: {
    textAlign: "center",
    zIndex: 2,
    marginTop: { default: 25, [media.tablet]: 35, [media.mobile]: 22 },
    paddingTop: 0,
    paddingInline: 20,
    paddingBottom: 25,
  },
  captionEyebrow: { fontSize: 9, display: "block", marginBottom: 0 },
  captionTitle: {
    fontSize: 29,
    letterSpacing: -0.8,
    marginTop: 5,
    marginInline: 0,
    marginBottom: 6,
  },
  captionText: {
    fontSize: 12,
    color: "light-dark(#879177, #c2ccb5)",
    margin: 0,
    minHeight: 18,
  },
  stageFooter: {
    marginTop: "auto",
    display: "flex",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "light-dark(#dce3cf, #4c5942)",
    paddingBlock: { default: 16, [media.tablet]: 15 },
    paddingInline: { default: 25, [media.tablet]: 15 },
    fontSize: 10,
    color: "light-dark(#8b967d, #bdcbb0)",
  },
  stageFooterNight: {
    borderTopColor: "light-dark(#ffffff18, #ffffff18)",
    color: "light-dark(#bdcabb, #c3d2c6)",
  },
  footerItem: { display: "flex", alignItems: "center", gap: 7 },
  footerAside: {
    fontSize: 9,
    display: {
      default: "flex",
      [media.tablet]: "none",
      [media.mobile]: "flex",
      [media.tiny]: "none",
    },
  },
  footerArrow: { fontSize: 15, marginLeft: 6 },
  panel: {
    paddingBlock: { default: 30, [media.tablet]: 25, [media.mobile]: 27 },
    paddingInline: { default: 27, [media.tablet]: 21, [media.mobile]: 27 },
  },
  panelEyebrow: { display: "block", marginBottom: 8 },
  panelTitle: {
    fontSize: 27,
    letterSpacing: -0.7,
    marginTop: 0,
    marginInline: 0,
    marginBottom: 7,
  },
  panelText: {
    fontSize: 11,
    color: "light-dark(#92958a, #b9c1ae)",
    marginTop: 0,
    marginInline: 0,
    marginBottom: { default: 29, [media.mobile]: 23 },
  },
  stat: { marginBottom: 24 },
  statHeading: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: { default: 12, [media.mobile]: 14 },
    fontWeight: 500,
    marginBottom: 13,
  },
  statLabel: { display: "flex", alignItems: "center", gap: 9 },
  statValue: { fontSize: 11, fontWeight: 500, color: "light-dark(#8b927f, #c5ceb9)" },
  statIcon: {
    width: 31,
    height: 31,
    display: "grid",
    placeItems: "center",
    borderRadius: 10,
  },
  waterIcon: {
    backgroundColor: "light-dark(#e9f1ef, #304443)",
    color: "light-dark(#80a9aa, #a9d3cf)",
  },
  sunIcon: {
    backgroundColor: "light-dark(#faf0da, #493f2c)",
    color: "light-dark(#c5a55e, #dfc17d)",
  },
  statNote: {
    color: colors.faint,
    fontSize: { default: 10, [media.mobile]: 12 },
    marginTop: 8,
    marginBottom: 0,
  },
  meter: {
    appearance: "none",
    display: "block",
    width: "100%",
    height: 6,
    borderWidth: 0,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "light-dark(#eef0e8, #414b38)",
    "::-webkit-progress-bar": { backgroundColor: "light-dark(#eef0e8, #414b38)" },
    "::-webkit-progress-value": {
      backgroundColor: "light-dark(#9abbb4, #91bcb0)",
      borderRadius: 10,
      transition: "width 0.5s",
    },
    "::-moz-progress-bar": { backgroundColor: "light-dark(#9abbb4, #91bcb0)" },
  },
  saveStatus: {
    minHeight: 15,
    fontSize: 10,
    color: colors.faint,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 0,
  },
  note: {
    display: "flex",
    gap: 12,
    backgroundColor: "light-dark(#f4f2e8, #34382a)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "light-dark(#eeebdc, #454e3d)",
    borderRadius: 13,
    paddingBlock: 17,
    paddingInline: 15,
    marginBlock: 16,
    color: "light-dark(#a9a47d, #d3c591)",
  },
  noteIcon: { flexShrink: 0, marginTop: 2 },
  noteTitle: {
    color: "light-dark(#7e846a, #d2d9b6)",
    fontFamily: fonts.serif,
    fontWeight: 500,
    fontSize: 15,
  },
  noteText: {
    fontSize: { default: 10, [media.mobile]: 12 },
    lineHeight: 1.8,
    color: "light-dark(#959783, #c3c9ae)",
    marginTop: 6,
    marginBottom: 0,
  },
  journalTitle: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 11,
    fontWeight: 500,
    marginTop: 0,
    marginInline: 0,
    marginBottom: 14,
  },
  journalLink: {
    fontSize: 8,
    letterSpacing: 1,
    color: { default: "light-dark(#a4a896, #bbc6aa)", ":hover": colors.ink },
  },
  journalList: { listStyle: "none", padding: 0, margin: 0 },
  journalItem: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    color: "light-dark(#969d8b, #b9c1ae)",
    fontSize: { default: 10, [media.mobile]: 12 },
    marginBlock: 10,
    lineHeight: 1.6,
  },
  journalDot: {
    width: 4,
    height: 4,
    borderRadius: "50%",
    backgroundColor: "light-dark(#b0ba9c, #9ead88)",
    flexShrink: 0,
  },
})
