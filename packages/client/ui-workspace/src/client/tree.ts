/**
 * Derives the Session list and search projections for the current Workspace
 * from caller-projected Workspace membership and Session order.
 */
import {
  type SessionListState, type SessionSearchResultItem, type SessionSummary,
} from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {
  SessionStatusSnapshot,
} from '@deepseek-ai/dsh-client-ui-session-status/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { TextSearchIndex, type SearchKeys } from '@deepseek-ai/dsh-util-text-search'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import { workspaceTitleOf } from '@deepseek-ai/dsh-util-workspace-path'

/** Pending interaction kinds with dedicated Workspace-row presentation. */
export type SessionPendingInteractionStatus = 'approval' | 'plan-review' | 'question'
type SessionStatuses = SessionStatusSnapshot

function mainSessionId(list: SessionListState): SessionId | undefined {
  return Object.values(list.byId)
    .find(session => (session.retainedBy.mainView ?? 0) > 0)?.id
}

/**
 * Resolve the Workspace's one New Session row: the selected blank while it
 * belongs to the list, otherwise the first blank member in Session-list order.
 * Remaining blanks are legacy duplicates and stay hidden.
 * @param list - Session metadata authority.
 * @param sessionIds - Workspace membership, including hidden members.
 * @param current - selected main Session, or undefined.
 * @param archivedSessionIds - registry-global archive set.
 * @returns the blank Session the list shows and the New Session action reuses.
 */
export function newSessionId(
  list: SessionListState,
  sessionIds: readonly SessionId[],
  current: SessionId | undefined,
  archivedSessionIds: readonly SessionId[],
): SessionId | undefined {
  const members = new Set(sessionIds)
  const archived = new Set(archivedSessionIds)
  const eligible = (id: SessionId): boolean =>
    members.has(id) && !archived.has(id) && list.byId[id]?.blank === true
  if (current !== undefined && eligible(current)) return current
  return list.ids.find(eligible)
}

/** One session row in the current Workspace's list or in search results. */
export interface SessionNode {
  id: SessionId
  /** Stored title, or empty; the renderer localizes blank and unnamed row labels. */
  title: string
  /** The Workspace's provisional New Session (renderer shows its localized title). */
  blank: boolean
  /** A Session-scoped UI consumer is awaiting this user. */
  pendingInteraction?: SessionPendingInteractionStatus
  running: boolean
  /** Running direct children in the loaded subagent catalog. */
  runningSubagentCount: number
  /** Host-confirmed unread completion or explicit unread mark. */
  completed: boolean
  /** Latest unread completion ended with an execution error. */
  failed: boolean
  /** In the registry-global pin set: leads its section, reorderable only among pinned rows. */
  pinned: boolean
  /** In the registry-global archive set: shown grayed in place and not openable. */
  archived: boolean
  updatedAt: number
  /** Session working directory; absent when the Host reports none or an empty path. */
  cwd?: string
}

/** Session order selected by the Workspace browser. */
export type SessionOrderBy = 'manual' | 'updated'

/** One flat search row combining list metadata with an optional content match. */
export interface SearchResultNode {
  id: SessionId
  title: string
  workspace: string
  /** A Session-scoped UI consumer is awaiting this user. */
  pendingInteraction?: SessionPendingInteractionStatus
  running: boolean
  /** Running direct children in the loaded subagent catalog. */
  runningSubagentCount: number
  /** Host-confirmed unread completion or explicit unread mark. */
  completed: boolean
  /** Latest unread completion ended with an execution error. */
  failed: boolean
  /** In the registry-global archive set: shown grayed and not openable. */
  archived: boolean
  snippet?: string
}

/** Bounded merged search projection plus the refine-query hint bit. */
export interface SearchResultSet {
  items: readonly SearchResultNode[]
  hasMore: boolean
}

/**
 * Directory display label: basename of the path (both separators accepted);
 * the fallback for a Session no Workspace accounts for.
 * @param cwd - directory path, or undefined when the Session recorded none.
 * @returns basename, the raw cwd when it has no basename, or an empty marker.
 */
export function workspaceLabel(cwd: string | undefined): string {
  if (cwd === undefined || cwd === '') return ''
  const base = workspaceTitleOf(cwd)
  return base !== '' ? base : cwd
}

/**
 * Project known account members by current Session recency.
 * @param sessionIds - authoritative account membership.
 * @param summaries - current Session summaries; members without a summary are omitted until it arrives.
 * @returns known members newest first, with Session identity as the deterministic tie-break.
 */
