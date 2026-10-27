# Agent Note: Build scratch directories stay inside the build tree

Status: implemented

English | [中文](2026-10-27-build-scratch-directories-stay-in-the-build-tree.zh.md)

## Problem

On Windows, the packaged Electron executable run as Node cannot create directories under the build host's temporary directory: `mkdir` fails with `EPERM` anywhere under `%TEMP%`, including inside a directory the build host itself had just created there, while the same process writes normally inside the build tree. The build host's own Node process writes to `%TEMP%` without trouble, so the restriction belongs to the bundled executable and not to the account or the directory's permissions.

`prepare:dsh` created its runtime build root with `mkdtempSync(tmpdir(), …)`, so the bundled pnpm install failed on the first `mkdir` of its store (`store/v11`), and both smoke steps placed their isolated homes under `%TEMP%` as well. Packaging therefore only worked when the caller redirected `TMP` and `TEMP` for the whole build.

## Decision

Build steps that run the bundled runtime take their scratch directories from `resolveBuildTemporaryRoot` in `apps/desktop/scripts/build-temporary-root.ts`, which resolves the build-wide `.desktop-build/tmp` path and creates it. `prepare-dsh` builds its runtime root there and gives the pnpm child `TMP`, `TEMP`, and `TMPDIR` through `buildTemporaryEnvironment`; the runtime smoke and the prepared-runtime smoke use the same root for their isolated homes and native cache, and pass those variables to the Host child.

The directory is shared across targets like the download cache, and each use creates its own uniquely named child, so parallel target builds cannot collide. Teardown of these directories is synchronous, for the reason recorded in [Desktop smoke teardown removes trees synchronously](2026-10-27-desktop-smoke-teardown-removes-trees-synchronously.md).

## Alternatives considered

**Require the caller to redirect `TMP`/`TEMP`.** That is what the packaging notes prescribed after the failure; it is undiscoverable from the script, and `package-desktop.ps1` cannot know which directory the bundled executable may write to on a given host.

**Use `%TEMP%` when it is writable and fall back otherwise.** Probing writability duplicates the failure path and leaves builds with two different scratch locations, so artifact paths and cleanup differ per host.

**Keep the scratch directories outside the repository to shorten paths.** It reintroduces the dependency on the host's temporary directory, which is exactly what fails here; the build tree is already where every other intermediate artifact goes.

## Consequences

Packaging no longer depends on the host's temporary directory being writable by the bundled Electron executable, and `package-desktop.ps1` needs no environment preparation. Scratch directories now live under `apps/desktop/.desktop-build/tmp`, which `.gitignore` already excludes, and they disappear from the workspace when a build finishes because each owner removes its own directory.

The build tree path is longer than `%TEMP%`, so deeply nested dependencies see slightly longer paths. Nothing on the current Windows host exceeded a path limit, and the runtime build root itself is removed on success and failure alike.

## Testing

`apps/desktop/tests/build-temporary-root.spec.ts` covers creating the root, asking for it twice, and the temporary variables pointing at a directory the child may write; `apps/desktop/tests/desktop-build-paths.spec.ts` covers the root being shared across targets. On Windows, `package-desktop.ps1` completed with no `TMP`/`TEMP` override: `prepare:dsh` installed the runtime under `.desktop-build/tmp`, both smokes passed, and the installer and its checksum were written to `dist/desktop`.
