# Agent Note: Activity bar and status bar

Status: implemented

English | [中文](2026-10-19-activity-bar-and-status-bar.zh.md)

## Problem

The frame exposed exactly one navigation surface — the sidebar's global-panel icon list — and no place for a top-level function switcher or for persistent values a plugin wants to keep on screen. The Workbench shape the product is moving to (VSCode as the reference) needs a rail of function entries left of the sidebar and a status strip at the window's bottom edge, and both must be additive: a plugin adds an entry or a value without replacing the shell.

## Decision

**The frame is five bands by four columns.** `ui-layout`'s `AppFrame` grid becomes `brand header | workspace tabs | workbench | shell.bottom | statusbar` rows and `activityrail(48px) | sidebar | center | rightbar` columns, with every region placed explicitly instead of by implicit flow. The brand header spans the whole width outside every activity; the Workspace tab strip occupies the band right of the rail and only while the Workspace activity is selected; the rail spans the strip's row and the workbench row, so it runs from below the brand band to the columns' bottom. The activity rail and the status bar are the frame's own occupants, registered the way a plugin registers: `shell.activitybar` (single) hosts `ActivityBar`, which declares `shell.activitybar.items` (list) and the bottom `shell.activitybar.settings` seat; `shell.statusbar` (single) hosts `StatusBar`, which declares `shell.statusbar.left` and `shell.statusbar.right` (list). Both are `ui-layout` registrations sharing the frame's one store instance.

**An activity is a glyph plus a view with one shared id.** A list entry renders only its glyph, receives `{ size, active }`, and the shell owns the button, tooltip, accessible name (`aria-current="page"`), and selected marker; the entry's label comes from its registration `label`. Its content is a `shell.activity` keyed cell under the same id, rendered in a single area spanning the columns whenever the selected activity is not the built-in `workspace`. `workspace` is reserved: the frame renders its own three-column composition for it, so the default activity exists in every composition and no entry can shadow it. Selecting an entry with no `shell.activity` view throws and keeps the current selection (the `selectPanel` policy); withdrawing the selected entry falls back to `workspace` through the same subscription that projects the rail metadata. `ctx.layout.selectActivity(id)` and `ctx.layout.activityInfo` are the programmatic face of that selection: the shipped Plugins page is the first activity, so `pluginNavigation.openBundle` selects it from anywhere, and the page resets its own view when the published id leaves it.

**A status value is a plugin-owned observable.** The bar holds no item state: each entry renders its own content and receives live data through its registration's `hooks` compartment, so a plugin updates its value by publishing to its own source. The leading group takes the remaining width and truncates first; the trailing group never shrinks.

**The rail order is user-owned and persists.** Every rail entry, including the built-in `workspace` entry, is draggable; a drop moves it before or after another entry. The shell persists the resulting complete id order under `dsh.layout.activitybar.v1` in `localStorage` and merges it with the live ledger when it projects the rail: saved ids keep their relative order, newly registered entries append in registration order, and ids whose entry left the ledger are ignored. The rest of the layout store stays transient.

**`viewportWidth` prices content, not the window.** The frame measures its own box and stores `width - 48`, so the column solve, the sidebar breakpoint, the right-column owner share, and the drag-handle offsets all measure the space right of the rail. The Windows fullscreen-panel variable follows the same shift (`rail + sidebar`).

## Alternatives considered

- **Put the status bar in `shell.bottom`.** That slot is occupied by the optional inspector panel and documented as reserving no space while empty; sharing it would have made the two seats shadow each other at the same `single` priority and changed the inspector's lifetime contract. A separate row keeps both truthful.
- **Nest the workbench grid inside the frame.** Extracting the three columns into an inner grid would have rewritten the drag handles, the caption radius, and the fullscreen geometry rules for one new column. Placing the activity area at `grid-column: 2 / -1` in the existing grid reaches the same result by zeroing the column tracks while an activity is selected.
- **A shared mutable status registry (`ctx.layout.setStatusItem(...)`).** It creates a second source of truth next to the plugin's own state and forces the bar to diff writes. Entry-declared observables already re-render only the entry that changed.
- **Make the built-in Workspace an ordinary rail entry.** The frame would need the entry's id to dispatch its own composition, so the id would be an implicit cross-package contract; rendering the built-in entry in the frame keeps `workspace` structurally reserved.
- **Persist the whole layout store.** The store also carries panel geometry and the selected activity, whose transient contract predates this feature; persisting its whole value would turn every measurement into a durable preference. Only the rail order is saved.

## Consequences

- The frame has four bands; anything asserting frame geometry (the `layout-bottom` browser scenario, the frame spec's track parser) follows the new rows and the rail prefix.
- The activity rail is a fixed 48px track that never yields, and the selected activity is transient like the rest of the layout store: reload returns to `workspace`. The rail order is the one persisted layout preference.
- macOS `shell.leading` and the Windows caption keep their existing insets because the rail occupies the workbench row only; the rail starts below the header band.
- `ui-layout` now depends on `ui-primitives` for the rail glyph and tooltip; the package is still a leaf (no feature-package value imports).
- Verification: the activity and status specs drive a real store and stubbed glyphs, the apply spec covers selection validation, order persistence across a relaunch, and the fallback, and `layout-bottom.e2e.ts` records the geometry of both new bands.
