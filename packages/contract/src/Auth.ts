import { Context, Schema } from "effect"
import { HttpApiError, HttpApiMiddleware } from "effect/http-api"

export const SessionUser = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  image: Schema.NullOr(Schema.String),
  role: Schema.String,
})
export type SessionUser = typeof SessionUser.Type

/** The signed-in user, provided to handlers behind `Authentication`. */
export class CurrentUser extends Context.Service<CurrentUser, SessionUser>()("auth/CurrentUser") {}

/** Rejects requests without a valid session cookie, and cross-origin writes. */
export class Authentication extends HttpApiMiddleware.Service<
  Authentication,
  { provides: CurrentUser }
>()("auth/Authentication", { error: [HttpApiError.Unauthorized, HttpApiError.Forbidden] }) {}

/** Sign-in methods the server has credentials for; the login page renders only these. */
export const SignInMethods = Schema.Struct({
  password: Schema.Boolean,
  magicLink: Schema.Boolean,
  social: Schema.Array(Schema.Literals(["google", "microsoft"])),
})
export type SignInMethods = typeof SignInMethods.Type
