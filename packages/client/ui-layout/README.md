---
description: "Shell layout for the Web GUI: the three-column AppFrame whose right column is a track for an edge-anchored panel, the panel-geometry service, and theme presentation; for users and maintainers of the window chrome."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-layout

English | [中文](README.zh.md)

## Summary

This package provides the Web GUI's three-column AppFrame, edge-column widths, and `ctx.layout` presentation control. The right column concedes space before the center; its occupant renders fullscreen while the frame retains the wide-screen track underneath. The theme presenter owns color scheme, alias tokens, font sizes, font lists, and document metadata. Panel geometry and the selected activity reset on reload; the activity-rail order persists.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Desktop Mod+B toggles the left sidebar through the same layout action used by its controls. The shortcut command is unavailable behind modal dialogs and yields to terminal input.

The root slot composes a five-band workbench: the brand header, the Workspace tab strip, the workbench row, the bottom panel, and the status bar. The workbench row is the 48px activity rail followed by the sidebar, main content, and right column; the rail spans the tab strip's band too, so it runs from below the brand header to the columns' bottom. The sidebar spans 264–420px, defaults to 280px, and retains a 56px rail when collapsed; below 1024px of content width it collapses automatically, and opening the right panel collapses a manually expanded sidebar. The right panel first opens at 45% of the viewport, then retains the user's pixel preference, capped at 70%. To protect 400px for the center, the frame first reduces the right panel to 300px, then reports insufficient room so its occupant closes it, and only then compresses the center further. Dragging has no transition delay; the right handle is absent while closed or fullscreen.

Global panels occupy the root-scoped `main` keyed slot; `conversation` is the reserved key for the Conversation. `ctx.layout.selectPanel(id)` selects a registered panel, and `null` selects the Conversation without changing the current Session. The shipped global panels (Schedules today) keep the sidebar's panel list; the Plugins page moved out of it into the activity bar.

The single root-scoped `shell.header` slot spans the full width above every other band: the frame's brand header, occupied by ui-sidebar's `FrameBrand`, which keeps the product mark and name mounted whatever activity the rail selects. On the Windows desktop the brand rides the window caption's own line instead, one line with the native menus, and this band collapses to no height. Its occupant controls its own height; empty content reserves no space.

The single root-scoped `shell.workspace.tabs` slot is the top of the Workspace activity's page: right of the activity rail and above the sidebar, where ui-workspace's Workspace tab strip lives. The frame renders it only while the built-in `workspace` activity is selected, so a registered activity replaces the strip along with the columns below it.

### Activity bar

The activity rail is the frame's first column: the single root-scoped `shell.activitybar` seat, occupied by this package's own activity bar, which declares `shell.activitybar.items`. Each list entry draws only its glyph; the shell owns the button, the tooltip, the accessible name, and the selected-entry marker, and resolves the label from the entry's registration metadata. An activity therefore contributes one glyph and one content view, both addressed by the same id:

```ts ignore-check
ctx.slots.inject('shell.activitybar.items', () => ctx.slots.register({
  name: 'shell.activitybar.items', id: 'plugins', order: 200, label: () => t('plugins'),
}, PluginGlyph))

ctx.slots.inject('shell.activity', () => ctx.slots.register({
  name: 'shell.activity', key: 'plugins',
}, PluginActivity))
```

The rail's foot hosts the single root-scoped `shell.activitybar.settings` seat: ui-settings-general's settings shell occupies it in compact form and stacks the account launcher above the settings trigger, so both controls live at the rail's bottom instead of the sidebar foot.

The built-in `workspace` entry is the frame's own composition — the sidebar, main content, and right column — and is not a list entry, so no plugin can shadow it. The selected activity's `shell.activity` view fills the area right of the rail in place of all three columns. Selecting an entry that registers no view throws and keeps the current selection; withdrawing the selected entry falls back to `workspace`. `ctx.layout.selectActivity(id)` makes the same selection programmatically — the plugin manager uses it to open a bundle's details from anywhere — and `ctx.layout.activityInfo` publishes the current id for a surface that must react to leaving its activity. The rail reserves its 48px track whether or not the list is empty, and `layoutInfo.viewportWidth` — also the right column owner's `viewportWidth` — is the width right of that track, not the window width.

