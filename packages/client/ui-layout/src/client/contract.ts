/**
 * Frame contracts beyond the layout service: the owner shares and
 * registrant-private faces of the two chrome seats this package occupies —
 * the activity bar (`shell.activitybar`) and the status bar (`shell.statusbar`)
 * — plus the props their components compose.
 */
import type {
  HostObservable, InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { createLayoutStore } from './stores.ts'

/** Which side of the anchor entry a dragged rail item lands on. */
export type ActivityDropHalf = 'before' | 'after'

/**
 * One activity-bar entry, projected from the `shell.activitybar.items` ledger
 * so the shell can own the button (chrome, tooltip, accessible name, active
 * indicator) while the entry owns only its glyph. The built-in Workspace entry
 * belongs to the same list so it can take a user-chosen position, but it draws
 * the frame's glyph instead of a registered one.
 */
export interface ActivityEntry {
  /** List id the entry registered under; also the `shell.activity` key of its content. */
  id: string
  /** Accessible name and tooltip: the resolved label, or the id when it omits one. */
  label: string
  /** True only for the built-in `workspace` entry. */
  builtIn: boolean
}

/** Glyph share supplied by one activity-bar row. */
export interface ActivityItemOwnerProps {
  /** Requested glyph square edge in pixels. */
  size: number
  /** Whether this entry is the selected activity. */
  active: boolean
}

/**
 * Registrant-private face of the activity bar (arrives through the register
 * inject factory). Selection goes through `ctx.layout.selectActivity`, which
 * validates the rail entry and its `shell.activity` view before it moves, so a
 * misregistered activity fails at the click instead of rendering an empty
 * content area.
 */
export type ActivityBarInjected = {
  /**
   * Select a registered activity.
   * @param id - the `workspace` activity, or a registered `shell.activity` key.
   * @throws when no rail entry and content view are registered for the id.
   */
  select: (id: string) => void
  /**
   * Move a rail entry next to an anchor entry and persist the resulting order.
   * @param id - id being dragged.
   * @param anchorId - entry the pointer targets.
   * @param half - whether the dragged entry lands before or after the anchor.
   */
  reorder: (id: string, anchorId: string, half: ActivityDropHalf) => void
  /** Private reactive source bound to the framework selector hook. */
  hooks: { activities: HostObservable<readonly ActivityEntry[]> }
}

/** Full activity-bar props: frame store + entry glyph hole + the bottom settings seat + injected face + locale seat. */
export type ActivityBarProps =
  & PropsRuntime<'shell.activitybar'>
  & PropsRenderSlots<'shell.activitybar.items' | 'shell.activitybar.settings'>
  & PropsStore<ReturnType<typeof createLayoutStore>>
  & InjectFace<ActivityBarInjected>
  & PropsLocale<'workbench'>

/** Full status-bar props: the two item lists + locale seat. */
export type StatusBarProps =
  & PropsRuntime<'shell.statusbar'>
  & PropsRenderSlots<'shell.statusbar.left' | 'shell.statusbar.right'>
  & PropsLocale<'workbench'>
