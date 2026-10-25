import { randomUUID } from "node:crypto"
import { Context, Effect, Layer, Schedule, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { PersistedQueue, runWorker } from "./Jobs.ts"
import { Mailer, type Mail } from "./Mailer.ts"

export const MailJob = Schema.Struct({
  to: Schema.String,
  subject: Schema.String,
  text: Schema.String,
  deadline: Schema.Number,
})

/** Durable acceptance only. Enqueue is after auth token creation, not atomic with it. */
export class MailQueue extends Context.Service<
  MailQueue,
  {
    readonly enqueue: (
      mail: Mail,
    ) => Effect.Effect<void, PersistedQueue.PersistedQueueError | Schema.SchemaError>
  }
>()("mail/MailQueue") {
  static readonly layer = Layer.effect(
    MailQueue,
    Effect.gen(function* () {
      const mailer = yield* Mailer
      const sql = yield* SqlClient.SqlClient
      const queue = yield* PersistedQueue.make({
        name: "auth-mail",
        schema: MailJob,
        maxAttempts: 5,
        retrySchedule: Schedule.exponential("2 seconds"),
      })
      // Keep terminal metadata inspectable without retaining email addresses or tokens.
      // A crash between acknowledgement and scrubbing is repaired on startup / within 1 second.
      const scrub = Effect.gen(function* () {
        yield* sql`UPDATE durable_jobs SET element = '{}', last_failure = CASE WHEN state = 'failed' THEN 'Mail delivery failed' ELSE NULL END WHERE queue_name = 'auth-mail' AND state IN ('completed', 'failed') AND element <> '{}'`
        yield* sql`DELETE FROM durable_jobs WHERE queue_name = 'auth-mail' AND state = 'pending' AND acquired_by IS NULL AND json_extract(element, '$.deadline') <= ${Date.now()}`
      }).pipe(Effect.catchCause(() => Effect.logWarning("Mail queue cleanup failed")))
      yield* scrub
      yield* scrub.pipe(Effect.andThen(Effect.sleep("1 second")), Effect.forever, Effect.forkScoped)
      yield* runWorker(
        queue,
        (mail, { id }) =>
          Effect.suspend(() => {
            const remaining = mail.deadline - Date.now()
            if (remaining <= 0) return Effect.void
            return mailer
              .send({
                to: mail.to,
                subject: mail.subject,
                text: mail.text,
                messageId: `<${id}@auth-mail.local>`,
              })
              .pipe(Effect.timeout(Math.min(remaining, 20_000)))
          }),
        scrub,
      )
      return MailQueue.of({
        enqueue: (mail) =>
          queue
            .offer(
              {
                to: mail.to,
                subject: mail.subject,
                text: mail.text,
                deadline: Date.now() + 240_000,
              },
              { id: randomUUID() },
            )
            .pipe(Effect.asVoid),
      })
    }),
  )
}
