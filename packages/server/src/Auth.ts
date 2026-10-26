import type { DatabaseSync } from "node:sqlite"
import { ac, roles, type SessionUser, type SignInMethods } from "@playground/contract"
import { betterAuth, type BetterAuthOptions } from "better-auth"
import { getMigrations } from "better-auth/db/migration"
import { admin } from "better-auth/plugins/admin"
import { magicLink } from "better-auth/plugins/magic-link"
import { Config, Context, Effect, Layer, Option, Redacted } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { MailQueue } from "./MailQueue.ts"
import { Mailer } from "./Mailer.ts"
import { clientAddress, trustProxyConfig } from "./RateLimit.ts"
import { Sqlite } from "./Sqlite.ts"

/** Set by `AuthRoutes` from the resolved client address, replacing any client-sent value. */
const clientIpHeader = "x-playground-client-ip"

const authConfig = Config.all({
  environment: Config.Literals(["development", "test", "production"], "NODE_ENV").pipe(
    Config.withDefault("development"),
  ),
  host: Config.NonEmptyString("HOST").pipe(Config.withDefault("127.0.0.1")),
  port: Config.Port("PORT").pipe(Config.withDefault(4321)),
  baseURL: Config.String("BETTER_AUTH_URL").pipe(Config.option),
  secret: Config.Redacted("BETTER_AUTH_SECRET").pipe(Config.option),
  password: Config.Boolean("AUTH_PASSWORD").pipe(Config.withDefault(true)),
  magicLink: Config.Boolean("AUTH_MAGIC_LINK").pipe(Config.option),
  google: Config.all({
    clientId: Config.String("GOOGLE_CLIENT_ID"),
    clientSecret: Config.Redacted("GOOGLE_CLIENT_SECRET"),
  }).pipe(Config.option),
  microsoft: Config.all({
    clientId: Config.String("MICROSOFT_CLIENT_ID"),
    clientSecret: Config.Redacted("MICROSOFT_CLIENT_SECRET"),
    tenantId: Config.String("MICROSOFT_TENANT_ID").pipe(Config.withDefault("common")),
  }).pipe(Config.option),
})

const authOptions = (options: {
  readonly database: DatabaseSync
  readonly baseURL: string
  readonly trustedOrigins: string[]
  readonly secret: string | undefined
  readonly methods: SignInMethods
  readonly socialProviders: BetterAuthOptions["socialProviders"]
  readonly sendMail: (mail: { to: string; subject: string; text: string }) => Promise<void>
}) =>
  ({
    database: options.database,
    baseURL: options.baseURL,
    trustedOrigins: options.trustedOrigins,
    ...(options.secret === undefined ? {} : { secret: options.secret }),
    emailAndPassword: { enabled: options.methods.password },
    socialProviders: options.socialProviders,
    disabledPaths: options.methods.magicLink ? [] : ["/sign-in/magic-link", "/magic-link/verify"],
    // Web requests carry no socket address; without this, rate limits share one bucket.
    advanced: { ipAddress: { ipAddressHeaders: [clientIpHeader] } },
    databaseHooks: {
      user: {
        create: {
          // The first account becomes the admin, so a fresh install can be configured.
          // One statement, so concurrent sign-ups (even across processes) elect one admin.
          after: async (user) => {
            options.database
              .prepare(
                `UPDATE "user" SET role = 'admin' WHERE id = ? AND NOT EXISTS (SELECT 1 FROM "user" WHERE role = 'admin')`,
              )
              .run(user.id)
          },
        },
      },
    },
    plugins: [
      admin({ ac, roles, defaultRole: "user", adminRoles: ["admin"] }),
      magicLink({
        expiresIn: 300,
        sendMagicLink: ({ email, url }) =>
          options.sendMail({
            to: email,
            subject: "Your sign-in link",
            text: `Sign in by opening this link. It expires in 5 minutes.\n\n${url}`,
          }),
      }),
    ],
  }) satisfies BetterAuthOptions

type AuthInstance = ReturnType<typeof betterAuth<ReturnType<typeof authOptions>>>

/** Better Auth on SQLite. Owns sessions, accounts, and the `/api/auth/*` endpoints. */
export class Auth extends Context.Service<
  Auth,
  {
    readonly api: AuthInstance["api"]
    readonly handler: AuthInstance["handler"]
    readonly methods: SignInMethods
    /** The signed-in user for these request headers, if any. */
    readonly session: (headers: globalThis.Headers) => Effect.Effect<Option.Option<SessionUser>>
    /**
     * CSRF check for cookie-authenticated writes outside `/api/auth`, which
     * Better Auth's own origin check does not cover.
     */
    readonly isSameOrigin: (request: HttpServerRequest.HttpServerRequest) => boolean
  }
