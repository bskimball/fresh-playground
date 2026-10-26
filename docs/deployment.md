# Deployment

[Documentation index](../README.md) · [Architecture](architecture.md) · [Releases](releases.md)

## Supported deployment shape

Use **one app process on persistent writable disk**, behind a TLS-terminating reverse proxy. Garden and Kanban retain process-local views backed by SQLite; multiple replicas are not a supported consistency model. Ephemeral/serverless filesystems lose data. No hosting configuration, deployed host, SMTP provider, or sender DNS has been validated for you.

The host needs Node.js 24.21.0, installed dependencies, and the build output. Keep `packages/web/dist/client` and `dist/server` together. The server resolves client files relative to its built location. Do not assume the server bundle eliminates the need for runtime dependencies.

## Provision and start

1. Complete the [publication prerequisites](releases.md#publication-prerequisites) if distributing publicly. Run `npm ci` for a frozen install, run checks/tests, and build from the repository root using the [verification commands](development.md#verification).
2. Provision a persistent directory writable by the app's OS user. Set `DATABASE_PATH` to an **absolute path** outside replaceable build directories. It holds authentication, demo stores, event generation/replay, and durable queues; protect it and its backups. Full `AppServices` requires a file-backed path (not `:memory:`). Raw domain/auth/events and native jobs open two scoped connections to this same file, not two databases. Standalone `Sqlite.memory` remains available outside full app composition.
3. Configure production environment values. The following are required choices, not a ready-to-use secret file:

   | Setting              | Production choice                                                                                                                         |
   | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
   | `NODE_ENV`           | `production` (also enables JSON logs)                                                                                                     |
   | `BETTER_AUTH_SECRET` | A newly generated random secret stored in your secret manager or protected environment file; e.g. generate with `openssl rand -base64 32` |
   | `BETTER_AUTH_URL`    | Your exact external HTTPS origin, such as `https://app.example.com`                                                                       |
   | `HOST`               | `127.0.0.1` for a same-host proxy; `0.0.0.0` only where the network intentionally restricts access to the proxy                           |
   | `PORT`               | Internal listener port, default `4321`                                                                                                    |
   | `DATABASE_PATH`      | Absolute persistent file path selected above                                                                                              |
   | `STORAGE_PATH`       | Absolute persistent directory for uploads, next to the database; or `STORAGE_DRIVER=s3` as in [file storage](#file-storage)               |
   | `TRUST_PROXY`        | `true` behind exactly one reverse proxy that appends `X-Forwarded-For`; otherwise every client shares the proxy's rate limits             |
   | `AUTH_PASSWORD`      | `true` unless using another configured sign-in method                                                                                     |
   | `AUTH_MAGIC_LINK`    | `false` unless SMTP is configured and you explicitly enable it                                                                            |
   | `MAIL_TRANSPORT`     | `disabled` for no email, or `smtp` as below                                                                                               |

   `BETTER_AUTH_SECRET` is required in production. Do not copy a CI-only or documentation secret. Ensure at least one configured sign-in method is usable. Shell environment values override the optional root `.env` loaded by workspace scripts.

4. Start with `npm run start` at the root under your process supervisor. The workspace script's working directory is `packages/web`; a direct `node dist/server/main.js` launch must use that directory or supply equivalent paths/environment handling.
5. Before exposing the proxy publicly, privately reach `/login`, create the owner's account, and confirm `/admin/users` access. The first account becomes admin; the application does not know who the intended owner is. Preserve this database when moving to public traffic.
6. Route the public HTTPS origin to the internal HTTP listener, preserving request paths, host/origin behavior, and cookies. Configure the proxy to honor private/no-cache page responses; do not shared-cache authenticated HTML or auth/API responses. Expose the internal port only as intended. Set OAuth callbacks to `BETTER_AUTH_URL` plus `/api/auth/callback/google` or `/api/auth/callback/microsoft` if enabling those providers.
7. Check `/health/live`, `/health/ready`, `/login`, sign-in/sign-out, admin permissions, static assets, and a persistent demo edit across restart. Verify redirects/cookies through the actual TLS proxy, not only loopback. HTTPS is also needed for production service workers.

The demo Garden/Kanban APIs are publicly writable. Protect or replace them before using this template for private application data. Password reset and email verification are not implemented, even with SMTP enabled.

### Check the running listener

These shell examples use the health routes defined in `packages/web/src/server/main.ts`. For the default same-host listener:

```sh
curl --fail --silent --show-error http://127.0.0.1:4321/health/live
curl --fail --silent --show-error http://127.0.0.1:4321/health/ready
```

Expect JSON with `status` equal to `alive` and `ready`, respectively. Adapt the host/port if configured differently. After proxy setup, repeat through your real HTTPS origin (replace the example origin):

```sh
curl --fail --silent --show-error https://app.example.com/health/live
curl --fail --silent --show-error https://app.example.com/health/ready
```

These checks do not establish successful login, mail delivery, or restart persistence; complete step 7 separately.

## Run with Docker

The root `Dockerfile` builds the same production server into a Node 24.21.0 image. It runs as the unprivileged `node` user, listens on `0.0.0.0:4321`, and keeps `DATABASE_PATH=/data/app.db` and `STORAGE_PATH=/data/uploads` on the `/data` volume. A health check polls `/health/ready`.

```sh
docker build -t fresh-playground .
docker run -d --name app -p 127.0.0.1:4321:4321 -v fresh-data:/data \
  -e BETTER_AUTH_URL=https://app.example.com \
  -e BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  -e TRUST_PROXY=true \
  fresh-playground
```

The one-process rule still applies: run one container per volume, never replicas sharing it. Store the secret in your secret manager rather than regenerating it per run, since a new secret signs everyone out. The CI `docker` job builds the image and checks startup; it does not test your proxy or volume backups. Stop the container before copying the volume, as in the [backup steps](#back-up-and-restore-sqlite-safely).

## SSE through the HTTP proxy

`GET /api/events` is a public invalidation stream, not a private/full-state feed. Disable proxy buffering, response caching, and compression/transformation for this path. The app sends `Cache-Control: no-store, no-transform`, `Content-Encoding: identity`, and `X-Accel-Buffering: no`; ensure your proxy/CDN actually honors the streaming policy. Permit a response lifetime longer than 120 seconds and an idle read timeout comfortably above the approximately 15-second heartbeat interval. The server intentionally retires connections after 120 seconds; native EventSource reconnect is expected, not a reason to restart the app.

Test through the actual HTTPS proxy with `curl -N https://app.example.com/api/events` (replace the origin); expect an initial `resync` and continuing heartbeats without buffered bursts. `Last-Event-ID` enables replay within 1,000 retained events; invalid/expired/foreign cursors resync public topics. Reconnect after downtime refetches current state. SSE does not change the single-process limit, offline-write ambiguity, or last-write-wins conflicts.

## File storage

With the default `STORAGE_DRIVER=local`, uploaded bytes live under `STORAGE_PATH` and their metadata in the database. Treat the directory as part of the database: same disk, same permissions, same backups. A database restored without its matching uploads lists files that download as 404; uploads without the database are unreachable.

For S3-compatible storage, set `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`, plus `S3_REGION` (default `us-east-1`) and `S3_ENDPOINT` for anything other than AWS. Requests are path-style (`<endpoint>/<bucket>/<key>`). The credentials need only `GetObject`, `PutObject`, and `DeleteObject` on that bucket. Keep the bucket private; the app streams downloads itself after checking ownership. Bucket versioning or provider backups cover the objects, but restoring the database to an older snapshot can still reference deleted objects. S3 support was exercised against the moto S3 emulator, which does not strictly validate signatures, not against a live provider; verify with your provider before relying on it.

Limits are 10 MB per file and 100 MB per user (`FILE_MAX_BYTES` and `FILE_QUOTA_BYTES` in `packages/contract/src/Files.ts`). Allow request bodies of at least 10 MB at the proxy.

## Email and SMTP

`packages/server/src/Mailer.ts` implements `MAIL_TRANSPORT=log|smtp|disabled`. Defaults are `log` in development/test and `disabled` in production. Production explicitly rejects `log`. Outside production the log transport includes sign-in links, so restrict log access. `AUTH_MAGIC_LINK` defaults off in production; `true` with disabled transport fails startup.

For SMTP, set `MAIL_TRANSPORT=smtp`, `SMTP_HOST`, and `MAIL_FROM`. Set both `SMTP_USER` and `SMTP_PASSWORD`, or neither for an unauthenticated relay. A half-configured credential pair fails startup. Store credentials outside version control.

Example **non-secret** provider settings for mandatory STARTTLS:

```dotenv
MAIL_TRANSPORT=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
MAIL_FROM=Little World <signin@example.com>
AUTH_MAGIC_LINK=true
```

Replace the example host/sender with those authorized by your provider, then supply credentials securely. Port 587 with `SMTP_SECURE=false` and `SMTP_REQUIRE_TLS=true` requires the connection to upgrade via STARTTLS. For **implicit TLS**, normally port 465, use `SMTP_PORT=465` and `SMTP_SECURE=true`; retain `SMTP_REQUIRE_TLS=true`.

For an isolated **local development relay only**, you can use `SMTP_HOST=127.0.0.1`, its listening port (often 1025), `SMTP_SECURE=false`, and `SMTP_REQUIRE_TLS=false`, with both credentials absent. This explicitly opts out of transport encryption; it is not the public SMTP configuration. Do not disable certificate verification to work around provider errors.

The implementation uses a per-attempt Nodemailer transport without pooling. Its public `getSocket` hook supplies an owned TCP socket; Effect finalization destroys the socket and waits for closure on completion, error, timeout, or shutdown interruption. Nodemailer retains implicit TLS/STARTTLS, certificate verification/SNI, authentication, and formatting. It sends through `sendMail`, treats recipient rejection as failure, and surfaces a generic `SMTP delivery failed` rather than leaking provider details. Closing a socket cannot retract DATA already accepted by the SMTP receiver; cancellation does not guarantee non-delivery. Auth mail is handed to the native durable `auth-mail` queue before the auth callback succeeds; success means **durably queued**, not SMTP acceptance. Token creation and enqueue are not atomic. A scoped worker makes at most five attempts, with exponential retry starting at two seconds, a 20-second send/attempt bound, and a 240-second deadline inside the 300-second magic-link TTL. The store refreshes locks every 10 seconds with 60-second lease expiry. Crashes/ambiguous SMTP outcomes can still duplicate a message; the stable Message-ID does not guarantee provider deduplication. Completed/failed auth payloads are scrubbed after attempts, on startup, and every second; expired unclaimed pending jobs are deleted. DB pages, WAL, and backups can contain pending addresses/tokens, and scrubbing is **not secure erasure**. Startup configuration validation is not a provider connection/delivery test. SMTP acceptance is **not inbox delivery**. Before enabling production magic links, verify provider sender authorization, SPF/DKIM/DMARC requirements, TLS/authentication, an actual sign-in email and link, and failure behavior with a controlled recipient. No provider/DNS verification or real delivery is claimed by this repository.

## Durable job operations

`Jobs` uses native Effect `PersistedQueue` through `@effect/sql-sqlite-node` 4.0.5, not Redis or an external broker. There is no queue admin UI or supported generic replay command. APIs and native table migrations are unstable; review upgrades against the lockfile and an isolated backup. Multiple app instances are still unsupported.

With the SQLite CLI installed, these **read-only** queries inspect status without selecting `element` or `last_failure` (either may contain secrets for feature jobs). Replace the absolute path. Counts include delayed/leased pending work, not just immediately runnable work.

```sh
sqlite3 -readonly /absolute/path/to/app.db "SELECT queue_name, state, COUNT(*) AS jobs, MAX(attempts) AS max_attempts FROM durable_jobs GROUP BY queue_name, state ORDER BY queue_name, state;"
sqlite3 -readonly /absolute/path/to/app.db "SELECT queue_name, id, attempts, created_at, updated_at FROM durable_jobs WHERE state = 'failed' ORDER BY updated_at DESC LIMIT 100;"
```

Keep operational output protected; do not use business secrets in job IDs. Completed rows normally retain dedupe IDs for one day, failed rows for seven days, with cleanup every minute. This is not permanent history. Restart allows pending work to resume and expired leases to be reclaimed; it is not a guaranteed resend or exactly-once recovery. Investigate configuration/provider failures before retrying business actions. Never blindly reset state/attempt counters, delete leases, or bulk re-offer unknown payloads: side effects may already have happened.

Auth terminal payloads are scrubbed to `{}` and failed metadata is sanitized. **Do not replay failed auth rows; request a fresh magic link.** The old token may already be expired. Other features need their own reviewed recovery procedure, payload compatibility, deadline and deduplication policy. Readiness does not prove the worker or provider is healthy; monitor pending age/failure counts and test controlled delivery separately.

## Back up and restore SQLite safely

The database uses WAL mode: copying only a live `app.db` can omit committed changes in `app.db-wal`. Use a stopped-process backup for this template:

1. Block new traffic and stop the single app process cleanly, including scoped mail/feature workers and SSE streams; confirm both SQLite connections and any inspection tools are closed. Do not copy while a worker can claim, acknowledge, or scrub jobs.
2. Copy the database **and any existing matching `-wal` and `-shm` sidecars as one stopped snapshot** to a protected backup location, together with the local `STORAGE_PATH` directory when using local file storage. Clean shutdown may remove/checkpoint sidecars; do not assume that it did. Keep the matching app revision, lockfile, and required secret/configuration securely available for recovery. Avoid including unrelated secrets in an ordinary code archive.
3. Restart and check readiness plus queue metadata/worker behavior. Periodically rehearse restoration into an isolated location with disposable configuration; confirm accounts, application state, event generation/replay, and pending/completed/failed queues. Choose backup frequency and retention based on acceptable data loss.

Example POSIX shell copy for step 2, **only after traffic is blocked and all database users are stopped**. Replace both placeholder paths; `backup` must be a new snapshot directory under a protected existing parent. Stopping/restarting is deliberately not scripted because it depends on your process supervisor.

```sh
set -eu
db='/absolute/path/to/app.db'                    # Your DATABASE_PATH
backup='/protected/backup/path/snapshot-YYYYMMDD-HHMMSS'
mkdir -m 700 "$backup"                          # Fails if this snapshot already exists
cp -p "$db" "$backup/"
for suffix in -wal -shm; do
  if [ -f "$db$suffix" ]; then
    cp -p "$db$suffix" "$backup/"
  fi
done
```

Do not use a partial snapshot if any copy fails. Keep the process stopped until the copy finishes; then restart it and run the health checks above. This copies only the database set, not the matching revision, lockfile, or protected recovery configuration required by step 2.

To restore, stop the process and block traffic again. Preserve the current database set for investigation. Replace the database with the selected stopped snapshot and its matching sidecars; remove stale sidecars from the database being replaced, never mix sets. Restore ownership/permissions and launch the compatible application revision with the intended `DATABASE_PATH` and auth secret. Check health, login/admin access, and data before reopening traffic. Restoring also restores event generation/cursors and queue dedupe/lease state. Existing browser cursors ahead of restored history resync; restoring the server does not rewind browser caches or pending edits. Pending jobs can run as soon as `AppServices` starts, before public traffic reopens; previously delivered work can be redelivered from an older snapshot. Use an isolated controlled mail sink and safe feature-side-effect configuration in drills, not production recipients. A restore loses writes after the snapshot; review expired mail, duplicates, pending edits, and downstream reconciliation before reconnecting clients.

## Migrations and rollback

Better Auth runs its migrations automatically at startup, before listening. Garden, Kanban, and Events currently create missing tables; native jobs run their own `durable_jobs_migrations`. There is no general app migration CLI or down-migration system. Review dependency upgrades and schema changes before restarting against production data.

Before an upgrade, take a stopped backup, retain the old build/source and lockfile, and rehearse the new revision against a copy. Include required data migration steps in release notes. A code rollback alone is unsafe when the new revision changed the schema or stored representation: stop the process, restore the matching pre-upgrade database set and compatible old revision/configuration, then validate before reopening traffic. Plan explicitly for losing post-upgrade writes. Keep browser service-worker caches and pending offline edits in the compatibility review; restoring the server does not rewind browsers.

## Logs and monitoring

Set `OTEL_EXPORTER_OTLP_ENDPOINT` (and `OTEL_EXPORTER_OTLP_HEADERS` for vendor credentials) to export traces, metrics, and logs as OTLP/HTTP JSON to a collector or vendor; see [operations](architecture.md#operations). JSON console logs continue either way. Exported spans and logs carry request paths and application messages, so apply the same data handling as for logs.

Supervise restarts and retain production JSON logs appropriately. `x-request-id` correlates responses with request logs; unexpected 5xx bodies are sanitized. Logs omit request query strings, headers, and bodies but application-authored messages may contain sensitive data. Health readiness reads Garden, not SMTP or every table. Web vitals go to the local logger via `/api/performance`. No monitoring backend or alerting is included; 429 responses in the logs indicate clients hitting [rate limits](architecture.md#authentication-and-trust-boundaries).
