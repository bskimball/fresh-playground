# Changelog

This project uses [Semantic Versioning](docs/releases.md#version-policy). The root `package.json` is the version source.

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