export function orderByRecency(
  sessionIds: readonly SessionId[],
  summaries: SessionListState['byId'],
): SessionId[] {
  return sessionIds.flatMap((id) => {
    const summary = summaries[id]
    if (summary === undefined) return []
    return [{ id, rank: summary.updatedAt }]
  })
    .sort((a, b) => {
      if (a.rank !== b.rank) return b.rank - a.rank
      return a.id < b.id ? -1 : 1
    })
    .map(member => member.id)
}

/**
 * Reconcile a browser-local manual order with current account membership.
 * Saved entries retain their relative order; new ordinary members follow them by recency.
 * @param memberIds - authoritative account membership.
 * @param savedOrder - previously saved browser-local order.
 * @param summaries - current Session metadata; unknown new members wait for their summaries.
 * @param rowState - global pin and archive membership; only account members can supplement the order.
 * @returns saved relative positions plus missing members ordered by pin, recency, and archive status.
 */
export function reconcileManualOrder(
  memberIds: readonly SessionId[],
  savedOrder: readonly string[] | undefined,
  summaries: SessionListState['byId'],
  rowState?: Pick<SessionRowState, 'pinnedSessionIds' | 'archivedSessionIds'>,
): SessionId[] {
  const members = new Map(memberIds.map(id => [id as string, id]))
  const included = new Set<string>()
  const ordered: SessionId[] = []
  for (const key of savedOrder ?? []) {
    const id = members.get(key)
    if (id === undefined || included.has(key)) continue
    ordered.push(id)
    included.add(key)
  }
  const archived = new Set(rowState?.archivedSessionIds)
  const pins: SessionId[] = []
  for (const sessionId of rowState?.pinnedSessionIds ?? []) {
    const id = members.get(sessionId)
    if (id === undefined || included.has(id) || archived.has(id) || summaries[id] === undefined) continue
    pins.push(id)
    included.add(id)
  }
  const ordinary: SessionId[] = []
  const archives: SessionId[] = []
  for (const id of orderByRecency([...members.values()].filter(id => !included.has(id)), summaries)) {
    if (archived.has(id)) archives.push(id)
    else ordinary.push(id)
  }
  return [...pins, ...ordered, ...ordinary, ...archives]
}

/**
 * Keep the provisional New Session ahead of either base order.
 * @param order - recency or reconciled manual order.
 * @param newSession - blank Session this account shows, when present.
 * @returns a copy with the New Session first and no duplicate slot.
 */
export function pinNewSession(
  order: readonly SessionId[],
  newSession: SessionId | undefined,
): SessionId[] {
  if (newSession === undefined) return [...order]
  return [newSession, ...order.filter(id => id !== newSession)]
}

/**
 * Archived-row visibility choice: the default hides archived rows, `show`
 * mixes them into their kept slots, and `only` restricts the view (and
 * search) to archived rows.
 */
export type ArchivedFilter = 'default' | 'show' | 'only'

/**
 * Ordinary sessions are visible; among blank sessions, only the Workspace's
 * one New Session is visible. Subagent children use their parent header
 * catalog; archived sessions follow the archived filter, while their
 * accounting slots remain either way so unarchiving restores position.
 */
function sessionVisible(
  session: SessionSummary,
  newSession: SessionId | undefined,
  archived: ReadonlySet<SessionId>,
  archivedFilter: ArchivedFilter,
): boolean {
  if (session.origin === 'subagent') return false
  if (session.blank && session.id !== newSession) return false
  switch (archivedFilter) {
    case 'default':
      return !archived.has(session.id)
    case 'show':
      return true
    case 'only':
      return archived.has(session.id)
    /* v8 ignore next 2 -- closed-union backstop; only reached if the filter is forged */
    default:
      return assertNever(archivedFilter)
  }
}

/** Registry-global row state consumed by every tree derivation. */
export interface SessionRowState {
  /** Registry-global pin ids; pinned rows lead their section in the local order. */
  pinnedSessionIds: readonly SessionId[]
  /** Archive set; members keep their slots and show grayed while visible. */
  archivedSessionIds: readonly SessionId[]
  /** Archived-row visibility choice applied to lists and search alike. */
  archivedFilter: ArchivedFilter
}

/**
 * Keep the visible New Session placeholder first, then partition pinned and
 * ordinary rows without changing either partition's caller order.
 */
