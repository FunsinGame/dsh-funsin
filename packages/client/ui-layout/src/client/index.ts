/**
 * Layout plugin, browser half: one register() call contributes AppFrame into
 * the runtime's built-in 'root' slot and, in the same breath, declares the
 * child slots (declaration = exclusive render authority), seats the
 * layout store (panel geometry and the selected activity), and wires the
 * panel-action service face. ctx.layout selects the main panel and controls
 * column geometry; Session selection belongs to the Session Controller. Two
 * further registrations occupy the frame's own chrome seats — the activity bar
 * and the status bar — and declare the holes each one hosts. A last effect
 * seats the theme presenter, which projects ctx.theme snapshots onto
 * document.body.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import type { HostObservable, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { ActivityInfo, PanelInfo } from './service.ts'
import { ActivityBar } from './ActivityBar.tsx'
import { AppFrame } from './AppFrame.tsx'
import type { ActivityBarInjected, ActivityDropHalf, ActivityEntry, ActivityItemOwnerProps } from './contract.ts'
import {
  moveActivityOrder, readActivityOrder, resolveActivityOrder, writeActivityOrder,
} from './activity-order.ts'
import { createLayoutStore, WORKSPACE_ACTIVITY } from './stores.ts'
import { StatusBar } from './StatusBar.tsx'
import { LayoutController } from './service.ts'
import type { ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import { en as shortcutEn, zh as shortcutZh } from './shortcut-locales.ts'
import { en as workbenchEn, zh as workbenchZh, type WorkbenchKey } from './locales.ts'
import { ThemePresenter } from './theme-presenter.ts'

// Contract exports only (export-convergence rule: cross-package consumers
// keep a symbol exported; test-only/package-internal symbols live off /src).
// ILayout: the ctx.layout face consumers and test fakes type against.
// OwnerShare contracts below are the render-side halves registrants compose
// against; the frame components and the store factory are package-internal.
export { LayoutController } from './service.ts'
export type { ActivityInfo, ILayout, MainPanelId, PanelInfo } from './service.ts'
export type { ActivityBarInjected, ActivityEntry, ActivityItemOwnerProps } from './contract.ts'
export type { WorkbenchKey } from './locales.ts'

/** Selector hook over root-scoped panel selection. */
export type UsePanelInfo = SnapshotSelectorHook<PanelInfo>

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The outward face only; the concrete service stays inside this plugin. */
    layout: import('./service.ts').ILayout
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Layout keyboard command labels. */
    'shortcuts.layout': keyof typeof shortcutZh
    /** Frame chrome copy: the activity bar and the status bar. */
    workbench: WorkbenchKey
  }

  interface GlobalStandardProps {
    /** Subscribe to the selected main panel independently of parent renders. */
    usePanelInfo: UsePanelInfo
  }

  interface SlotMap {
    // The 'root' entry itself is the runtime's built-in slot (declared
    // there); these are the frame's children, declared by the same
    // register() call that contributes AppFrame. Session owners never pass
    // sessionId: the framework injects it as a standard prop.
    /**
     * The whole left column. OCCUPIED by ui-sidebar's SidebarRoot, which
     * declares the workspace and settings seats inside it — registering here
     * replaces the navigation column outright rather than adding to it, and
     * the seats it declares disappear with it. To add something to the
     * sidebar, register into one of those inner seats instead.
     *
     * The occupant receives the frame's live column state (collapsed, width)
     * and is expected to render the compact control rail while collapsed.
     */
    'sidebar': { kind: 'single'; scope: 'root'; owner: SidebarOwnerProps }
    /**
     * Central panel selected by sidebar entry id. The reserved `conversation`
     * key hosts the Conversation; other keys receive no Session binding.
     */
    'main': { kind: 'keyed'; scope: 'root' }
    /**
     * The right column: a track the centre makes room for, or nothing. OCCUPIED
     * by the right Sidebar, which uses the resolved column width in normal
     * mode and covers the viewport in fullscreen, retaining the wide-screen
     * column reservation underneath.
     *
     * Whether the panel is shown, and whether it takes a track, is the
     * occupant's own recorded business — it reports the composition of its
     * expanded and presentation state through `ctx.layout`, and the frame sizes
     * the track and places the resize handle from that. The expand control is
     * not this column's: it is a button in the conversation header. The root
     * occupant decides when to render its Session-bound content.
     */
    'rightbar': { kind: 'single'; scope: 'root'; owner: RightbarOwnerProps }
    /**
     * The activity rail column left of the sidebar. The frame owns the 48px
     * track; this seat owns only its content. OCCUPIED by this package's own
     * ActivityBar entry, which declares `shell.activitybar.items`.
     */
    'shell.activitybar': { kind: 'single'; scope: 'root' }
    /**
     * Activity-bar glyphs. Each list id is both the rail entry and the
     * `shell.activity` key of that activity's content; the rail owns the button
     * (chrome, tooltip, accessible name, active indicator) and resolves the
     * label from list metadata, while the entry renders only its glyph.
     */
    'shell.activitybar.items': { kind: 'list'; scope: 'root'; owner: ActivityItemOwnerProps }
    /**
     * Content of a selected activity, keyed by the activity-bar entry id. The
     * frame renders this full area (right of the rail, between the header band
     * and the bottom panel) whenever the selected activity is not the frame's
     * built-in `workspace` composition. An entry that registers a rail item
     * without this key fails at selection rather than rendering empty.
     */
    'shell.activity': { kind: 'keyed'; scope: 'root' }
    /**
     * Frame-wide brand header above every band: the menu bar's left corner,
     * where the product mark and name live. Always mounted, whatever activity
     * is selected. OCCUPIED by ui-sidebar's frame brand.
     */
    'shell.header': { kind: 'single'; scope: 'root' }
    /**
     * The Workspace activity's tab strip: the top of that page, right of the
     * activity rail and above the sidebar. Rendered only while the built-in
     * `workspace` activity is selected, so a registered activity replaces the
     * strip along with the columns below it. OCCUPIED by ui-workspace's
     * Workspace tabs.
     */
    'shell.workspace.tabs': { kind: 'single'; scope: 'root' }
    /**
     * The activity rail's bottom seat, below the entries: the frame's own
     * settings trigger, which renders rail-style and owns the settings panel.
     * OCCUPIED by ui-settings-general's settings shell.
     */
    'shell.activitybar.settings': { kind: 'single'; scope: 'root'; owner: ActivitySettingsOwnerProps }
    /**
     * Full-width bottom content below the workbench row and above the status
     * bar. Its rendered height reduces the columns' available height; empty
     * content reserves no space. The occupant owns its height, visibility, and
     * controls. It receives no Session binding and remains mounted across
     * main-panel navigation. OCCUPIED by the optional inspector panel.
     */
    'shell.bottom': { kind: 'single'; scope: 'root' }
    /**
     * The status bar band, the frame's last row. Unlike `shell.bottom` it
     * reserves its own height even with no entries, because the strip itself is
     * the frame chrome. OCCUPIED by this package's own StatusBar entry, which
     * declares `shell.statusbar.left` and `shell.statusbar.right`.
     */
    'shell.statusbar': { kind: 'single'; scope: 'root' }
    /**
     * Status-bar items in the leading group. Each entry renders its own content
     * and keeps it current through its registration's `hooks` source — a
     * plugin-owned observable, not shared mutable bar state. The group takes the
     * remaining width and truncates before the trailing group.
     */
    'shell.statusbar.left': { kind: 'list'; scope: 'root' }
    /**
     * Status-bar items in the trailing group. This group never shrinks, so a
     * value that must stay readable survives a narrow frame.
     */
    'shell.statusbar.right': { kind: 'list'; scope: 'root' }
    /**
     * Frame-wide floating layer, above every column and outside their scroll
     * containers. Deliberately generic and unowned by any feature: a badge, a
     * toast stack or a status pill all belong here, and entries order among
     * themselves. The layer itself is click-through — entries opt back into
     * pointer events — so an occupant never blocks the app underneath.
     *
     * This is the additive seat for a frame-wide surface of your own: a fresh
     * `id` is added beside the shipped entries instead of replacing them.
     */
    'shell.overlay': { kind: 'list'; scope: 'root' }
    /**
     * Window-chrome seat at the frame's top-left, over every main panel.
     * Mounted only while the sidebar column is fully hidden (macOS desktop
     * collapse; other platforms keep the rail), so the occupant can assume the
     * frame edge is the window edge and the macOS traffic lights sit before it.
     * OCCUPIED by ui-sidebar's reopen/New Session controls.
     *
     * While the seat is mounted the frame publishes
     * `--dsh-frame-leading-clearance` (the inline inset the seat's band
     * occupies, measured from the frame's left edge); a main panel whose
     * content reaches the top-left corner pads by it so nothing lands under
     * the lights or the controls.
     */
    'shell.leading': { kind: 'single'; scope: 'root' }
  }
}

