import * as stylex from "@stylexjs/stylex"
import { text } from "../styles/text.ts"
import { colors, fonts, media } from "../styles/tokens.stylex.ts"
import { Icon } from "./Icon.tsx"

export function GardenHeading() {
  return (
    <div {...stylex.props(styles.heading)}>
      <div {...stylex.props(styles.copy)}>
        <span {...stylex.props(text.eyebrow, styles.eyebrowBadge)}>
          <Icon name="spark" size={12} />
          <span>YOUR DAILY DOSE OF GREEN</span>
        </span>
        <h1 {...stylex.props(text.serif, styles.title)}>
          A little garden.
          <br />A little <em {...stylex.props(styles.emphasis)}>pause.</em>
        </h1>
        <p {...stylex.props(text.pretty, styles.intro)}>
          Good things grow with a little care. Take a breath, check on your plants, and make
          yourself at home.
        </p>
      </div>
      <aside {...stylex.props(styles.almanacCard)} aria-label="Conservatory almanac note">
        <span {...stylex.props(styles.almanacMedallion)}>
          <Icon name="sun" size={22} />
        </span>
        <div {...stylex.props(styles.almanacText)}>
          <span {...stylex.props(styles.almanacKicker)}>Small beginnings</span>
          <strong {...stylex.props(styles.almanacStrong)}>Wonderful possibilities</strong>
        </div>
      </aside>
    </div>
  )
}

const styles = stylex.create({
  heading: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 24,
    marginBottom: { default: 32, [media.wide]: 40, [media.mobile]: 24 },
  },
  copy: {
    maxWidth: 560,
  },
  eyebrowBadge: {
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
    color: colors.mossDark,
    marginBottom: 16,
  },
  title: {
    fontSize: { default: "clamp(40px, 4.7vw, 62px)", [media.mobile]: 42 },
    lineHeight: 1.06,
    letterSpacing: -2.2,
    marginTop: 0,
    marginInline: 0,
    marginBottom: 16,
  },
  emphasis: {
    fontWeight: 400,
    color: colors.olive,
  },
  intro: {
    fontSize: { default: 15, [media.mobile]: 14 },
    lineHeight: 1.65,
    color: colors.muted,
    maxWidth: 500,
    marginBlock: 0,
    marginInline: 0,
  },
  almanacCard: {
    display: { default: "flex", [media.mobile]: "none" },
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    borderRadius: 18,
    paddingBlock: 14,
    paddingInline: 18,
    boxShadow: colors.shadowSm,
    flexShrink: 0,
  },
  almanacMedallion: {
    width: 42,
    height: 42,
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
    backgroundColor: colors.sunBg,
    color: colors.sun,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    flexShrink: 0,
  },
  almanacText: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  almanacKicker: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.4,
    color: colors.muted,
  },
  almanacStrong: {
    fontFamily: fonts.serif,
    fontSize: 17,
    fontWeight: 400,
    color: colors.mossDark,
  },
})
