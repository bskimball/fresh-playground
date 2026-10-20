import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { GardenApi } from "./Garden.ts"

export const Hello = Schema.Struct({
  message: Schema.String,
  time: Schema.Date,
})

export class SystemApi extends HttpApiGroup.make("system", { topLevel: true }).add(
  HttpApiEndpoint.get("hello", "/api/hello", { success: Hello }),
) {}

export class AppApi extends HttpApi.make("app").add(GardenApi).add(SystemApi) {}
