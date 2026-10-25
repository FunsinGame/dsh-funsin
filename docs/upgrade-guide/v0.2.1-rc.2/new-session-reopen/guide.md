---
kind: upgrade-guide
description: "New Session reopens the Workspace's existing blank Session instead of creating a fresh Agent."
---

# Reopen the existing New Session

English | [中文](guide.zh.md)

## Change

In Web and Desktop, **New Session** opens the Workspace's existing blank Session, keeping its unsent composer draft and its place at the top of the Session list. A Workspace without a blank Session still creates one. The action no longer creates a fresh Agent on every press, and the blank row stays listed while another Session is open. After the blank's first turn it becomes an ordinary titled Session, and the next **New Session** creates a new blank.

The Host still applies the current default Agent preset definition when the blank is reopened. A live Agent whose preset definition generation changed is recomposed and records `agent-preset/selected`, so switching bundles leaves the new-session screen on the current composition. `uiWorkspace.startSession(workspaceId)` without options follows the same behavior; calls with draft-preparation options are unchanged. Workspace reconnection continues to reuse an eligible blank.

## Migration

1. Create through the Session Controller without a `sessionId` when an integration needs a fresh Agent. Use `openWorkspace` or `connectWorkspace` when it only needs the Workspace's New Session, and send the first prompt to the returned Session to make it ordinary.
2. Do not treat a changed Session id as evidence that **New Session** was pressed; compare execution state or prompt history instead.
3. Confirm that reopening a blank restores its unsent draft, that each Workspace shows one New Session row, and that a changed preset definition is reflected after the next **New Session**.
