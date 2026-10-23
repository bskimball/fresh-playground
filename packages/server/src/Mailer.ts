import { Context, Effect, Layer } from "effect"

export interface Mail {
  readonly to: string
  readonly subject: string
  readonly text: string
}

/** Outgoing email. Swap `Mailer.log` for a real provider layer before production use. */
export class Mailer extends Context.Service<
  Mailer,
  { readonly send: (mail: Mail) => Effect.Effect<void> }
>()("mail/Mailer") {
  /** Writes each message to the server log. Message bodies can hold sign-in links. */
  static readonly log = Layer.succeed(
    Mailer,
    Mailer.of({
      send: (mail) =>
        Effect.logInfo("Mail (log transport)").pipe(
          Effect.annotateLogs({
            "mail.to": mail.to,
            "mail.subject": mail.subject,
            "mail.text": mail.text,
          }),
        ),
    }),
  )
}
