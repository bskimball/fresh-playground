import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { AdminApi } from "./Admin.ts"
import { EventsApi } from "./Events.ts"
import { GardenApi } from "./Garden.ts"
import { KanbanApi } from "./Kanban.ts"

export const Hello = Schema.Struct({
  message: Schema.String,
  time: Schema.Date,
})

export class SystemApi extends HttpApiGroup.make("system", { topLevel: true }).add(
  HttpApiEndpoint.get("hello", "/api/hello", { success: Hello }),
) {}

export class AppApi extends HttpApi.make("app")
  .add(GardenApi)
  .add(KanbanApi)
  .add(AdminApi)
  .add(SystemApi)
  .add(EventsApi) {}
