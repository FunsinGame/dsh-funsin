# Agent Note: Workspace tab attention

Status: implemented

English | [中文](2026-10-20-workspace-tab-attention.zh.md)

## Problem

The frame-wide Workspace tab strip named every registered Workspace and nothing else. A Session keeps running when the user switches to another Workspace, so the only place its completion surfaced was its sidebar row — a list the user is not looking at when the row belongs to another Workspace. There was no way to tell from the strip which Workspace was still working, which one had finished, or whether the finished run had failed. A Workspace whose Session was blocked on the user — waiting for an approval, a plan review, or an answer — looked exactly like an idle one. Merely pointing the sidebar's reminders at the strip was not enough: the unviewed-completion reminder carries no failure outcome, and it is a Session-level fact that would be cleared by opening any Session rather than by entering the Workspace.

## Decision

The strip renders one trailing marker per tab, derived by `WorkspaceTabAttentionController` and published through the tab registration's `hooks` compartment.

**Pending requests outrank everything.** A Session whose unified status carries a pending interaction marks its tab with that request: approval or plan review shows the yellow warning triangle, and a question shows the question mark. These markers stay visible in the current Workspace because they ask the user to act. Across Sessions the most demanding request wins — approval, then plan review, then question — and a pending request outranks the running spinner and any completion dot.

**Live activity comes next.** Any Session in the Workspace whose unified status is running marks the tab with the shared ongoing spinner, even when the Workspace also holds an older unread completion.

**A settled run leaves one dot.** After the last running Session settles, an unread completion marks the tab green when the run completed and red when it failed. The failure fact comes from `ui-session`: it remembers the Host's live Agent failure while the run is running and attaches it to the unread completion that the running-state event records, so the red dot needs no new wire event. The client's list baseline carries no failure outcome, so a run the client never observed live can still be green; failures are classified only from events this connection saw.

**Entering acknowledges.** The controller keeps its own Workspace-level acknowledgement set. When the current Workspace changes, it acknowledges the completions of the Workspace being left and of the one being entered, so a dot disappears when its tab is clicked and a run that finished while the user was already in that Workspace never raises a dot later. A new run clears its Session's acknowledgement, so a rerun leaves a fresh marker. The acknowledgement set is deliberately separate from `ui-session`'s Session-level `completionUnread`: entering a Workspace must not clear the completed Session's own sidebar reminder, which still tells the user which row finished.

## Alternatives considered

- **Reuse the sidebar's green dot on the tab.** It is already cleared by opening the main Session, so clicking a Workspace tab whose most recent Session is not the completed one would leave the dot behind; it also has no failure branch. The tab dot needed its own acknowledgement rule and outcome.
- **Emit the turn outcome through the Host list.** The list summary carries only running state, and extending the wire or the list projection would add a durable field for a process-local reminder that is not restored after a reload anyway.
- **Infer failure from the Session snapshot's `lastAgentError`.** Only materialized Sessions have that snapshot; the Session that finished in another Workspace is usually not retained, which is exactly the case the marker exists for.
- **Notify per completion instead of marking the tab.** A notice queue would compete with the conversation and archive notices and would not answer "which Workspace" while several runs finish.

## Consequences

- The marker is process-local: a reload starts with no completion dots, matching the existing sidebar reminder.
- A pending marker is not acknowledged by entering the Workspace; it disappears when the underlying interaction is answered or withdrawn.
- The tab strip now injects the `uiSession` service to follow its status source; the plugin composition order is unchanged because that service is a normal Cordis dependency.
- A Workspace whose only member Sessions are archived shows no marker, and a pending request outranks run activity and a prior failure.
- Verification: `attention.client.spec.ts` covers pending precedence, running precedence, green/red outcomes, leaving/entering acknowledgement, rerun freshness, archived members, and disposal; `workspace-tabs.client.spec.tsx` covers the rendered icons, spinner, and dots; `ui-session.client.spec.ts` covers the failure attachment and its clearing.
