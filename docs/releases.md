# Releases and template updates

[Documentation index](../README.md) · [Changelog](../CHANGELOG.md) · [Deployment](deployment.md)

## Version policy

The root [`package.json`](../package.json) is the release version source. It is currently **`0.1.0`, unreleased**. Workspace packages are private and have no independent release versions. Use manual SemVer: patch for compatible fixes, minor for compatible additions, and major for incompatible changes once stable. During `0.x`, document breaking changes explicitly and use a minor increment for them; use patches for compatible fixes. Include database, configuration, browser/offline storage, and API compatibility in this decision.

No command or workflow in this template publishes packages, deploys a host, pushes tags, or creates GitHub releases automatically. `private: true` prevents ordinary npm package publication. Tag verification is not a release publication job.

## Publication prerequisites

Before a public repository/template or release is published:

- Have the owner verify provenance and redistribution rights for `packages/web/public/images/terrarium-whimsical.png` and `.webp`, retaining the evidence and any required notices. **Those rights are not established here.** Alternatively replace/remove both images and update the image, fallback, manifest/icon, and precache references listed in [demo removal](getting-started.md#remove-or-replace-the-demos).
- Keep the [MIT notice](../LICENSE), copyright 2026 Brian Kimball, for template code. Dependencies and bundled fonts remain under their own licenses; review applicable distribution notices. MIT does not establish the unverified artwork's rights.
- Confirm that no real secrets, personal data, local databases, or sensitive sign-in links are included in tracked files or release assets.
- Confirm the documented build/runtime flow and actual CI results. Do not infer Windows development watcher support from a Windows build job, or real SMTP delivery from a unit test.

## Manual release checklist

These are maintainer instructions, **not authorization for an agent to change remote state**.

1. Choose the version from the compatibility policy. Review changes and migration/rollback requirements, including dependencies and pending offline storage compatibility.
2. Update root `package.json` and its lockfile version consistently. For a future patch, `npm version patch --no-git-tag-version` is an example local version-bump command; `minor`/`major` follow the same form. For the first `0.1.0` release, the version is already set: do not bump just to create a tag. Inspect any npm lifecycle effects and the diff. Do not assign independent workspace versions.
3. Change the appropriate unreleased changelog entry to a version/date only when preparing the actual release. State notable behavior, breaking changes, required configuration, migration instructions, and known limits. Keep a new unreleased section for subsequent work.
4. Run `npm ci` for a frozen install, then `npm run check`, `npm run test`, and `npm run build`. Exercise production startup and health/login with a disposable persistent database and a generated local secret. If mail behavior changed, perform a controlled SMTP acceptance and inbox/link check separately.
5. Inspect [`.github/workflows/verify.yml`](../.github/workflows/verify.yml) and the actual run results. It targets Ubuntu and Windows with Node 24.21.0, runs install/check/test/build, checks `v*` tags against the root version, and runs a Linux production health/login smoke. It does not deploy or test SMTP/browser/proxy behavior. Local success is not evidence that remote CI ran.
6. Review and commit the intended files, including changelog and lockfile. After approval, create an annotated `v<root-version>` tag at that commit and push the intended commit/tag. For this initial version the tag would be `v0.1.0`. This guide does not execute `git tag`, `git push`, or any version command for you.
7. Check the tag's CI run, then manually create the matching GitHub release with reviewed notes and any intentional distribution assets. Do not mark a failed/unverified build as passed. Link the migration/rollback guidance and list remaining known limitations.

### Example commands, not release authorization

Run these only at the corresponding checklist steps after review/approval; they are not one uninterrupted script. The root `package.json` supplies the version, and `.github/workflows/verify.yml` checks the tag against it.

For step 2, a **future patch** bump (skip this for the already-set first `0.1.0` release):

```sh
npm version patch --no-git-tag-version
```

Inspect lifecycle effects and the package/lockfile diff, then finish the changelog, validation, and reviewed release commit before tagging. For step 6, replace every placeholder below: `X.Y.Z` must match the root version; `APPROVED_RELEASE_COMMIT` must identify that reviewed commit. The remote and branch are deliberate choices, not an assumption that every release goes directly to `main`.

```sh
git tag -a vX.Y.Z APPROVED_RELEASE_COMMIT -m "Release vX.Y.Z"
# Only after approval to push this commit to this branch on this remote:
git push APPROVED_REMOTE APPROVED_RELEASE_COMMIT:refs/heads/APPROVED_BRANCH refs/tags/vX.Y.Z
```

For the initial release, substitute `v0.1.0` for `vX.Y.Z`. A rejected push is a reason to review branch policy/state, not to force-push. These examples do not create the GitHub release in step 7.

A release is public only after those publication actions actually occur. Neither a version field nor this initial changelog is proof of a release.

## Updating an application made from the template

Consumers update manually; there is no template updater or automatic migration service. Keep the originating version/commit recorded in your app. Compare upstream changes with your own branch, then selectively merge or cherry-pick reviewed commits. Reconcile renamed workspace imports, dependency/lockfile changes, removed demos, environment settings, and schema changes rather than replacing customized files wholesale.

Before updating a live instance, back up the database and rehearse on a copy. Run checks/tests/build and exercise your own routes, permissions, hydration, offline recovery, and SMTP if used. Review upstream changelog entries across every skipped release. Deploy with the [single-instance upgrade/rollback procedure](deployment.md#migrations-and-rollback); accepting a template update does not authorize remote deployment or guarantee compatibility with your app.
