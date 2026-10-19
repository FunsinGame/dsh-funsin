# Agent Note: Workspace tabs and the current-Workspace session list

Status: implemented

English | [中文](2026-10-16-workspace-tabs-and-current-workspace-list.zh.md)

## Problem

The sidebar's `sidebar.workspaces` region carried the whole Workspace inventory: every registered Workspace appeared as a collapsible section (or a tree node, or a flat mixed list) with its own Session rows, its own drag domain, rename and delete dialogs, and a five-row watermark per section. Three grouping modes, path nesting, an Ungrouped bucket, and a Workspace drag surface existed to arrange a list nobody could scan once an installation had more than a handful of Workspaces. Workspace management controls (add, rename, delete, reorder) were spread between the section header and each row's menu.

## Decision

The Workspace inventory moves to a frame-wide tab strip, and the sidebar lists one Workspace's Sessions.

**The strip is a new frame row.** `ui-layout`'s `AppFrame` gains a `shell.header` single root-scoped seat above the three columns (`grid-template-rows: auto minmax(0, 1fr) auto`; the resize handles now span row 2). Like `shell.bottom`, an unoccupied seat reserves no height, and the occupant owns its own height and horizontal scrolling. `ui-workspace` registers the strip there, which is why the package now fills three holes (`shell.header`, `sidebar.workspaces`, `conversation.hero.workspace`) and declares a directory-flow child under the strip instead of under the sidebar: `shell.header.directoryFlow` replaces `sidebar.workspaces.directoryFlow`, and both composed picker packages register their flow into it.

**The strip owns the registry.** One tab per registered Workspace in durable registry order: a left click makes that Workspace current, a right click opens the tab's menu (Close only), a drag reorders through the existing `insertBefore` Host mutation, and the trailing add control raises the same directory flow the empty state hosts. Closing removes the registration only — the directory and every Session log stay, and the same folder can be added again.

**The current Workspace is one published source.** `UiWorkspaceService` writes a `WorkspaceId | undefined` snapshot store: at each main-Session selection (the Workspace that accounts for the selected Session), when `selectWorkspace` runs, and when the registry loses the current Workspace (falling back to the first registered one). The tab strip and the sidebar read it through their injected `currentWorkspace` hook, so a Session opened from search, a row, or a tab keeps both surfaces on the same Workspace without either deriving it independently. `selectWorkspace` shows the Workspace's most recent unarchived Session, or connects a blank one when it has none.

**The sidebar is a flat list of that Workspace.** Grouping modes, path nesting, expansion state, the Ungrouped bucket, `ProjectRowItem`, the Workspace drag surface, and the Workspace delete dialog are gone; `SessionTree`/`deriveGroups`/`owningGroupKey`/`owningParentFolder`/`sessionMemberIds` are deleted with their specs. What remains is one list: the current Workspace's `sessionIds` ordered by recency or the saved manual account, pinned rows fronted, the selected blank pinned first, the same watermark with its attention raise and Show more/Show less, the same drag reorder inside that account, and the same row slots and action lists. The viewing store drops `groupBy`/`groupExpansion` and bumps its persisted name to `dsh.workspace.view.v6`; `pinOrderSource` now reconciles Workspace accounts only. Workspace rename moved to the sidebar header's own menu so the capability survives the removed group row. Search deliberately stays registry-wide: it is the only route to a Session whose Workspace tab was closed, and each result names its Workspace.

## Alternatives considered

- **Keep the inventory in the sidebar and add tabs as a second view of it.** Two surfaces listing the same Workspaces would need the same selection, ordering, and close semantics, and the sidebar's group headers already carried those controls. The tab strip replaced the inventory instead, so each Workspace fact has one home.
- **Make tabs an "open Workspaces" set, like editor tabs.** Closing a tab would then hide a Workspace that stays registered, which needs a client-persisted open set, a way to reopen from an inventory nobody renders, and a distinction between "registered" and "open" that no Host surface expresses. Tabs here are the registry, so closing is registration deletion — the operation the Host already owns.
- **Derive the current Workspace inside each surface from the main Session.** Both the strip and the sidebar would then re-implement the fallback for "no Session yet" and "the registry lost it", and an optimistic tab click would need a second source of truth. One published store owned by the navigation service keeps them from disagreeing.
- **Keep the grouping modes for a single Workspace** (sections, tree, flat) and simply filter the Workspace list. Every mode would render one section, path nesting and the Ungrouped bucket would be unreachable, and the store would persist expansion state nothing can toggle.
- **Scope search to the current Workspace too.** It would leave a closed tab's Sessions unreachable, since the sidebar no longer lists Workspaces to reopen them from.

## Consequences

- A Session outside every Workspace has no list surface. That is the price of "only the current Workspace": closing a tab hides its Sessions from the sidebar, and search is how they are reached. The package README records this as a known limitation.
- The frame now has three bands (header, columns, bottom). Anything that assumed the columns were the frame's first grid row — the resize handles, the Windows caption radius — follows the updated grid.
- The three grouping modes and their persisted expansion state have no successor; saved v5 blobs are ignored by the new store name.
- Per-registration directory-flow occupancy survives the move; the add command's availability now reads the strip's hole.