>()("auth/Auth") {
  static readonly layer = Layer.effect(
    Auth,
    Effect.gen(function* () {
      const config = yield* authConfig
      if (config.environment === "production" && Option.isNone(config.secret)) {
        return yield* Effect.die(new Error("BETTER_AUTH_SECRET is required in production"))
      }
      const mailer = yield* Mailer
      const context = yield* Effect.context<never>()
      const run = Effect.runPromiseWith(context)

      const social: Array<"google" | "microsoft"> = []
      const socialProviders: NonNullable<BetterAuthOptions["socialProviders"]> = {}
      if (Option.isSome(config.google)) {
        social.push("google")
        socialProviders.google = {
          clientId: config.google.value.clientId,
          clientSecret: Redacted.value(config.google.value.clientSecret),
        }
      }
      if (Option.isSome(config.microsoft)) {
        social.push("microsoft")
        socialProviders.microsoft = {
          clientId: config.microsoft.value.clientId,
          clientSecret: Redacted.value(config.microsoft.value.clientSecret),
          tenantId: config.microsoft.value.tenantId,
        }
      }
      const methods: SignInMethods = {
        password: config.password,
        // Production email sign-in is opt-in even when SMTP is configured.
        magicLink: Option.getOrElse(config.magicLink, () => config.environment !== "production"),
        social,
      }

      if (methods.magicLink && mailer.transport === "disabled") {
        return yield* Effect.die(
          new Error(
            "AUTH_MAGIC_LINK=true requires MAIL_TRANSPORT=smtp (or log outside production)",
          ),
        )
      }

      const mailQueue = yield* MailQueue
      const database = yield* Sqlite
      const host = config.host === "0.0.0.0" || config.host === "::" ? "127.0.0.1" : config.host
      const authority = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host
      const baseURL = Option.getOrElse(config.baseURL, () => `http://${authority}:${config.port}`)
      const trustedOrigins = [
        ...new Set([
          new URL(baseURL).origin,
          ...(config.environment === "development"
            ? [`http://127.0.0.1:${config.port}`, `http://localhost:${config.port}`]
            : []),
        ]),
      ]
      const options = authOptions({
        database,
        baseURL,
        trustedOrigins,
        secret: Option.match(config.secret, { onNone: () => undefined, onSome: Redacted.value }),
        methods,
        socialProviders,
        sendMail: (mail) => run(mailQueue.enqueue(mail)),
      })

      // Before `betterAuth()`, whose startup check reports missing tables.
      yield* Effect.promise(async () => {
        const { runMigrations } = await getMigrations(options)
        await runMigrations()
      }).pipe(Effect.withSpan("Auth.migrate"))
      const auth: AuthInstance = betterAuth(options)

      return Auth.of({
        api: auth.api,
        handler: auth.handler,
        methods,
        // Browsers send Sec-Fetch-Site or Origin on every cross-origin write; clients
        // that send neither are not browsers, so they cannot carry a victim's cookie.
        isSameOrigin: (request) => {
          const site = request.headers["sec-fetch-site"]
          if (site !== undefined) return site === "same-origin"
          const requestOrigin = request.headers["origin"]
          return requestOrigin === undefined || trustedOrigins.includes(requestOrigin)
        },
        session: (headers) =>
          Effect.promise(() => auth.api.getSession({ headers })).pipe(
            Effect.map((result) =>
              Option.fromNullishOr(result).pipe(
                Option.map(({ user }): SessionUser => ({
                  id: user.id,
                  name: user.name,
                  email: user.email,
                  image: user.image ?? null,
                  role: user.role ?? "user",
                })),
              ),
            ),
          ),
      })
    }),
  )
}

/** Converts Effect request headers for Better Auth's Web API calls. */
export const webHeaders = (request: HttpServerRequest.HttpServerRequest) =>
  new globalThis.Headers(request.headers as Record<string, string>)

/** Serves Better Auth's own endpoints: sign-in, callbacks, sign-out, and session. */
export const AuthRoutes = HttpRouter.use(
  Effect.fn(function* (router) {
    const auth = yield* Auth
    const trustProxy = yield* trustProxyConfig
    yield* router.add("*", "/api/auth/*", (request) =>
      HttpServerRequest.toWeb(request).pipe(
        Effect.flatMap((web) => {
          web.headers.set(clientIpHeader, clientAddress(request, trustProxy))
          return Effect.promise(() => auth.handler(web))
        }),
        Effect.map(HttpServerResponse.fromWeb),
      ),
    )
  }),
)
