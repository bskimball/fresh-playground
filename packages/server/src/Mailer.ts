import { Socket } from "node:net"
import { Config, Context, Data, Effect, Layer, Option, Redacted } from "effect"
import nodemailer from "nodemailer"

export interface Mail {
  readonly to: string
  readonly subject: string
  readonly text: string
  readonly messageId?: string
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
      const options = {
        host: config.host,
        port: config.port,
        secure: config.secure,
        requireTLS: config.requireTLS,
        connectionTimeout: 10_000,
        greetingTimeout: 5_000,
        socketTimeout: 15_000,
        ...(Option.isSome(config.user) && Option.isSome(config.password)
          ? { auth: { user: config.user.value, pass: Redacted.value(config.password.value) } }
          : {}),
      }
      return Mailer.of({
        transport,
        send: (mail) =>
          Effect.acquireUseRelease(
            Effect.sync(() => new Socket()),
            (socket) =>
              Effect.tryPromise({
                try: async () => {
                  const sender = nodemailer.createTransport({
                    ...options,
                    // Own the underlying TCP socket per attempt, including across STARTTLS.
                    // Nodemailer still performs TLS (with verification/SNI), auth and SMTP.
                    getSocket: (_options, callback) => {
                      if (socket.destroyed) return callback(new Error("SMTP attempt closed"), false)
                      const timer = setTimeout(
                        () => socket.destroy(new Error("SMTP connection timed out")),
                        10_000,
                      )
                      const failed = (error: Error) => callback(error, false)
                      socket.once("close", () => clearTimeout(timer))
                      socket.once("error", failed)
                      socket.connect({ host: config.host, port: config.port }, () => {
                        clearTimeout(timer)
                        socket.removeListener("error", failed)
                        // TLS upgrades remove their own listeners; retain an error sink for cleanup.
                        socket.on("error", () => {})
                        callback(null, { connection: socket })
                      })
                    },
                  })
                  const result = await sender.sendMail({ from: config.from, ...mail })
                  if (result.rejected.length > 0) throw new Error("Recipient rejected")
                },
                // Provider errors can contain credentials or message details.
                catch: () => new MailDeliveryError({ message: "SMTP delivery failed" }),
              }),
            (socket) =>
              Effect.promise(
                () =>
                  new Promise<void>((resolve) => {
                    if (socket.closed) return resolve()
                    socket.once("close", () => resolve())
                    socket.destroy()
                  }),
              ),
          ),
      })
    }),
  )
}
