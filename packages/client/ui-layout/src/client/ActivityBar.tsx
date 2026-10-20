/**
 * Activity bar: the frame's leftmost column, one entry per top-level function.
 *
 * The shell owns the button chrome, the tooltip, the accessible name, and the
 * active indicator; an entry contributes only its glyph through
 * `shell.activitybar.items` and its content through the `shell.activity` keyed
 * slot named by the same id. The frame's own Workspace composition is the
 * built-in entry and renders here rather than through that list: the default
 * activity then exists in every composition, and `workspace` stays a reserved
 * id no plugin can shadow.
 */
import { IconFolderCloseRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ActivityBarProps } from './contract.ts'
import { WORKSPACE_ACTIVITY } from './stores.ts'
import css from './ActivityBar.module.css'

/** Hover delay shared by every entry: long enough that crossing the rail opens nothing. */
const TOOLTIP_DELAY_MS = 500
/** Glyph edge, sized for a 40px button inside the 48px track. */
const GLYPH_SIZE = 20

/**
 * Join the class names that are present, dropping the absent ones.
 * @param names - class names, with `false`/`undefined` marking a skipped entry.
 * @returns the space-separated class list.
 */
function classNames(...names: (string | false | undefined)[]): string {
  return names.filter(Boolean).join(' ')
}

/**
 * Compose the entry button class list.
 * @param active - whether this entry is the selected activity.
 * @returns the base entry class plus the selected treatment when active.
 */
function entryClass(active: boolean): string {
  return classNames(css.entry, active && css.entryActive)
}

/**
 * Render the activity rail.
 * @param props - frame store share, entry glyph hole, bottom settings seat, injected selection face, locale seat.
 * @returns the rail element tree.
 */
export function ActivityBar({ useStore, renderSlot, select, useActivities, t }: ActivityBarProps) {
  const activeId = useStore(state => state.activityInfo.activeId)
  const entries = useActivities(items => items)
  const workspaceLabel = t('activity.workspace')
  const workspaceActive = activeId === WORKSPACE_ACTIVITY
  return (
    <nav className={css.rail} aria-label={t('activitybar.aria')}>
      <div className={css.entries}>
        <Tooltip label={workspaceLabel} side="right" delayMs={TOOLTIP_DELAY_MS}>
          <button
            type="button"
            className={entryClass(workspaceActive)}
            aria-label={workspaceLabel}
            aria-current={workspaceActive ? 'page' : undefined}
            onClick={() => { select(WORKSPACE_ACTIVITY) }}
          >
            <span className={css.glyph} aria-hidden="true">
              <IconFolderCloseRegular size={GLYPH_SIZE} />
            </span>
          </button>
        </Tooltip>
        {entries.map((entry) => {
          const active = entry.id === activeId
          return (
            <Tooltip key={entry.id} label={entry.label} side="right" delayMs={TOOLTIP_DELAY_MS}>
              <button
                type="button"
                className={entryClass(active)}
                aria-label={entry.label}
                aria-current={active ? 'page' : undefined}
                onClick={() => { select(entry.id) }}
              >
                <span className={css.glyph} aria-hidden="true">
                  {renderSlot('shell.activitybar.items', { size: GLYPH_SIZE, active }, { only: entry.id })}
                </span>
              </button>
            </Tooltip>
          )
        })}
      </div>
      {/* The rail's foot: the settings trigger (which stacks the account
          launcher above it), pinned below the scrolling entries. */}
      <div className={css.footer} data-activitybar-footer>
        {renderSlot('shell.activitybar.settings', { wide: false })}
      </div>
    </nav>
  )
}