Every rail entry, including the built-in `workspace` entry, can be dragged above or below another entry. The shell stores the resulting id order in `localStorage` (`dsh.layout.activitybar.v1`) and reapplies it when the rail is projected; entries the saved order does not name follow in registration order, and ids whose entry left the ledger are ignored. The selected activity and the rest of the layout state stay transient.

The shipped Plugins page is the first activity: its entry draws the plugin glyph and its `shell.activity` view is the management page, so selecting it replaces the Workbench columns with the page.

The single root-scoped `shell.bottom` slot spans the full width below the workbench row and above the status bar. Its occupant controls its own height and visibility; the columns shrink by that height, and empty content reserves no space. Main-panel navigation preserves the bottom component. Column resize handles stop above it, while `shell.overlay` covers the whole frame. The default composition leaves this slot empty.

### Status bar

The status bar is the frame's last band: the single root-scoped `shell.statusbar` seat, occupied by this package's own bar. Unlike `shell.bottom` it reserves its height (22px) even with no entries, because the strip itself is the chrome. It declares two list slots, `shell.statusbar.left` and `shell.statusbar.right`: the leading group takes the remaining width and truncates first, while the trailing group never shrinks.

An entry renders its own content and keeps it current through its registration's observable source:

```ts ignore-check
ctx.slots.inject('shell.statusbar.left', () => ctx.slots.register({
  name: 'shell.statusbar.left', id: 'build', order: 100, locale: 'myPlugin',
  inject: () => ({ hooks: { build: buildState } }),
}, BuildStatus))
```

The bound `useBuild` re-renders the entry whenever `buildState` publishes, so an entry updates without any call into the bar; the bar holds no item state of its own.

<a id="window-chrome-seat"></a>
### Window-chrome seat

On macOS desktop (`html[data-platform='darwin']`, set only by the desktop preload) a collapsed sidebar hides its column entirely instead of keeping the rail, and the frame mounts the single root-scoped `shell.leading` seat at its top-left — beside the hiddenInset traffic lights, over every main panel; ui-sidebar occupies it with the reopen and New Session controls. While the seat is mounted the frame publishes `--dsh-frame-leading-clearance`, the inline band the window chrome occupies measured from the frame's left edge; a main panel whose content reaches the top-left corner pads by it so nothing lands under the lights or the controls. The frame also always publishes `--dsh-frame-top-clearance` (48px) on the root element, the constant step below the window's top strip; entry pages in the main panel (plugin manager and similar, not the conversation) pad their top by it. The frame declares no darwin drag of its own: every chrome row marks itself `data-window-drag`, ui-web base.css turns that mark into the one darwin drag rule, and the row's own box is therefore the window's draggable geometry — a row's blank runs drag while its controls stay clickable. The frame's remaining drag rule is the Windows caption row, which belongs to that platform.

Windows Electron's `data-windows-titlebar` marker reserves the caption height above all columns and removes the collapsed sidebar rail. Only the content area's top-left corner has a 16px radius; the other corners and the internal divider remain square. The frame publishes `--dsh-windows-content-radius` and `--dsh-windows-sidebar-width` for ui-sidebar-right's fullscreen corner and sidebar clearance. Ordinary Web documents do not receive the marker; macOS retains its separate layout.

The root publishes `--dsh-frame-top-clearance` for the reserved strip (48px on macOS, the caption height on Windows), and `--dsh-frame-overlay-top` adds 20px for dialogs and menus. Native fullscreen reduces the overlay inset to 20px; dialogs retain their own 24px minimum. `--dsh-frame-chrome-top` excludes the Windows caption from modal mask painting and becomes zero in fullscreen. The full-viewport modal layer still blocks background clicks. Plain browser documents publish none of these values.

### Theme presentation

The presenter consumes resolved theme snapshots and projects them onto the document: `html { color-scheme }` for native UA chrome, `body[data-ds-dark-theme]` from the active color scheme, the theme's alias tokens, `--dsh-content-font-size`, `--dsh-code-font-size`, `--dsh-terminal-font-size`, and each non-empty `--dsh-font-family-<role>` list as inline variables on body, and one owned `<meta name="theme-color">` whose content follows the computed body background. Disposing the presenter removes its metadata node with its other global writes.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`selectPanel(id)` checks the live `main` registry before changing selection; an absent key throws and leaves the current panel intact. `beginNavigation()` returns an abort signal for an asynchronous UI navigation. A later call, a valid panel selection (including repeated selection), or layout disposal aborts that signal without cancelling underlying Session creation. Consumers check the signal before committing navigation or moving drafts.

