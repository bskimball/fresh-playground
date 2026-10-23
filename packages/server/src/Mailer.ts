import { Config, Context, Data, Effect, Layer, Option, Redacted } from "effect"
import nodemailer from "nodemailer"

export interface Mail {
  readonly to: string
  readonly subject: string
  readonly text: string
}

export class MailDeliveryError extends Data.TaggedError("MailDeliveryError")<{
  readonly message: string
}> {}

export class Mailer extends Context.Service<
  Mailer,
  {
    readonly transport: "log" | "smtp" | "disabled"
    readonly send: (mail: Mail) => Effect.Effect<void, MailDeliveryError>
  }
>()("mail/Mailer") {
  static readonly layer = Layer.effect(
    Mailer,
    Effect.gen(function* () {
      const environment = yield* Config.Literals(
        ["development", "test", "production"],
        "NODE_ENV",
      ).pipe(Config.withDefault("development"))
      const transport = yield* Config.Literals(["log", "smtp", "disabled"], "MAIL_TRANSPORT").pipe(
        Config.withDefault(environment === "production" ? "disabled" : "log"),
      )
      if (transport === "log") {
        if (environment === "production") {
          return yield* Effect.die(
            new Error("MAIL_TRANSPORT=log is not allowed in production; use smtp or disabled"),
          )
        }
        return Mailer.of({
          transport,
          send: (mail) =>
            Effect.logInfo("Mail (log transport)").pipe(
              Effect.annotateLogs({
                "mail.to": mail.to,
                "mail.subject": mail.subject,
                "mail.text": mail.text,
              }),
            ),
        })
      }
      if (transport === "disabled") {
        return Mailer.of({
          transport,
          send: () => Effect.fail(new MailDeliveryError({ message: "Email delivery is disabled" })),
        })
      }
      const config = yield* Config.all({
        host: Config.NonEmptyString("SMTP_HOST"),
        port: Config.Port("SMTP_PORT").pipe(Config.withDefault(587)),
        secure: Config.Boolean("SMTP_SECURE").pipe(Config.withDefault(false)),
        requireTLS: Config.Boolean("SMTP_REQUIRE_TLS").pipe(Config.withDefault(true)),
        user: Config.NonEmptyString("SMTP_USER").pipe(Config.option),
        password: Config.Redacted("SMTP_PASSWORD").pipe(Config.option),
        from: Config.NonEmptyString("MAIL_FROM"),
      })
      if (Option.isSome(config.user) !== Option.isSome(config.password)) {
        return yield* Effect.die(
          new Error(
            "Set both SMTP_USER and SMTP_PASSWORD, or neither for an unauthenticated relay",
          ),
        )
      }
      const sender = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        requireTLS: config.requireTLS,
        ...(Option.isSome(config.user) && Option.isSome(config.password)
          ? { auth: { user: config.user.value, pass: Redacted.value(config.password.value) } }
          : {}),
      })
      return Mailer.of({
        transport,
        send: (mail) =>
          Effect.tryPromise({
            try: async () => {
              const result = await sender.sendMail({ from: config.from, ...mail })
              if (result.rejected.length > 0) throw new Error("Recipient rejected")
            },
            // Provider errors can contain credentials or message details.
            catch: () => new MailDeliveryError({ message: "SMTP delivery failed" }),
          }),
      })
    }),
  )
}