function sectionMembers(
  members: readonly SessionSummary[],
  pinned: ReadonlySet<SessionId>,
  archived: ReadonlySet<SessionId>,
): SessionSummary[] {
  const placeholders: SessionSummary[] = []
  const leading: SessionSummary[] = []
  const rest: SessionSummary[] = []
  for (const member of members) {
    if (member.blank) placeholders.push(member)
    else if (!archived.has(member.id) && pinned.has(member.id)) leading.push(member)
    else rest.push(member)
  }
  return [...placeholders, ...leading, ...rest]
}

/**
 * A blank session is the selected Workspace's provisional New Session row;
 * its canonical title never enters search (blank rows are query-excluded)
 * and the renderer localizes its display label. Unnamed history also yields an
 * empty title for localization and does not match a directory-name title search.
 */
function sessionTitle(session: SessionSummary): string {
  return session.blank ? '' : (session.title?.trim() ?? '')
}

/** Keep navigation presentation independent from domain-owned interaction objects. */
function visiblePendingKind(kind: string | undefined): SessionPendingInteractionStatus | undefined {
  switch (kind) {
    case 'approval':
    case 'plan-review':
    case 'question':
      return kind
    default:
      return undefined
  }
}

function runningChildCount(list: SessionListState, parentId: SessionId, statuses: SessionStatuses): number {
  return list.projectionsBySession[parentId]?.values.subagentCatalog?.reduce(
    (count, child) => count + ((statuses.get(child.id)?.running ?? list.byId[child.id]?.running) === true ? 1 : 0),
    0,
  ) ?? 0
}

function sessionNode(
  s: SessionSummary,
  list: SessionListState,
  statuses: SessionStatuses,
  pinned: ReadonlySet<SessionId>,
  archived: ReadonlySet<SessionId>,
): SessionNode {
  const status = statuses.get(s.id)
  const pendingInteraction = visiblePendingKind(status?.pendingInteraction?.kind)
  return {
    id: s.id,
    title: sessionTitle(s),
    blank: s.blank,
    running: status?.running ?? s.running,
    runningSubagentCount: runningChildCount(list, s.id, statuses),
    completed: status?.completionUnread === true,
    failed: status?.completionFailed === true,
    pinned: !archived.has(s.id) && pinned.has(s.id),
    archived: archived.has(s.id),
    updatedAt: s.updatedAt,
    ...(s.cwd === undefined || s.cwd === '' ? {} : { cwd: s.cwd }),
    ...(pendingInteraction === undefined ? {} : { pendingInteraction }),
  }
}

/**
 * Derive flat rows from the browser's complete ordered Session ids, with
 * pinned rows fronted ahead of the supplied order.
 * @param list - sessions list snapshot used to select the ids.
 * @param sessionIds - complete account members in the selected order, including hidden archives.
 * @param rowState - registry-global pin and archive sets plus the archived filter.
 * @param statuses - unified UI status by Session.
 * @returns flat rows in sectioned order with current status indicators.
 */
export function deriveFlat(
  list: SessionListState,
  sessionIds: readonly SessionId[],
  rowState: SessionRowState,
  statuses: SessionStatuses,
): SessionNode[] {
  const archived = new Set(rowState.archivedSessionIds)
  const pinned = new Set(rowState.pinnedSessionIds)
  const newSession = newSessionId(list, sessionIds, mainSessionId(list), rowState.archivedSessionIds)
  const members = sessionIds.flatMap((id) => {
    const session = list.byId[id]
    return session !== undefined && sessionVisible(session, newSession, archived, rowState.archivedFilter)
      ? [session]
      : []
  })
  return sectionMembers(members, pinned, archived)
    .map(session => sessionNode(session, list, statuses, pinned, archived))
}

/** Display label of each Session's Workspace: its first Workspace's title, else its cwd label. */
function workspaceLabels(workspaces: readonly WorkspaceView[]): (summary: SessionSummary) => string {
  const workspaceBySession = new Map<SessionId, string>()
  for (const workspace of workspaces) {
    for (const sessionId of workspace.sessionIds) {
      if (!workspaceBySession.has(sessionId)) workspaceBySession.set(sessionId, workspace.title)
    }
  }
  return summary => workspaceBySession.get(summary.id) ?? workspaceLabel(summary.cwd)
}

