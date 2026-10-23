import { Card } from "@astryxdesign/core/Card"
import type { JournalEntry } from "@playground/contract"
import * as stylex from "@stylexjs/stylex"
import { Icon, type IconName } from "./Icon.tsx"
import { text } from "../styles/text.ts"
import { colors, media } from "../styles/tokens.stylex.ts"

const timeFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" })

const resolveEntryTone = (
  entryText: string,
): { readonly icon: IconName; readonly kind: "water" | "sun" | "night" | "leaf" } => {
  const lower = entryText.toLowerCase()
  if (lower.includes("water") || lower.includes("drink") || lower.includes("mist")) {
    return { icon: "drop", kind: "water" }
  }
  if (lower.includes("night") || lower.includes("moon") || lower.includes("rest")) {
    return { icon: "moon", kind: "night" }
  }
  if (lower.includes("sun") || lower.includes("day") || lower.includes("morning")) {
    return { icon: "sun", kind: "sun" }
  }
  return { icon: "leaf", kind: "leaf" }
}

/** Journal content stays server-rendered; only the shared header toggle hydrates. */
export function JournalTimeline({ entries }: { entries: ReadonlyArray<JournalEntry> }) {
  return (
    <div {...stylex.props(styles.wrapper)}>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headerCopy)}>
          <span {...stylex.props(styles.eyebrowPill)}>
            <Icon name="book" size={12} />
            <span>THE GARDEN REMEMBERS</span>
          </span>
          <h1 {...stylex.props(text.serif, styles.title)}>Little moments</h1>
          <p {...stylex.props(styles.intro, text.pretty)}>
            Every drink and every goodnight, newest first. Your garden’s little moments, gathered
            here as a living field log.
          </p>
        </div>
        <div {...stylex.props(styles.headerActions)}>
          <span {...stylex.props(styles.countBadge, text.tabular)}>
            {entries.length} {entries.length === 1 ? "entry" : "entries"} recorded
          </span>
          <a href="/" {...stylex.props(styles.backLink)}>
            ← Back to garden
          </a>
        </div>
      </header>

      <Card xstyle={styles.logCard}>
        {entries.length === 0 ? (
          <p {...stylex.props(styles.empty, text.pretty)}>
            No moments recorded yet. Water the terrarium or shift the cycle to begin the log.
          </p>
        ) : (
          <ol {...stylex.props(styles.timeline)}>
            {entries.map((entry, index) => {
              const tone = resolveEntryTone(entry.text)
              const isLast = index === entries.length - 1
              return (
                <li key={entry.id} {...stylex.props(styles.item, isLast && styles.itemLast)}>
                  <span
                    {...stylex.props(
                      styles.marker,
                      tone.kind === "water" && styles.markerWater,
                      tone.kind === "sun" && styles.markerSun,
                      tone.kind === "night" && styles.markerNight,
                    )}
                    aria-hidden="true"
                  >
                    <Icon name={tone.icon} size={14} />
                  </span>
                  <div {...stylex.props(styles.itemBody)}>
                    <span {...stylex.props(styles.entryText, text.pretty)}>{entry.text}</span>
                    <time
                      dateTime={entry.at.toISOString()}
                      {...stylex.props(styles.timeBadge, text.tabular)}
                    >
                      {timeFormat.format(entry.at)}
                    </time>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </Card>
    </div>
  )
}

const styles = stylex.create({
  wrapper: {
    display: "grid",
    gap: 24,
    maxWidth: 840,
    marginInline: "auto",
  },
  header: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 20,
  },
  headerCopy: {
    display: "grid",
    gap: 10,
    justifyItems: "start",
    maxWidth: 520,
  },
  eyebrowPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    paddingBlock: 5,
    paddingInline: 11,
    borderRadius: 999,
    backgroundColor: colors.surfaceTint,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.8,
    color: colors.mossDark,
  },
  title: {
    fontSize: { default: 48, [media.mobile]: 38 },
    letterSpacing: -1.5,
    lineHeight: 1.08,
    margin: 0,
  },
  intro: {
    fontSize: 14,
    lineHeight: 1.75,
    color: colors.muted,
    margin: 0,
  },
  headerActions: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  countBadge: {
    display: "inline-flex",
    alignItems: "center",
    paddingBlock: 6,
    paddingInline: 12,
    borderRadius: 999,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    fontSize: 12,
    fontWeight: 600,
    color: colors.ink,
  },
  backLink: {
    display: "inline-flex",
    alignItems: "center",
    paddingBlock: 6,
    paddingInline: 13,
    borderRadius: 999,
    backgroundColor: {
      default: colors.surfaceElevated,
      ":hover": colors.surfaceTint,
    },
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: {
      default: colors.borderSubtle,
      ":hover": colors.borderStrong,
    },
    boxShadow: colors.shadowSm,
    fontSize: 12,
    fontWeight: 500,
    color: colors.ink,
    textDecoration: "none",
    transform: {
      default: "none",
      ":active": "scale(0.96)",
    },
    transition:
      "background-color 0.15s ease-out, border-color 0.15s ease-out, transform 0.1s ease-out",
  },
  logCard: {
    paddingBlock: { default: 34, [media.mobile]: 24 },
    paddingInline: { default: 38, [media.mobile]: 20 },
    borderRadius: 24,
  },
  empty: {
    margin: 0,
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    paddingBlock: 28,
  },
  timeline: {
    listStyle: "none",
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 16,
    paddingRight: 0,
    margin: 0,
    borderLeftWidth: 1,
    borderLeftStyle: "solid",
    borderLeftColor: colors.borderStrong,
    marginLeft: 14,
  },
  item: {
    position: "relative",
    paddingLeft: 22,
    paddingBottom: 20,
  },
  itemLast: {
    paddingBottom: 0,
  },
  marker: {
    position: "absolute",
    left: -31,
    top: 2,
    width: 28,
    height: 28,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    backgroundColor: colors.surfaceTint,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderStrong,
    color: colors.mossDark,
    boxShadow: colors.shadowSm,
  },
  markerWater: {
    backgroundColor: colors.waterBg,
    borderColor: colors.water,
    color: colors.water,
  },
  markerSun: {
    backgroundColor: colors.sunBg,
    borderColor: colors.sun,
    color: colors.sun,
  },
  markerNight: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.borderStrong,
    color: colors.sage,
  },
  itemBody: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingBlock: 12,
    paddingInline: 16,
    borderRadius: 14,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
  },
  entryText: {
    fontSize: 15,
    lineHeight: 1.5,
    color: colors.ink,
  },
  timeBadge: {
    fontSize: 11,
    fontWeight: 500,
    color: colors.muted,
    whiteSpace: "nowrap",
    paddingBlock: 4,
    paddingInline: 10,
    borderRadius: 999,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
  },
})
