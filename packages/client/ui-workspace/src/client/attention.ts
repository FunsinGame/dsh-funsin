/**
 * Workspace tab attention: pending user interactions, live run activity, and
 * unread completions per registered Workspace.
 *
 * A tab shows the pending interaction a Session is blocked on (a warning for
 * approval or plan review, a question mark for an answer), otherwise a
 * spinner while any of its Sessions runs, and afterwards an unread-completion
 * dot — green for a completed run, red for a failed one. Entering a Workspace
 * acknowledges its completions, and a completion observed while its Workspace
 * is current never becomes unread: the tab the user is looking at carries no
 * reminder. Pending interactions stay visible in the current Workspace
 * because they ask the user to act. Session-level `completionUnread` stays
 * with the sidebar row; this controller keeps its own acknowledgement set so
 * the two surfaces do not clear each other.
 */
import type { WorkspaceId, WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/**
 * Marker one Workspace tab carries. Pending interactions outrank run activity,
 * which outranks the completed/failed completion dot.
 */
export type WorkspaceTabAttentionState =
  | 'approval'
  | 'plan-review'
  | 'question'
  | 'running'
  | 'completed'
  | 'failed'

/** Pending-interaction markers a Workspace tab can carry. */
type PendingAttentionState = Extract<WorkspaceTabAttentionState, 'approval' | 'plan-review' | 'question'>

/** Pending-interaction markers in cross-Session precedence order. */
const PENDING_RANK: Readonly<Record<PendingAttentionState, number>> = {
  approval: 3,
  'plan-review': 2,
  question: 1,
}

/** Attention per Workspace; absent entries carry no marker. */
export type WorkspaceTabAttentionMap = ReadonlyMap<WorkspaceId, WorkspaceTabAttentionState>

/** Observable inputs the controller follows; each keeps its own identity. */
export interface WorkspaceTabAttentionSources {
  /** Registered Workspaces and their Session membership. */
  readonly workspaces: {
    getSnapshot(): WorkspaceSnapshot
    subscribe(listener: () => void): () => void
  }
  /** Unified Session UI status (pending interaction, running, unread completion, failure). */
  readonly sessionStatus: HostObservable<SessionStatusSnapshot>
  /** The published current Workspace. */
  readonly currentWorkspace: HostObservable<WorkspaceId | undefined>
}

/**
 * Map one Session's pending-interaction kind to its tab marker; kinds without
 * a dedicated marker are ignored.
 * @param kind - declaration-merged domain kind.
 * @returns the marker for a known kind, or undefined.
 */
function pendingAttention(kind: string | undefined): PendingAttentionState | undefined {
  switch (kind) {
    case 'approval':
    case 'plan-review':
    case 'question':
      return kind
    default:
      return undefined
  }
}

/**
 * Derive and publish the tab strip's per-Workspace attention.
 *
 * Acknowledgement rules:
 * - A Workspace that becomes current acknowledges the unread completions it
 *   already holds, so clicking its tab hides the dot.
 * - The Workspace being left acknowledges its completions too, so a run that
 *   finished while the user was there never raises a dot later.
 * - A new run clears its Session's acknowledgement, so a later completion
 *   raises a fresh marker.
 */
export class WorkspaceTabAttentionController {
  private readonly acknowledged = new Set<SessionId>()
  private readonly attention = createSnapshotStore<WorkspaceTabAttentionMap>(new Map())
  private readonly disposers: (() => void)[]
  private workspaces: WorkspaceSnapshot
  private statuses: SessionStatusSnapshot
  private current: WorkspaceId | undefined

  /** @param sources - observable Workspace membership, Session status, and current Workspace. */
  constructor(sources: WorkspaceTabAttentionSources) {
    this.workspaces = sources.workspaces.getSnapshot()
    this.statuses = sources.sessionStatus.getSnapshot()
    this.current = sources.currentWorkspace.getSnapshot()
    this.disposers = [
      sources.workspaces.subscribe(() => {
        this.workspaces = sources.workspaces.getSnapshot()
        this.publish()
      }),
      sources.sessionStatus.subscribe(() => {
        this.statuses = sources.sessionStatus.getSnapshot()
        this.forgetRerunAcknowledgements()
        this.publish()
      }),
      sources.currentWorkspace.subscribe(() => {
        const next = sources.currentWorkspace.getSnapshot()
        const previous = this.current
        this.current = next
        this.acknowledge(previous)
        this.acknowledge(next)
        this.publish()
      }),
    ]
    this.publish()
  }

  /** The tab strip's live attention map. */
  get source(): HostObservable<WorkspaceTabAttentionMap> {
    return this.attention
  }

  /** Release every subscription; the published map stays readable. */
  dispose(): void {
    for (const dispose of this.disposers) dispose()
  }

  /** Stop suppressing a Session's next completion once it starts running again. */
  private forgetRerunAcknowledgements(): void {
    for (const [sessionId, status] of this.statuses) {
      if (status.running === true) this.acknowledged.delete(sessionId)
    }
  }

  /** @param workspaceId - Workspace whose unread completions count as seen. */
  private acknowledge(workspaceId: WorkspaceId | undefined): void {
    if (workspaceId === undefined) return
    const workspace = this.workspaces.items.find(item => item.workspaceId === workspaceId)
    if (workspace === undefined) return
    for (const sessionId of workspace.sessionIds) {
      if (this.statuses.get(sessionId)?.completionUnread === true) this.acknowledged.add(sessionId)
    }
  }

  private publish(): void {
    const archived = new Set(this.workspaces.archivedSessionIds)
    const next = new Map<WorkspaceId, WorkspaceTabAttentionState>()
    for (const workspace of this.workspaces.items) {
      let pending: PendingAttentionState | undefined
      let running = false
      let completed = false
      let failed = false
      for (const sessionId of workspace.sessionIds) {
        if (archived.has(sessionId)) continue
        const status = this.statuses.get(sessionId)
        if (status === undefined) continue
        const request = pendingAttention(status.pendingInteraction?.kind)
        if (request !== undefined) {
          if (pending === undefined || PENDING_RANK[request] > PENDING_RANK[pending]) pending = request
          continue
        }
        if (status.running === true) {
          running = true
          continue
        }
        if (!status.completionUnread
          || this.acknowledged.has(sessionId)
          || workspace.workspaceId === this.current) continue
        if (status.completionFailed) failed = true
        else completed = true
      }
      if (pending !== undefined) next.set(workspace.workspaceId, pending)
      else if (running) next.set(workspace.workspaceId, 'running')
      else if (failed) next.set(workspace.workspaceId, 'failed')
      else if (completed) next.set(workspace.workspaceId, 'completed')
    }
    if (sameAttention(this.attention.getSnapshot(), next)) return
    this.attention.set(next)
  }
}

/** Compare two attention maps by their entries. */
function sameAttention(left: WorkspaceTabAttentionMap, right: WorkspaceTabAttentionMap): boolean {
  if (left.size !== right.size) return false
  for (const [workspaceId, state] of left) {
    if (right.get(workspaceId) !== state) return false
  }
  return true
}
