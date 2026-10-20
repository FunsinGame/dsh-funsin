/**
 * Activity bar: the frame's leftmost column, one entry per top-level function.
 *
 * The shell owns the button chrome, the tooltip, the accessible name, the
 * active indicator, and the drag gesture; an entry contributes only its glyph
 * through `shell.activitybar.items` and its content through the
 * `shell.activity` keyed slot named by the same id. The frame's own Workspace
 * composition is the built-in entry and renders here rather than through that
 * list: the default activity then exists in every composition, and `workspace`
 * stays a reserved id no plugin can shadow. Every rail entry, including the
 * built-in one, can be dragged before or after another; the shell persists the
 * resulting order so the next launch keeps the arrangement.
 */
import { useState } from 'react'
import { IconFolderCloseRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ActivityBarProps, ActivityDropHalf } from './contract.ts'
import css from './ActivityBar.module.css'

/** Hover delay shared by every entry: long enough that crossing the rail opens nothing. */
const TOOLTIP_DELAY_MS = 500
/** Glyph edge, sized for a 40px button inside the 48px track. */
const GLYPH_SIZE = 20

/** In-flight rail drag: the entry being moved and the insertion marker currently reported. */
interface RailDrag {
  /** Entry being dragged. */
  id: string
  /** Entry the pointer targets and which half it reports. */
  over: { id: string; half: ActivityDropHalf } | null
}

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
 * @param dragging - whether this entry is the one being dragged.
 * @param marker - insertion side reported for this entry, or null when it is not a drop target.
 * @returns the base entry class plus the current drag treatments.
 */
function entryClass(active: boolean, dragging: boolean, marker: ActivityDropHalf | null): string {
  return classNames(
    css.entry,
    active && css.entryActive,
    dragging && css.entryDragging,
    marker === 'before' && css.dropBefore,
    marker === 'after' && css.dropAfter,
  )
}

/**
 * Resolve the insertion side across one entry from the pointer's vertical position.
 * @param event - drag event over the entry.
 * @returns the half above or below the entry's midpoint.
 */
function entryHalf(event: { clientY: number; currentTarget: HTMLElement }): ActivityDropHalf {
  const rect = event.currentTarget.getBoundingClientRect()
  return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
}

/**
 * Render the activity rail.
 * @param props - frame store share, entry glyph hole, bottom settings seat, injected selection and reorder faces, locale seat.
 * @returns the rail element tree.
 */
export function ActivityBar({ useStore, renderSlot, select, reorder, useActivities, t }: ActivityBarProps) {
  const activeId = useStore(state => state.activityInfo.activeId)
  const entries = useActivities(items => items)
  const [drag, setDrag] = useState<RailDrag | null>(null)

  /**
   * Apply the visible drop to the rail order without trusting the pointer to
   * still name a listed entry: the layout owner ignores an unresolvable anchor.
   */
  const commitDrag = (active: RailDrag, over: NonNullable<RailDrag['over']>): void => {
    setDrag(null)
    reorder(active.id, over.id, over.half)
  }

  return (
    <nav className={css.rail} aria-label={t('activitybar.aria')}>
      <div className={css.entries}>
        {entries.map((entry) => {
          const active = entry.id === activeId
          const dragging = drag?.id === entry.id
          const marker = drag?.over?.id === entry.id ? drag.over.half : null
          return (
            <Tooltip key={entry.id} label={entry.label} side="right" delayMs={TOOLTIP_DELAY_MS} disabled={drag !== null}>
              <button
                type="button"
                className={entryClass(active, dragging, marker)}
                aria-label={entry.label}
                aria-current={active ? 'page' : undefined}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', entry.id)
                  setDrag({ id: entry.id, over: null })
                }}
                onDragOver={(event) => {
                  if (drag === null || drag.id === entry.id) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  const over = { id: entry.id, half: entryHalf(event) }
                  if (drag.over?.id === over.id && drag.over.half === over.half) return
                  setDrag({ ...drag, over })
                }}
                onDrop={(event) => {
                  if (drag === null || drag.id === entry.id) return
                  event.preventDefault()
                  commitDrag(drag, { id: entry.id, half: entryHalf(event) })
                }}
                onDragEnd={() => {
                  if (drag !== null && drag.over !== null) commitDrag(drag, drag.over)
                  else setDrag(null)
                }}
                onClick={() => { select(entry.id) }}
              >
                <span className={css.glyph} aria-hidden="true">
                  {entry.builtIn
                    ? <IconFolderCloseRegular size={GLYPH_SIZE} />
                    : renderSlot('shell.activitybar.items', { size: GLYPH_SIZE, active }, { only: entry.id })}
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
