import { Kanban } from "@playground/server"
import { Effect } from "effect"
import { HttpRouter } from "effect/http"
import { Island } from "../../server/Document.tsx"
import { Page } from "../../server/Page.ts"
import { kanbanIsland } from "./KanbanIsland.tsx"

export const KanbanPages = HttpRouter.use(
  Effect.fn(function* (router) {
    const page = yield* Page
    const kanban = yield* Kanban

    yield* router.add("GET", "/kanban", (request) =>
      Effect.gen(function* () {
        const board = yield* kanban.get
        return yield* page.render(request, {
          title: "Kanban",
          current: "kanban",
          children: <Island island={kanbanIsland} props={board} />,
        })
      }),
    )
  }),
)
