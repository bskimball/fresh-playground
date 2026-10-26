# Changelog

This project uses [Semantic Versioning](docs/releases.md#version-policy). The root `package.json` is the version source.

## Current working changes — Unreleased

### Added

- Public `/api/events` SSE invalidations backed by a bounded SQLite replay log, shared browser topic watchers, and network-only refetches after invalidation.
- Native Effect SQL-backed durable jobs in the same database file, with scoped workers, delayed offers, stable-ID deduplication, and bounded retries. No external broker or queue admin UI.
- Durable magic-link mail enqueue and worker with expiry bounds and terminal secret scrubbing. Successful auth enqueue is not SMTP acceptance or inbox delivery; at-least-once processing can duplicate delivery.
- Feature-extension and operational recipes covering layer registration, replay/reconnect, proxy streaming, queue inspection, and stopped-process backup/restore.
- Per-user file uploads at `/files` with a typed multipart API, owner-only downloads that never render user HTML on the app origin, a 10 MB file and 100 MB per-user limit, and `Storage` backed by local disk or any S3-compatible bucket.
- Per-client rate limits on `/api/*` using Effect's `RateLimiter`, plus the resolved client address passed to Better Auth, whose sign-in limits previously shared one bucket across all clients. `TRUST_PROXY` selects the forwarded address behind one reverse proxy.
- Optional OTLP/HTTP export of traces, metrics, and logs when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
- `Dockerfile` with a `/data` volume, a Playwright smoke suite (`npm run e2e`), and CI jobs for both.
- Recipes for Markdown content pages and for replacing the SQLite layer.

### Limits

- Single-process deployment remains required. Full `AppServices` needs a file-backed database; native Effect persistence APIs are unstable. No exactly-once, multi-instance consistency, strong collaboration, or idempotent offline-write guarantee is introduced.
- Database/WAL/backups can contain pending mail secrets; scrubbing is not secure erasure. Failed auth payloads cannot be replayed after scrubbing: request a fresh link.
- Rate-limit counts are process-local and reset on restart. Deleting a user does not delete their files. S3 storage was exercised against an emulator, not a live provider.

The initial scope below is retained as historical context; the working changes above supersede its no-retries/no-durable-queue limitation.

## 0.1.0 — Unreleased

Initial reusable template scope; no public release or tag is asserted.

### Added

- Effect HTTP server with server-rendered React pages and independently hydrated islands.
- Shared Effect HTTP API schemas, reactive `AtomHttpApi` clients, and XState feature state machines.
- Astryx/StyleX UI with React Compiler and bundled Figtree/Fraunces fonts.
- SQLite-backed shared Garden and Kanban demos, plus Better Auth accounts and sessions.
- Password, optional OAuth, and optional magic-link sign-in; first-account admin setup and permission-checked admin panels.
- Configurable log, SMTP, and disabled mail transports; production log transport rejection and explicit magic-link opt-in.
- PWA/offline demo caching and pending-edit synchronization, health endpoints, structured request logs, and local web-vitals reporting.
- Vite+ commands and CI configuration for Ubuntu/Windows checks, tests, and builds, with a Linux production startup smoke.
- Onboarding, development, architecture, deployment, release guides, and portable agent skills.
- MIT license for template code, copyright 2026 Brian Kimball.

### Known limitations

- One app process and persistent writable disk required; demos are public/shared, not per-user private stores.
- Password reset and email verification are not implemented. SMTP acceptance is not delivery; no mail retries or durable queue.
- Offline storage is browser-local and best-effort, without cross-device conflict merging or server idempotency.
- Bundled terrarium PNG/WebP provenance and redistribution rights require owner verification before public publication, or replacement/removal.
- Hosting, provider/DNS verification, and public release publication remain operator/maintainer responsibilities.