// OwnerShare contracts — the render-side share the slot owner supplies at
// renderSlot. Registrants IMPORT these and compose their full component props
// from the framework-derived shares. Conversation business state and actions arrive through
// framework-standard hooks and each registrant's inject face, not owner props.

/** Owner share of the activity rail's settings seat: the trigger's display state. */
export interface ActivitySettingsOwnerProps {
  /** False renders the compact icon trigger the rail has room for. */
  wide: boolean
}

/** Sidebar owner share: live column state from the frame's concession solve. */
export interface SidebarOwnerProps {
  /** True when the sidebar is closed (the column renders the compact control rail). */
  collapsed: boolean
  /** Rendered column width in px (SIDEBAR_COLLAPSED when collapsed). */
  width: number
}

/** Right column owner share: resolved normal geometry and opening eligibility. */
export interface RightbarOwnerProps {
  /** Resolved normal panel width in px, not the saved preference; zero if it cannot fit. */
  width: number
  /** Workbench content width in px: the frame width right of the activity rail. */
  viewportWidth: number
  /**
   * Whether a normal right panel can retain 300px beside a 400px center.
   * Before a narrow opening, includes the space from collapsing the left sidebar.
   */
  canShow: boolean
}

/** Required services (cordis fiber inject — the loader passes all module exports as an object plugin). */
export const inject = ['slots', 'theme', 'locale', 'shortcuts']