One registration declares the frame slots and binds `ctx.layout` methods `selectPanel`, `selectActivity`, `toggleSidebar`, `openRightbar(track, fullscreen)`, and `closeRightbar`. Two further registrations occupy the frame's own chrome seats: the activity bar declares `shell.activitybar.items`, and the status bar declares `shell.statusbar.left` and `shell.statusbar.right`. All three share one root store, which separates `panelInfo` selection, `activityInfo` selection, and `layoutInfo` measurements, width preferences, and presentation reports. The visible rail list merges the saved rail order with the `shell.activitybar.items` ledger into a snapshot store (id, resolved label, built-in marker), refreshed on registration, reorder, and locale changes; saved ids keep their relative order, unlisted entries follow in registration order, and a selection whose entry leaves the ledger falls back to `workspace`. `ctx.layout.panelInfo` and the standard `usePanelInfo` hook share the same selection source; AppFrame subscribes to the stable layout object. The `rightbar` owner supplies actual `width`, `viewportWidth`, and normal-presentation eligibility `canShow`; insufficient room causes a deterministic close, never automatic reopening on widening. Fullscreen hides the width handle without releasing a track the occupant retains. AppFrame keeps the column containers mounted. The right column's root controller renders `rightbar.session` through `SessionProvider` only while the Conversation is selected; its unmount report releases the track. The independent title component uses the selected Session title only while the Conversation is visible, with the build-configured product title or localized `common.brand.localBuild` as its fallback; locale revisions update that fallback. The theme presenter is a second effect: pure DOM writes from resolved snapshots — initial state through the getter once, then event-driven only, with no React path. It applies palette, font-size, font-list, and token variables before measuring the rendered background as the single color authority. Fullscreen presentation suppresses grid and handle transitions; its occupant reports the new columns only after covering the frame. Fullscreen exit keeps transitions suppressed while the frame installs its destination geometry: close removes the right track, and restore retains it. Subsequent normal geometry actions restore ordinary transitions.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the layout surface is not enough. They move from the frame to the columns it renders and the theme it presents.

- [ui-sidebar](../ui-sidebar/README.md) — occupies the `sidebar` column and its seats.
- [ui-conversation](../ui-conversation/README.md) — occupies the `main` key `conversation`.
- [ui-sidebar-right](../ui-sidebar-right/README.md) — occupies the `rightbar` column with one docking surface per session.
- [ui-theme](../ui-theme/README.md) — the theme seam whose resolved snapshots the presenter consumes.
- [Web client architecture](../../../docs/subsystems/web-client.md) — how browser plugin rows load and register slots.

-----

<a id="model-experience"></a>
## Model Experience

None, as the layout shell manages browser viewing state; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define the current layout behavior. They are current package constraints, not a general window-manager comparison or a task backlog.

- **Panel geometry is transient** — reload restores the sidebar default and the right panel hidden; each dragged width is one frame-wide preference, not a per-Session fact. The activity-rail order is the one persisted layout preference.
- **The selected activity is transient too** — reload returns to the built-in `workspace` activity, and a status-bar entry holds no value of its own: it renders whatever its registration's observable publishes.
- **Extremely narrow windows** — after the right panel closes, the center may still fall below 400px; the left 56px rail remains, and the 48px activity rail never yields.
- **The activity rail is a fixed 48px track** — it reserves that width even with no registered entries, and a plugin cannot widen or hide it.
- **Window-chrome geometry does not move for the rail** — the rail occupies the workbench row only, so the macOS `shell.leading` seat and the Windows caption keep their existing inset while the activity rail starts below the header band.
- **Track and panel travel on one shared curve only while animating** — during a discrete open/close the frame sets `data-animating` and its track transition and the occupant's slide read the same duration and easing variables; an occupant that used its own would detach the panel's edge from the conversation's while squeezing. Drags and instant presentation switches run transition-free, so the curve does not cover them.
- **No scroll anchoring during squeeze reflow** — layout changes may move the reader's viewport.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
