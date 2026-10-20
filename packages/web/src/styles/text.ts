import * as stylex from "@stylexjs/stylex"
import { colors, fonts } from "./tokens.stylex.ts"

export const text = stylex.create({
  eyebrow: {
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: 700,
    color: colors.sage,
    marginTop: 0,
    marginInline: 0,
    marginBottom: 15,
  },
  serif: {
    fontFamily: fonts.serif,
    fontWeight: 400,
  },
})
