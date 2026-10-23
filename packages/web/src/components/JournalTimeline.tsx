import { Card } from "@astryxdesign/core/Card"
import type { JournalEntry } from "@playground/contract"
import * as stylex from "@stylexjs/stylex"
import { text } from "../styles/text.ts"
import { colors, media } from "../styles/tokens.stylex.ts"

const timeFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" })

/** Journal content stays server-rendered; only the shared header toggle hydrates. */
export function JournalTimeline({ entries }: { entries: ReadonlyArray<JournalEntry> }) {
  return (
    <Card xstyle={styles.page}>
      <p {...stylex.props(text.eyebrow)}>THE GARDEN REMEMBERS</p>
      <h1 {...stylex.props(text.serif, styles.title)}>Little moments</h1>
      <p {...stylex.props(styles.intro)}>
        Every drink and every goodnight, newest first. Your garden’s little moments, gathered here.
      </p>
      <ol {...stylex.props(styles.list)}>
        {entries.map((entry) => (
          <li key={entry.id} {...stylex.props(styles.item)}>
            <span {...stylex.props(styles.dot)} />
            <span>{entry.text}</span>
            <time dateTime={entry.at.toISOString()} {...stylex.props(styles.time)}>
              {timeFormat.format(entry.at)}
            </time>
          </li>
        ))}
      </ol>
    </Card>
  )
}

const styles = stylex.create({
  page: {
    paddingBlock: { default: 40, [media.mobile]: 27 },
    paddingInline: { default: 44, [media.mobile]: 24 },
    maxWidth: 760,
  },
  title: {
    fontSize: { default: 48, [media.mobile]: 38 },
    letterSpacing: -1.5,
    lineHeight: 1.1,
    marginTop: 0,
    marginInline: 0,
    marginBottom: 12,
  },
  intro: {
    fontSize: 13,
    lineHeight: 1.8,
    color: "light-dark(#7f8579, #b9c1ae)",
    marginTop: 0,
    marginBottom: 28,
  },
  list: { listStyle: "none", padding: 0, margin: 0 },
  item: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    alignItems: "baseline",
    gap: 12,
    paddingBlock: 12,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "light-dark(#eeebdc, #454e3d)",
    fontSize: 14,
    color: colors.ink,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    backgroundColor: "light-dark(#b0ba9c, #9ead88)",
    transform: "translateY(-2px)",
  },
  time: { fontSize: 11, color: colors.faint, whiteSpace: "nowrap" },
})
