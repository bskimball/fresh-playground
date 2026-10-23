---
name: verify-change
description: Verify a template change before handoff or release preparation, including checks selected for API, auth, persistence, hydration, offline, and configuration changes.
---

# Verify a change

1. Inspect the current diff and [AGENTS.md](../../../AGENTS.md). Read [Development verification](../../../docs/development.md#verification); consult [Architecture](../../../docs/architecture.md) for affected runtime boundaries. Complete this step when changed behavior, unrelated work, and the cheapest relevant checks are identified.
2. Run the task-authorized checks from the repository root. Use the canonical commands rather than substituting another toolchain. For release preparation, use the full local checklist in [Releases](../../../docs/releases.md#manual-release-checklist); for a narrow task, honor its validation scope and record deferred checks. Complete this step when every selected command has an observed result. Report toolchain failures without changing the pinned runtime to hide them.
3. Exercise the relevant boundary: invalid input/typed errors for APIs; anonymous/forbidden/allowed requests for protected actions; restart persistence on a disposable database for storage; loading/error/keyboard behavior for islands; reconnect and pending-edit behavior for offline changes. Configuration or deployment changes use [Deployment](../../../docs/deployment.md), including production mail restrictions and stopped-process backup rules. Run only the applicable checks, against disposable local state. Complete this step when each affected boundary has evidence or an explicit unverified reason.
4. Report passed and failed checks, exact commands, unverified behavior, and publication blockers. A configured workflow is not a completed CI run; SMTP acceptance is not inbox delivery. Completion requires an honest result for each planned check, not an assertion that everything passes.

Preserve unrelated edits. Remote CI, provider tests, tag creation, publication, and deployment require explicit user authorization and access; this skill grants none.
