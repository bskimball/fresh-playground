import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"

export const EVENTS_PATH = "/api/events"
export const EventTopic = Schema.Literals(["garden", "kanban"])
export type EventTopic = typeof EventTopic.Type
export const InvalidationPayload = Schema.Struct({ topic: EventTopic })
export const ResyncPayload = Schema.Struct({ topics: Schema.Array(EventTopic) })
export const PublicEvent = Schema.Union([
  Schema.Struct({
    id: Schema.String,
    event: Schema.Literal("invalidate"),
    data: Schema.fromJsonString(InvalidationPayload),
  }),
  Schema.Struct({
    id: Schema.String,
    event: Schema.Literal("resync"),
    data: Schema.fromJsonString(ResyncPayload),
  }),
  Schema.Struct({
    event: Schema.Literal("heartbeat"),
    data: Schema.fromJsonString(Schema.Struct({})),
  }),
])
export type PublicEvent = typeof PublicEvent.Type
export class EventsApi extends HttpApiGroup.make("events", { topLevel: true }).add(
  HttpApiEndpoint.get("events", EVENTS_PATH, {
    success: HttpApiSchema.WithHeaders(HttpApiSchema.StreamSse({ events: PublicEvent }), {
      "cache-control": Schema.String,
      "content-encoding": Schema.String,
      "x-accel-buffering": Schema.String,
    }),
  }),
) {}
