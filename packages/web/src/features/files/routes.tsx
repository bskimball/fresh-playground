import { Files } from "@playground/server"
import * as stylex from "@stylexjs/stylex"
import { Effect, Option } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"
import { hrefFor, loginHref } from "../../components/sections.ts"
import { Island } from "../../server/Document.tsx"
import { Page } from "../../server/Page.ts"
import { text } from "../../styles/text.ts"
import { colors, media } from "../../styles/tokens.stylex.ts"
import { filesIsland } from "./FilesIsland.tsx"

/** The signed-in user's uploads. The API and download route check the session again. */
export const FilesPages = HttpRouter.use(
  Effect.fn(function* (router) {
    const page = yield* Page
    const files = yield* Files

    yield* router.add("GET", hrefFor("files"), (request) =>
      Effect.gen(function* () {
        const viewer = yield* page.viewer(request)
        if (Option.isNone(viewer)) return HttpServerResponse.redirect(loginHref(hrefFor("files")))
        const owned = yield* files.list(viewer.value.user.id)
        return yield* page.render(request, {
          title: "Files",
          description: "Your uploaded files.",
          current: "files",
          viewer,
          children: (
            <div {...stylex.props(styles.layout)}>
              <header {...stylex.props(styles.banner)}>
                <h1 {...stylex.props(text.serif, styles.title)}>Files</h1>
                <p {...stylex.props(styles.description, text.pretty)}>
                  Files you upload are private to your account.
                </p>
              </header>
              <Island island={filesIsland} props={{ files: owned }} />
            </div>
          ),
        })
      }),
    )
  }),
)

const styles = stylex.create({
  layout: { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 20, marginBottom: 48 },
  banner: {
    display: "grid",
    gap: 6,
    paddingBlock: 20,
    paddingInline: 24,
    borderRadius: 18,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
  },
  title: {
    fontSize: { default: 36, [media.mobile]: 30 },
    letterSpacing: -1,
    lineHeight: 1.1,
    margin: 0,
  },
  description: { margin: 0, fontSize: 14, lineHeight: 1.6, color: colors.muted },
})
