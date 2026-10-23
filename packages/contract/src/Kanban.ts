import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"

export const kanbanStatuses = ["todo", "doing", "done"] as const
export const KanbanStatus = Schema.Literals(kanbanStatuses)
export type KanbanStatus = typeof KanbanStatus.Type

export const kanbanTags = ["care", "craft", "study", "harvest"] as const
export const KanbanTag = Schema.Literals(kanbanTags)
export type KanbanTag = typeof KanbanTag.Type

export const KANBAN_TITLE_MAX = 160
export const KANBAN_NOTE_MAX = 400
export const KANBAN_BOARD_MAX = 100

export const KanbanCard = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(KANBAN_TITLE_MAX)),
  note: Schema.String.check(Schema.isMaxLength(KANBAN_NOTE_MAX)),
  status: KanbanStatus,
  tag: KanbanTag,
})
export type KanbanCard = typeof KanbanCard.Type

export const KanbanBoard = Schema.Struct({
  cards: Schema.Array(KanbanCard).check(Schema.isMaxLength(KANBAN_BOARD_MAX)),
  updatedAt: Schema.Date,
})
export type KanbanBoard = typeof KanbanBoard.Type

export const KanbanUpdate = Schema.Struct({
  cards: Schema.Array(KanbanCard).check(Schema.isMaxLength(KANBAN_BOARD_MAX)),
})
export type KanbanUpdate = typeof KanbanUpdate.Type

export class KanbanApi extends HttpApiGroup.make("kanban")
  .add(
    HttpApiEndpoint.get("get", "/", { success: KanbanBoard }),
    HttpApiEndpoint.put("save", "/", {
      payload: KanbanUpdate,
      success: KanbanBoard,
    }),
  )
  .prefix("/api/kanban") {}
