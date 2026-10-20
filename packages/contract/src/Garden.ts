import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"

export const Moisture = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 }))
export const Sunlight = Schema.Int.check(Schema.isBetween({ minimum: 10, maximum: 100 }))

/** Watering is refused at or above this moisture level. */
export const SATURATED_AT = 90

export const JournalEntry = Schema.Struct({
  id: Schema.Int,
  text: Schema.String,
  at: Schema.Date,
})
export type JournalEntry = typeof JournalEntry.Type

export const GardenSettings = Schema.Struct({
  sunlight: Sunlight,
  night: Schema.Boolean,
})
export type GardenSettings = typeof GardenSettings.Type

export const Garden = Schema.Struct({
  moisture: Moisture,
  sunlight: Sunlight,
  night: Schema.Boolean,
  waters: Schema.Int,
  journal: Schema.Array(JournalEntry),
})
export type Garden = typeof Garden.Type

export class GardenSaturated extends Schema.TaggedError<GardenSaturated>()(
  "GardenSaturated",
  { moisture: Moisture },
  { httpApiStatus: 409 },
) {}

export class GardenApi extends HttpApiGroup.make("garden")
  .add(
    HttpApiEndpoint.get("get", "/", { success: Garden }),
    HttpApiEndpoint.post("water", "/water", {
      success: Garden,
      error: GardenSaturated,
    }),
    HttpApiEndpoint.put("settings", "/settings", {
      payload: GardenSettings,
      success: Garden,
    }),
  )
  .prefix("/api/garden") {}
