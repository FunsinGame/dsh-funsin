/**
 * Rail-order persistence and merge rules for the activity bar.
 *
 * The order of the rail is the one frame preference that survives a reload.
 * The shell stores the ids in their user-visible order and reapplies that
 * order to the live `shell.activitybar.items` ledger, which changes between
 * launches as plugins register or disappear.
 */
import type { ActivityDropHalf } from './contract.ts'

/** localStorage key of the saved rail order. */
export const ACTIVITY_ORDER_STORAGE_KEY = 'dsh.layout.activitybar.v1'

/**
 * Read the saved rail order.
 * @returns the stored ids, or an empty list when storage is absent, unreadable, or not a string array.
 */
export function readActivityOrder(): readonly string[] {
  if (typeof localStorage === 'undefined') return []
  let raw: string | null
  try { raw = localStorage.getItem(ACTIVITY_ORDER_STORAGE_KEY) }
  catch (_storageUnavailable) { return [] }
  if (raw === null) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
  } catch (_invalidJson) {
    return []
  }
}

/**
 * Persist the rail order for the next launch. A failed write leaves the current
 * session's order intact and only costs the preference on reload.
 * @param ids - user-visible rail ids in their displayed order.
 */
export function writeActivityOrder(ids: readonly string[]): void {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(ACTIVITY_ORDER_STORAGE_KEY, JSON.stringify(ids)) }
  catch (error) { console.error('Activity-bar order persistence failed:', error) }
}

/**
 * Apply a saved order to the ids the current composition offers. Saved ids
 * keep their relative order; ids the saved order does not name follow in their
 * default order, so a newly registered entry appears at the end. Unknown and
 * repeated saved ids are ignored.
 * @param defaultIds - current rail ids in registration order, including the built-in workspace.
 * @param savedIds - ids read from storage.
 * @returns the ids in their effective display order.
 */
export function resolveActivityOrder(
  defaultIds: readonly string[], savedIds: readonly string[],
): readonly string[] {
  const known = new Set(defaultIds)
  const placed = new Set<string>()
  const ordered: string[] = []
  for (const id of savedIds) {
    if (!known.has(id) || placed.has(id)) continue
    placed.add(id)
    ordered.push(id)
  }
  for (const id of defaultIds) {
    if (!placed.has(id)) ordered.push(id)
  }
  return ordered
}

/**
 * Move one rail id next to an anchor id.
 * @param ids - current display order.
 * @param id - id being dragged.
 * @param anchorId - id the drop targets.
 * @param half - whether the dragged id lands before or after the anchor.
 * @returns the new order, or undefined when an id is absent, both name the same
 *   id, or the move leaves the order unchanged.
 */
export function moveActivityOrder(
  ids: readonly string[], id: string, anchorId: string, half: ActivityDropHalf,
): readonly string[] | undefined {
  if (id === anchorId) return undefined
  if (ids.indexOf(id) === -1 || ids.indexOf(anchorId) === -1) return undefined
  const rest = ids.filter(candidate => candidate !== id)
  const insertAt = rest.indexOf(anchorId) + (half === 'after' ? 1 : 0)
  const next = [...rest.slice(0, insertAt), id, ...rest.slice(insertAt)]
  return next.every((candidate, index) => candidate === ids[index]) ? undefined : next
}
