# Fresh playground

A reusable, single-instance web app template with an Effect HTTP server, React islands, shared typed API contracts, SQLite persistence, and Better Auth. The bundled “Little world” terrarium and Kanban board demonstrate the architecture; they are shared public demos, not private per-user data.

## Start locally

Use Node.js **24.21.0** (the CI target) and npm. From a clean checkout:

```sh
npm install
npm run dev
```

Open <http://127.0.0.1:4321> without a `.env`, or <http://localhost:4321> if you copy the supplied `.env.example` unchanged. Keep one origin for sign-in. Create your account at `/login` **before allowing public access**: the first account becomes admin. See [getting started](docs/getting-started.md) for configuration, shell caveats, renaming, and demo removal.

## Guides

- [Getting started](docs/getting-started.md): install, configure, take ownership, customize.
- [Development](docs/development.md): add pages, islands, contracts, services, and admin panels; verify changes.
- [Architecture](docs/architecture.md): request flow, persistence, hydration, and offline limitations.
- [Deployment](docs/deployment.md): one process, persistent disk, TLS, SMTP, backups, and recovery.
- [Releases](docs/releases.md): manual SemVer releases and consumer updates.
- [Changelog](CHANGELOG.md): `0.1.0` is unreleased.

## Commands and stack

Run commands from the repository root; Vite+ is a local dependency, not a global prerequisite.

| Command          | Purpose                                              |
| ---------------- | ---------------------------------------------------- |
| `npm run dev`    | Vite+ dev server with HMR, hosting the Effect app    |
| `npm run check`  | Oxlint, Oxfmt check, and workspace TypeScript checks |
| `npm run test`   | Run tests once                                       |
| `npm run build`  | Build into `packages/web/dist`                       |
| `npm run start`  | Serve the existing build                             |
| `npm run format` | Format repository files; modifies files              |

The Effect server owns routing: `vp dev` hosts it from source with HMR, and the production build serves it from `packages/web/dist`. The stack uses Effect services and `AtomHttpApi`, XState for coordinated browser state, Astryx components, StyleX, and React Compiler. [AGENTS.md](AGENTS.md) records repository conventions. Portable agent workflows live in [add-feature](.agents/skills/add-feature/SKILL.md) and [verify-change](.agents/skills/verify-change/SKILL.md).

## Scope and licensing

Deploy to a **single process with persistent writable disk**, not stateless/serverless storage or multiple app replicas. Password reset and email verification are not implemented. SMTP is available, but a host, provider, sender DNS, and actual inbox delivery must be verified by the operator.

Code is provided under the [MIT license](LICENSE), copyright 2026 Brian Kimball. Dependencies and bundled fonts remain under their own licenses. **The provenance and redistribution rights of `packages/web/public/images/terrarium-whimsical.png` and `.webp` require owner verification before public publication.** This repository does not establish those artwork rights; verify them or replace/remove the images and their references before publishing.
