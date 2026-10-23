import {
  type AdminUser,
  AppApi,
  Authentication,
  can,
  CurrentUser,
  type Permissions,
  roleNames,
} from "@playground/contract"
import { isAPIError } from "better-auth/api"
import { Effect, Layer, Option } from "effect"
import { HttpServerRequest } from "effect/http"
import { HttpApiBuilder, HttpApiError } from "effect/http-api"
import { Auth, webHeaders } from "./Auth.ts"
import { Garden } from "./Garden.ts"

export const AuthenticationLive = Layer.effect(
  Authentication,
  Effect.gen(function* () {
    const auth = yield* Auth
    return Authentication.of((httpEffect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        if (request.method !== "GET" && request.method !== "HEAD" && !auth.isSameOrigin(request)) {
          return yield* new HttpApiError.Forbidden()
        }
        const user = yield* auth.session(webHeaders(request))
        if (Option.isNone(user)) return yield* new HttpApiError.Unauthorized()
        return yield* Effect.provideService(httpEffect, CurrentUser, user.value)
      }),
    )
  }),
)

const requirePermission = (permissions: Permissions) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser
    if (!can(user.role, permissions)) return yield* new HttpApiError.Forbidden()
    return user
  })

/** Rejects actions an admin takes on their own account, so they cannot lock themselves out. */
const notSelf = (id: string) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser
    if (user.id === id) return yield* new HttpApiError.BadRequest()
  })

// Better Auth repeats the permission check itself, against the caller's session.
const call = <A>(promise: () => Promise<A>) =>
  Effect.tryPromise({ try: promise, catch: (error) => error }).pipe(
    Effect.catch(
      (error): Effect.Effect<never, HttpApiError.Forbidden | HttpApiError.BadRequest> => {
        if (!isAPIError(error) || error.statusCode >= 500) return Effect.die(error)
        return error.statusCode === 401 || error.statusCode === 403
          ? Effect.fail(new HttpApiError.Forbidden())
          : Effect.fail(new HttpApiError.BadRequest())
      },
    ),
  )

interface AuthUser {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly emailVerified: boolean
  readonly image?: string | null | undefined
  readonly role?: string | null | undefined
  readonly banned?: boolean | null | undefined
  readonly banReason?: string | null | undefined
  readonly createdAt: Date
}

const toAdminUser = (user: AuthUser): AdminUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  emailVerified: user.emailVerified,
  image: user.image ?? null,
  role: user.role ?? "user",
  banned: user.banned ?? false,
  banReason: user.banReason ?? null,
  createdAt: user.createdAt,
})

export const AdminHandlers = HttpApiBuilder.group(
  AppApi,
  "admin",
  Effect.fn(function* (handlers) {
    const auth = yield* Auth
    const garden = yield* Garden
    return handlers.handleAll({
      listUsers: ({ query, request }) =>
        requirePermission({ user: ["list"] }).pipe(
          Effect.andThen(
            call(() =>
              auth.api.listUsers({
                headers: webHeaders(request),
                query: {
                  limit: query.limit ?? 50,
                  offset: query.offset ?? 0,
                  sortBy: "createdAt",
                  sortDirection: "desc",
                  ...(query.search
                    ? {
                        searchValue: query.search,
                        searchField: "email",
                        searchOperator: "contains",
                      }
                    : {}),
                },
              }),
            ),
          ),
          Effect.map(({ users, total }) => ({ users: users.map(toAdminUser), total })),
        ),
      setRole: ({ params, payload, request }) =>
        Effect.gen(function* () {
          yield* requirePermission({ user: ["set-role"] })
          yield* notSelf(params.id)
          if (!roleNames.some((name) => name === payload.role)) {
            return yield* new HttpApiError.BadRequest()
          }
          const { user } = yield* call(() =>
            auth.api.setRole({
              headers: webHeaders(request),
              body: { userId: params.id, role: payload.role as (typeof roleNames)[number] },
            }),
          )
          return toAdminUser(user)
        }),
      banUser: ({ params, payload, request }) =>
        Effect.gen(function* () {
          yield* requirePermission({ user: ["ban"] })
          yield* notSelf(params.id)
          const { user } = yield* call(() =>
            auth.api.banUser({
              headers: webHeaders(request),
              body: { userId: params.id, ...(payload.reason ? { banReason: payload.reason } : {}) },
            }),
          )
          return toAdminUser(user)
        }),
      unbanUser: ({ params, request }) =>
        requirePermission({ user: ["ban"] }).pipe(
          Effect.andThen(
            call(() =>
              auth.api.unbanUser({ headers: webHeaders(request), body: { userId: params.id } }),
            ),
          ),
          Effect.map(({ user }) => toAdminUser(user)),
        ),
      revokeSessions: ({ params, request }) =>
        requirePermission({ session: ["revoke"] }).pipe(
          Effect.andThen(
            call(() =>
              auth.api.revokeUserSessions({
                headers: webHeaders(request),
                body: { userId: params.id },
              }),
            ),
          ),
          Effect.asVoid,
        ),
      removeUser: ({ params, request }) =>
        Effect.gen(function* () {
          yield* requirePermission({ user: ["delete"] })
          yield* notSelf(params.id)
          yield* call(() =>
            auth.api.removeUser({ headers: webHeaders(request), body: { userId: params.id } }),
          )
        }),
      resetGarden: () =>
        requirePermission({ garden: ["reset"] }).pipe(Effect.andThen(garden.reset)),
    })
  }),
)
