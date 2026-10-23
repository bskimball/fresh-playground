# Deployment

[Documentation index](../README.md) · [Architecture](architecture.md) · [Releases](releases.md)

## Supported deployment shape

Use **one app process on persistent writable disk**, behind a TLS-terminating reverse proxy. Garden and Kanban retain process-local views backed by SQLite; multiple replicas are not a supported consistency model. Ephemeral/serverless filesystems lose data. No hosting configuration, deployed host, SMTP provider, or sender DNS has been validated for you.

The host needs Node.js 24.21.0, installed dependencies, and the build output. Keep `packages/web/dist/client` and `dist/server` together. The server resolves client files relative to its built location. Do not assume the server bundle eliminates the need for runtime dependencies.

## Provision and start

1. Complete the [publication prerequisites](releases.md#publication-prerequisites) if distributing publicly. Install the lockfile, run checks/tests, and build from the repository root using the [verification commands](development.md#verification).
2. Provision a persistent directory writable by the app's OS user. Set `DATABASE_PATH` to an **absolute path** outside replaceable build directories. It holds authentication and both demo stores; protect access to it and backups.
3. Configure production environment values. The following are required choices, not a ready-to-use secret file:

   | Setting              | Production choice                                                                                                                         |
   | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
   | `NODE_ENV`           | `production` (also enables JSON logs)                                                                                                     |
   | `BETTER_AUTH_SECRET` | A newly generated random secret stored in your secret manager or protected environment file; e.g. generate with `openssl rand -base64 32` |
   | `BETTER_AUTH_URL`    | Your exact external HTTPS origin, such as `https://app.example.com`                                                                       |
   | `HOST`               | `127.0.0.1` for a same-host proxy; `0.0.0.0` only where the network intentionally restricts access to the proxy                           |
   | `PORT`               | Internal listener port, default `4321`                                                                                                    |
   | `DATABASE_PATH`      | Absolute persistent file path selected above                                                                                              |
   | `AUTH_PASSWORD`      | `true` unless using another configured sign-in method                                                                                     |
   | `AUTH_MAGIC_LINK`    | `false` unless SMTP is configured and you explicitly enable it                                                                            |
   | `MAIL_TRANSPORT`     | `disabled` for no email, or `smtp` as below                                                                                               |

   `BETTER_AUTH_SECRET` is required in production. Do not copy a CI-only or documentation secret. Ensure at least one configured sign-in method is usable. Shell environment values override the optional root `.env` loaded by workspace scripts.

4. Start with `npm exec -- vp run start` at the root under your process supervisor. The workspace script's working directory is `packages/web`; a direct `node dist/server/main.js` launch must use that directory or supply equivalent paths/environment handling.
5. Before exposing the proxy publicly, privately reach `/login`, create the owner's account, and confirm `/admin/users` access. The first account becomes admin; the application does not know who the intended owner is. Preserve this database when moving to public traffic.
6. Route the public HTTPS origin to the internal HTTP listener, preserving request paths, host/origin behavior, and cookies. Configure the proxy to honor private/no-cache page responses; do not shared-cache authenticated HTML or auth/API responses. Expose the internal port only as intended. Set OAuth callbacks to `BETTER_AUTH_URL` plus `/api/auth/callback/google` or `/api/auth/callback/microsoft` if enabling those providers.
7. Check `/health/live`, `/health/ready`, `/login`, sign-in/sign-out, admin permissions, static assets, and a persistent demo edit across restart. Verify redirects/cookies through the actual TLS proxy, not only loopback. HTTPS is also needed for production service workers.

The demo Garden/Kanban APIs are publicly writable. Protect or replace them before using this template for private application data. Password reset and email verification are not implemented, even with SMTP enabled.

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

The implementation uses Nodemailer without pooling. It sends through `sendMail`, treats recipient rejection as failure, and surfaces a generic `SMTP delivery failed` rather than leaking provider details. It performs no automatic retries or durable mail queuing. Startup configuration validation is not a provider connection/delivery test. SMTP acceptance is **not inbox delivery**. Before enabling production magic links, verify provider sender authorization, SPF/DKIM/DMARC requirements, TLS/authentication, an actual sign-in email and link, and failure behavior with a controlled recipient. No provider/DNS verification or real delivery is claimed by this repository.

## Back up and restore SQLite safely

The database uses WAL mode: copying only a live `app.db` can omit committed changes in `app.db-wal`. Use a stopped-process backup for this template:

1. Block new traffic and stop the single app process cleanly; confirm no other process has the database open.
2. Copy the database **and any existing matching `-wal` and `-shm` sidecars as one stopped snapshot** to a protected backup location. Clean shutdown may remove/checkpoint sidecars; do not assume that it did. Keep the matching app revision, lockfile, and required secret/configuration securely available for recovery. Avoid including unrelated secrets in an ordinary code archive.
3. Restart and check readiness. Periodically rehearse restoration into an isolated location with disposable configuration; confirm accounts and application state. Choose backup frequency and retention based on acceptable data loss.

To restore, stop the process and block traffic again. Preserve the current database set for investigation. Replace the database with the selected stopped snapshot and its matching sidecars; remove stale sidecars from the database being replaced, never mix sets. Restore ownership/permissions and launch the compatible application revision with the intended `DATABASE_PATH` and auth secret. Check health, login/admin access, and data before reopening traffic. Avoid accidental email sends during recovery drills. A restore loses writes after the snapshot; account for browser pending edits before reconnecting clients.

## Migrations and rollback

Better Auth runs its migrations automatically at startup, before listening. Garden and Kanban currently use `CREATE TABLE IF NOT EXISTS`; there is no general app migration CLI or down-migration system. Review dependency upgrades and schema changes before restarting against production data.

Before an upgrade, take a stopped backup, retain the old build/source and lockfile, and rehearse the new revision against a copy. Include required data migration steps in release notes. A code rollback alone is unsafe when the new revision changed the schema or stored representation: stop the process, restore the matching pre-upgrade database set and compatible old revision/configuration, then validate before reopening traffic. Plan explicitly for losing post-upgrade writes. Keep browser service-worker caches and pending offline edits in the compatibility review; restoring the server does not rewind browsers.

## Logs and monitoring

Supervise restarts and retain production JSON logs appropriately. `x-request-id` correlates responses with request logs; unexpected 5xx bodies are sanitized. Logs omit request query strings, headers, and bodies but application-authored messages may contain sensitive data. Health readiness reads Garden, not SMTP or every table. Web vitals go to the local logger via `/api/performance`; there is no hosted monitoring backend or alert configuration.