/**
 * Search index over the Sessions sidebar search can show, newest first: title
 * and Workspace match fuzzily, the Session id as a substring. Blank placeholders
 * are left out because their canonical title displays localized.
 * @param list - session metadata authority.
 * @param workspaces - Workspace membership and display labels.
 * @param archivedSessionIds - registry-global archive set (members match per the archived filter).
 * @param archivedFilter - archived-row visibility choice; search follows it.
 * @param previous - the index of an earlier list; its prepared titles, labels, and ids are reused.
 * @returns the index {@link deriveSearchResults} searches.
 */
export function sessionSearchIndex(
  list: SessionListState,
  workspaces: readonly WorkspaceView[],
  archivedSessionIds: readonly SessionId[],
  archivedFilter: ArchivedFilter,
  previous?: TextSearchIndex<SessionSummary>,
): TextSearchIndex<SessionSummary> {
  const archived = new Set(archivedSessionIds)
  const current = mainSessionId(list)
  const labelOf = workspaceLabels(workspaces)
  const visible = list.ids.filter((id) => {
    const summary = list.byId[id]
    return summary !== undefined && !summary.blank && sessionVisible(summary, current, archived, archivedFilter)
  })
  const sessions = orderByRecency(visible, list.byId).map(id => list.byId[id] as SessionSummary)
  const keys = (summary: SessionSummary): SearchKeys => ({ fuzzy: [sessionTitle(summary), labelOf(summary)], substring: [summary.id] })
  return previous === undefined ? new TextSearchIndex(sessions, keys) : previous.update(sessions, keys)
}

/**
 * Merge immediate title/Workspace/Session id fuzzy matches with ranked Host content
 * matches. Local rows lead best match first, newest first among equal matches;
 * content-only rows retain backend order, and duplicate sessions receive the
 * backend snippet in place.
 * @param list - session metadata authority.
 * @param workspaces - Workspace membership and display labels.
 * @param query - caller text; surrounding whitespace is ignored.
 * @param archivedSessionIds - registry-global archive set (members match per the archived filter).
 * @param archivedFilter - archived-row visibility choice; search follows it.
 * @param statuses - unified UI status by Session.
 * @param content - ranked Host content-search page.
 * @param limit - protocol-owned maximum merged row count.
 * @param index - {@link sessionSearchIndex} of the same list, Workspaces, and archive choice.
 * @returns bounded deduplicated flat rows and a refine-query hint bit.
 */
export function deriveSearchResults(
  list: SessionListState,
  workspaces: readonly WorkspaceView[],
  query: string,
  archivedSessionIds: readonly SessionId[],
  archivedFilter: ArchivedFilter,
  statuses: SessionStatuses,
  content: { items: readonly SessionSearchResultItem[]; hasMore: boolean },
  limit: number,
  index: TextSearchIndex<SessionSummary>,
): SearchResultSet {
  if (query.trim() === '') return { items: [], hasMore: false }
  const archived = new Set(archivedSessionIds)
  const current = mainSessionId(list)
  const labelOf = workspaceLabels(workspaces)
  const contentBySession = new Map<SessionId, SessionSearchResultItem>()
  for (const item of content.items) {
    if (!contentBySession.has(item.sessionId)) contentBySession.set(item.sessionId, item)
  }

  const orderedLocal = index.search(query)

  const ordered: SessionSummary[] = []
  const included = new Set<SessionId>()
  const include = (summary: SessionSummary): void => {
    if (included.has(summary.id)) return
    included.add(summary.id)
    ordered.push(summary)
  }
  for (const summary of orderedLocal) include(summary)
  for (const item of content.items) {
    const summary = list.byId[item.sessionId]
    if (summary !== undefined && !summary.blank && sessionVisible(summary, current, archived, archivedFilter)) include(summary)
  }

  return {
    items: ordered.slice(0, limit).map((summary) => {
      const match = contentBySession.get(summary.id)
      const status = statuses.get(summary.id)
      const pendingInteraction = visiblePendingKind(status?.pendingInteraction?.kind)
      return {
        id: summary.id,
        title: sessionTitle(summary),
        workspace: labelOf(summary),
        running: status?.running ?? summary.running,
        runningSubagentCount: runningChildCount(list, summary.id, statuses),
        ...(pendingInteraction === undefined
          ? {}
          : { pendingInteraction }),
        completed: status?.completionUnread === true,
        failed: status?.completionFailed === true,
        archived: archived.has(summary.id),
        ...match === undefined ? {} : { snippet: match.snippet },
      }
    }),
    hasMore: content.hasMore || ordered.length > limit,
  }
}
