# Agent Note: Desktop smoke teardown removes trees synchronously

Status: implemented

English | [中文](2026-10-27-desktop-smoke-teardown-removes-trees-synchronously.zh.md)

## Problem

`package:win:x64:unsigned` stopped after its runtime smoke: `prepare:dsh` reported every stage successful but its process never exited, so the packaging step waited without progress for as long as it was left running. The packaged-runtime smoke after `electron-builder` ended the same way.

The smoke home holds the plugin the Host installs through the bundled pnpm, which creates a directory link under the profile's `node_modules`. Running the removal on that tree in a standalone Node 24 process on Windows 11 reproduced the stall: asynchronous `fs.rm` deleted every other entry, then stayed pending on the link, never settling and never failing, past a 60-second bound. `readdir` on the same tree still worked, so no threadpool starvation was involved, and synchronous `rmSync` removed the remaining tree in about 60 ms.

## Decision

Build-time teardown removes these trees synchronously through `removeTree` in `apps/desktop/scripts/remove-tree.ts`, used by the runtime smoke and the prepared-runtime smoke. `prepare-dsh.ts` already removed its build root with `rmSync`, which is why only the two smoke steps stalled.

The synchronous call blocks the script's event loop for the duration of one temp-tree deletion, and it does not follow directory links, so deleting a home cannot delete the store a link points at.

## Alternatives considered

**Bound the asynchronous removal with a timeout and continue.** That leaves the pending promise alive, which keeps the process running: builds of 2026-10-25 and 2026-10-27 only finished because the entry scripts forced `process.exit(0)` after the work.

**Retry the asynchronous removal.** The promise never settles and never rejects, so no retry path runs.

**Remove only the link, then delete the rest asynchronously.** That guesses at the triggering entry and leaves the same class of tree dependent on the ordering.

## Consequences

A stalled smoke can no longer hang the packaging pipeline, and no build step needs a forced process exit. The removal is synchronous, which is acceptable for build scripts and matches the existing `prepare-dsh.ts` cleanup.

The underlying asynchronous behavior is unconfirmed against an upstream report; the trigger observed here is a package-manager directory link inside the removed tree. If a future Node release removes the stall, asynchronous removal can return, and the smoke teardown tests then decide whether the change is behavior-preserving.

## Testing

`apps/desktop/tests/remove-tree.spec.ts` covers removal of a tree holding a package directory link, that the linked store survives, and that a missing path is accepted; `apps/desktop/tests/prepared-runtime-smoke.spec.ts` asserts the native-cache directory is gone after the prepared-runtime smoke. On Windows, `pnpm run prepare:dsh` completed with exit code 0 without a forced exit and left no `dsh-desktop-smoke-*` or `desktop-native-smoke-*` directory behind.
