import * as stylex from "@stylexjs/stylex"
import { text } from "../styles/text.ts"
import { fonts, media } from "../styles/tokens.stylex.ts"
import { Icon } from "./Icon.tsx"

export function GardenHeading() {
  return (
    <div {...stylex.props(styles.heading)}>
      <div>
        <p {...stylex.props(text.eyebrow)}>YOUR DAILY DOSE OF GREEN</p>
        <h1 {...stylex.props(text.serif, styles.title)}>
          A little garden.
          <br />A little <em {...stylex.props(styles.emphasis)}>pause.</em>
        </h1>
        <p {...stylex.props(styles.intro)}>
          Good things grow with a little care. Take a breath,
          <br /> check on your plants, and make yourself at home.
        </p>
      </div>
      <div {...stylex.props(styles.stamp)}>
        <Icon name="sun" size={30} />
        <span>Small beginnings</span>
        <strong {...stylex.props(styles.stampStrong)}>Wonderful possibilities</strong>
      </div>
    </div>
  )
}

const styles = stylex.create({
  heading: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: { default: 35, [media.wide]: 43, [media.mobile]: 26 },
  },
  title: {
    fontSize: { default: "clamp(40px, 4.7vw, 62px)", [media.mobile]: 46 },
    lineHeight: 1.08,
    letterSpacing: -2.5,
    marginTop: 0,
    marginInline: 0,
    marginBottom: 18,
  },
  emphasis: { fontWeight: 400, color: "#8b9a69" },
  intro: {
    fontSize: { default: 14, [media.mobile]: 12 },
    lineHeight: 1.8,
    color: "#7f8579",
    margin: 0,
  },
  stamp: {
    display: { default: "flex", [media.mobile]: "none" },
    flexDirection: "column",
    alignItems: "center",
    gap: 7,
    color: "#919771",
    fontSize: 12,
    paddingTop: 25,
    paddingLeft: 32,
    paddingRight: { default: 32, [media.tablet]: 12 },
    transform: "rotate(5deg)",
  },
  stampStrong: {
    fontFamily: fonts.serif,
    fontSize: 16,
    fontWeight: 400,
    color: "#6b795b",
  },
})
