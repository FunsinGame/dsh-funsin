# Agent Note: New Session reopens the Workspace's blank

Status: implemented

English | [中文](2026-10-25-new-session-reopen.zh.md)

## Problem

Clicking New Session created a fresh Host Session every time, while the list showed only the selected blank. Opening another conversation hid the blank, and pressing New Session again created another blank, so an unsent draft stayed attached to a Session the list no longer showed. A Workspace could accumulate hidden blanks, and its New Session row disappeared whenever another Session was selected.

## Decision

Each Workspace has one New Session: the selected blank when one is selected, otherwise the newest blank member. The Workspace browser shows that row while another Session is selected, keeps it ahead of pinned and ordinary rows, and hides legacy duplicate blanks. `uiWorkspace.startSession` without options opens that blank through the existing reuse path instead of creating a fresh Session; a Workspace without a blank still creates one. The reused blank keeps its client-persisted composer draft. After its first `turn/start`, the Host marks it nonblank, its generated title replaces the New Session label, and the next New Session creates the next blank.

Reuse names the blank in `session.create` under the current default preset. The Host recomposes the preset when the requested definition generation differs from the running one, even under the same id, so reopening the new-session screen cannot retain a replaced composition. This keeps the reason [a reused blank runs the requested preset](2026-09-29-reused-blank-runs-requested-preset.md) stopped resolving a stale draft's recorded preset, while reversing only that note's rule that a plain New Session creates a fresh Session.

## Alternatives considered

**Keep minting a fresh Session and transfer the draft.** That leaves two durable blanks per press, requires destructive cleanup or a hidden-orphan policy, and changes the Session identity the user was editing.

**Show every blank row.** Legacy data can hold several blanks from earlier versions; multiple rows labeled New Session would violate the one-new-session guarantee.

**Keep the blank's staged preset instead of the current default.** New Session would then retain an earlier default across a default change, which the previous reuse decision rejected.

## Consequences

The New Session action no longer resets the conversation by producing a new Session id; it resets the same blank under the current default preset. A user or integration that expects an id change cannot detect the press that way. Legacy duplicate blanks stay hidden and are not deleted, so their drafts are not reachable, though they remain durable. The Host calls the preset registry's `select` for every live blank reuse; a same-generation selection is a no-op, and a replaced definition is recomposed before the first turn.

## Testing

`ui-workspace` tests cover the one-row projection, selected-blank preference, positioning, and reuse. The shipped Web composition test opens a draft, switches to another Session, and confirms that the New Session row remains, the create response names the same Session, and the draft returns. `session-presets` covers a same-id definition change recomposing the blank.
