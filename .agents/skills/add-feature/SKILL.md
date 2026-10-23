---
name: add-feature
description: Add or extend an app route, React island, shared API/schema, Effect service, or permission-checked admin panel in this template.
---

# Add a feature

1. Read [AGENTS.md](../../../AGENTS.md) and the relevant recipe in [Development](../../../docs/development.md). Read [Architecture](../../../docs/architecture.md) when the change crosses package, persistence, auth, hydration, or offline boundaries. Inspect the current worktree and the nearest implementation. Complete this step when the affected layers, existing edits, and required authorization/data behavior are identified.
2. Implement the smallest complete path through those layers, following the recipe's registrations and wiring. Keep feature code together and browser entries thin. Preserve existing permission checks, schema validation, and inert/loading/error hydration behavior. For public demo APIs becoming private features, define and enforce the intended server authorization rather than relying on panel visibility. Complete this step when every changed route/entry/group/service is registered and the requested behavior is connected end to end.
3. Follow [Verification](../../../docs/development.md#verification) at the scope authorized by the task. Extend an existing boundary test or add a regression only for a concrete failure that needs coverage. Use disposable state for persistence/auth checks. Complete this step when applicable checks have actual results and failures are fixed or explicitly reported.
4. Report changed paths, behavior, checks run, skipped checks, and blockers. Update canonical human docs if the feature changes their contract. Completion requires the requested behavior and wiring to be accounted for, with remaining uncertainty stated; never infer remote CI, SMTP delivery, or deployment success from local checks.

Work locally unless the user explicitly authorizes remote operations. Release and deployment instructions are reference, not permission to publish, push, or deploy.