/**
 * Client plugin body: provide ctx.layout, then one register() call — AppFrame
 * into 'root' with its child-slot declarations, the layout store seat,
 * and the shared root instance supplying commands and the panel-info source.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('shortcuts.layout', { zh: shortcutZh, en: shortcutEn }), 'layout: command labels')
  ctx.effect(() => ctx.locale.register('workbench', { zh: workbenchZh, en: workbenchEn }), 'layout: workbench chrome')
  const t = ctx.locale.bind('shortcuts.layout')

  ctx.effect(() => {
    const handle = createLayoutStore()
    const instance = handle.create()
    const store: typeof handle = { ...handle, create: () => instance }
    const workbench = ctx.locale.bind('workbench')
    const retainMainPanels = (): void => {
      instance.actions.retainMainPanels(ctx.slots.entries('main').flatMap(entry =>
        entry.options.key === undefined ? [] : [entry.options.key]))
    }
    // Rail metadata projected from the entry ledger: the shell renders the
    // buttons, so it needs each entry's id and resolved label. The built-in
    // Workspace entry joins the list so the user can place it among the rest.
    let savedActivityOrder = readActivityOrder()
    const activities = createSnapshotStore<readonly ActivityEntry[]>([])
    const syncActivities = (): void => {
      const registered = ctx.slots.entriesOfSlot('shell.activitybar.items').map(({ options }) => {
        // The list registration requires an id; StoredEntry erases the slot kind.
        const id = options.id as string
        return { id, order: options.order ?? 0, label: resolveSlotLabel(options.label) ?? id }
      }).sort((a, b) => a.order - b.order)
      const byId = new Map(registered.map(entry => [entry.id, entry]))
      const defaultOrder = [WORKSPACE_ACTIVITY, ...registered.map(entry => entry.id)]
      const next: ActivityEntry[] = []
      for (const id of resolveActivityOrder(defaultOrder, savedActivityOrder)) {
        if (id === WORKSPACE_ACTIVITY) {
          next.push({ id, label: workbench('activity.workspace'), builtIn: true })
          continue
        }
        const entry = byId.get(id)
        if (entry !== undefined) next.push({ id, label: entry.label, builtIn: false })
      }
      // The frame's own composition is always selectable; a selected activity
      // whose entry left the ledger falls back to it.
      instance.actions.retainActivities(next.map(entry => entry.id))
      const previous = activities.getSnapshot()
      if (previous.length === next.length && previous.every((entry, index) => {
        const candidate = next.at(index)
        return candidate !== undefined
          && entry.id === candidate.id && entry.label === candidate.label && entry.builtIn === candidate.builtIn
      })) return
      activities.set(next)
    }
    const reorderActivity = (id: string, anchorId: string, half: ActivityDropHalf): void => {
      const current = activities.getSnapshot().map(entry => entry.id)
      const next = moveActivityOrder(current, id, anchorId, half)
      if (next === undefined) return
      savedActivityOrder = next
      writeActivityOrder(next)
      syncActivities()
    }
    const panelInfo: HostObservable<PanelInfo> = {
      getSnapshot: () => instance.getSnapshot().panelInfo,
      subscribe: listener => instance.subscribe(listener),
    }
    const activityInfo: HostObservable<ActivityInfo> = {
      getSnapshot: () => instance.getSnapshot().activityInfo,
      subscribe: listener => instance.subscribe(listener),
    }
    // A selectable activity is the frame's own composition, or a rail entry
    // whose content view is registered under the same id.
    const hasActivity = (id: string): boolean => id === WORKSPACE_ACTIVITY
      || (ctx.slots.entries('shell.activitybar.items').some(entry => entry.options.id === id)
        && ctx.slots.entriesOfSlot('shell.activity').some(entry => entry.options.key === id))
    const layout = new LayoutController(instance.actions, id =>
      ctx.slots.entries('main').some(entry => entry.options.key === id), panelInfo, hasActivity, activityInfo)
    const disposePanelInfo = ctx.slots.provideRoot({ hooks: { panelInfo: layout.panelInfo } })
    const disposeService = ctx.reflect.provide('layout', layout)
    const disposeRegistration = ctx.slots.register({
      name: 'root',
      locale: 'common',
      children: {
        'sidebar': { kind: 'single', scope: 'root' },
        'main': { kind: 'keyed', scope: 'root' },
        'rightbar': { kind: 'single', scope: 'root' },
        'shell.activitybar': { kind: 'single', scope: 'root' },
        'shell.activity': { kind: 'keyed', scope: 'root' },
        'shell.header': { kind: 'single', scope: 'root' },
        'shell.workspace.tabs': { kind: 'single', scope: 'root' },
        'shell.bottom': { kind: 'single', scope: 'root' },
        'shell.statusbar': { kind: 'single', scope: 'root' },
        'shell.overlay': { kind: 'list', scope: 'root' },
        'shell.leading': { kind: 'single', scope: 'root' },
      },
      store,
    }, AppFrame)
    // The frame's chrome seats are this package's own occupants, registered the
    // way any plugin would: the activity bar declares the glyph list and the
    // status bar declares its two groups.
    const disposeActivityBar = ctx.slots.inject('shell.activitybar', () => ctx.slots.register({
      name: 'shell.activitybar',
      locale: 'workbench',
      store,
      children: {
        'shell.activitybar.items': { kind: 'list', scope: 'root' },
        'shell.activitybar.settings': { kind: 'single', scope: 'root' },
      },
      inject: (): ActivityBarInjected => ({
        select: (id) => { layout.selectActivity(id) },
        reorder: reorderActivity,
        hooks: { activities },
      }),
    }, ActivityBar))
    const disposeStatusBar = ctx.slots.inject('shell.statusbar', () => ctx.slots.register({
      name: 'shell.statusbar',
      locale: 'workbench',
      children: {
        'shell.statusbar.left': { kind: 'list', scope: 'root' },
        'shell.statusbar.right': { kind: 'list', scope: 'root' },
      },
    }, StatusBar))
    const disposeActivityEntries = ctx.slots.subscribe('shell.activitybar.items', syncActivities)
    const disposeActivityLabels = ctx.locale.subscribe(syncActivities)
    syncActivities()
    const disposeShortcut = ctx.shortcuts.register({
      id: 'sidebar.left.toggle' as ShortcutCommandId, label: () => t('toggle'), aliases: ['sidebar', 'toggle left sidebar'],
      defaults: {
        'desktop:macos': { code: 'KeyB', modifiers: ['primary'] },
        'desktop:windows': { code: 'KeyB', modifiers: ['primary'] },
        'desktop:linux': { code: 'KeyB', modifiers: ['primary'] },
        'web:macos': { code: 'KeyB', modifiers: ['primary', 'alt'] },
        'web:windows': { code: 'KeyB', modifiers: ['primary', 'alt'] },
      },
      regions: ['page', 'editable'], modals: [],
      resolve: () => ({ status: 'handled', run: () => { layout.toggleSidebar() } }),
    })
    const disposePanels = ctx.slots.subscribe('main', retainMainPanels)
    retainMainPanels()
    return () => {
      disposeShortcut()
      layout.dispose()
      disposePanels()
      disposeActivityLabels()
      disposeActivityEntries()
      disposeStatusBar()
      disposeActivityBar()
      disposeRegistration()
      disposePanelInfo()
      // provide()'s disposer settles asynchronously; teardown is synchronous fire-and-forget.
      void disposeService()
    }
  }, 'ui-layout: service + root registration')

  // Theme presentation: pure DOM writes from resolved snapshots — initial
  // state through the getter once, then event-driven only; no React path.
  ctx.effect(() => {
    const presenter = new ThemePresenter()
    presenter.apply(ctx.theme.getTheme())
    const off = ctx.on('theme/change', (snapshot) => { presenter.apply(snapshot) })
    return () => {
      off()
      presenter.dispose()
    }
  }, 'ui-layout: theme presenter')
}
