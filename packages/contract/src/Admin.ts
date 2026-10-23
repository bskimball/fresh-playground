import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiError, HttpApiGroup } from "effect/http-api"
import { Authentication } from "./Auth.ts"
import { Garden } from "./Garden.ts"

export const AdminUser = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  emailVerified: Schema.Boolean,
  image: Schema.NullOr(Schema.String),
  role: Schema.String,
  banned: Schema.Boolean,
  banReason: Schema.NullOr(Schema.String),
  createdAt: Schema.Date,
})
export type AdminUser = typeof AdminUser.Type

export const UserPage = Schema.Struct({
  users: Schema.Array(AdminUser),
  total: Schema.Int,
})
export type UserPage = typeof UserPage.Type

const userId = { id: Schema.String }
const errors = [HttpApiError.Forbidden, HttpApiError.BadRequest]

/** Admin endpoints. Each handler also checks the caller's permissions. */
export class AdminApi extends HttpApiGroup.make("admin")
  .add(
    HttpApiEndpoint.get("listUsers", "/users", {
      query: {
        search: Schema.optional(Schema.String),
        offset: Schema.optional(Schema.NumberFromString),
        limit: Schema.optional(Schema.NumberFromString),
      },
      success: UserPage,
      error: errors,
    }),
    HttpApiEndpoint.put("setRole", "/users/:id/role", {
      params: userId,
      payload: Schema.Struct({ role: Schema.String }),
      success: AdminUser,
      error: errors,
    }),
    HttpApiEndpoint.post("banUser", "/users/:id/ban", {
      params: userId,
      payload: Schema.Struct({ reason: Schema.optional(Schema.String) }),
      success: AdminUser,
      error: errors,
    }),
    HttpApiEndpoint.post("unbanUser", "/users/:id/unban", {
      params: userId,
      success: AdminUser,
      error: errors,
    }),
    HttpApiEndpoint.post("revokeSessions", "/users/:id/revoke-sessions", {
      params: userId,
      error: errors,
    }),
    HttpApiEndpoint.delete("removeUser", "/users/:id", {
      params: userId,
      error: errors,
    }),
    HttpApiEndpoint.post("resetGarden", "/garden/reset", {
      success: Garden,
      error: errors,
    }),
  )
  .middleware(Authentication)
  .prefix("/api/admin") {}
