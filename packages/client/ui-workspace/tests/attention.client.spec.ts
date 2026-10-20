import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionStatus, SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { WorkspaceId, WorkspaceSnapshot, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { describe, expect, it } from 'vitest'
import { WorkspaceTabAttentionController } from '../src/client/attention.ts'

const sid = (id: string) => id as SessionId
const wid = (id: string) => id as WorkspaceId

const workspace = (id: string, sessionIds: readonly string[]): WorkspaceView => ({
  workspaceId: wid(id), path: `/projects/${id}`, title: id, sessionIds: sessionIds.map(sid),
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
})

const workspaceState = (
  items: readonly WorkspaceView[],
  archivedSessionIds: readonly SessionId[] = [],
): WorkspaceSnapshot => ({
  items, archivedSessionIds, pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
})

const status = (overrides: Partial<SessionStatus> = {}): SessionStatus => ({
  running: false,
  pendingInteraction: undefined,
  completionUnread: false,
  completionFailed: false,
  ...overrides,
})

const pending = (kind: string, sessionId: string): NonNullable<SessionStatus['pendingInteraction']> =>
  ({ key: `pending-${kind}`, kind, sessionId: sid(sessionId) }) as NonNullable<SessionStatus['pendingInteraction']>

function bench(items: readonly WorkspaceView[]) {
  const workspaces = createSnapshotStore<WorkspaceSnapshot>(workspaceState(items))
  const statuses = createSnapshotStore<SessionStatusSnapshot>(new Map())
  const current = createSnapshotStore<WorkspaceId | undefined>(undefined)
  const controller = new WorkspaceTabAttentionController({
    workspaces,
    sessionStatus: statuses,
    currentWorkspace: current,
  })
  const setStatuses = (...entries: readonly (readonly [string, SessionStatus])[]): void => {
    statuses.set(new Map(entries.map(([id, value]) => [sid(id), value])))
  }
  return { workspaces, statuses, current, controller, setStatuses }
}

describe('WorkspaceTabAttentionController', () => {
  it('marks a Workspace running while any of its Sessions runs, taking precedence over completions', () => {
    const b = bench([workspace('alpha', ['one', 'two']), workspace('beta', ['three'])])
    b.setStatuses(
      ['one', status({ running: true, completionUnread: true, completionFailed: true })],
      ['three', status()],
    )
    expect(b.controller.source.getSnapshot()).toEqual(new Map([['alpha', 'running']]))

    b.setStatuses(
      ['one', status({ completionUnread: true, completionFailed: true })],
      ['three', status({ running: true })],
    )
    expect(b.controller.source.getSnapshot()).toEqual(new Map([
      ['alpha', 'failed'],
      ['beta', 'running'],
    ]))
    b.controller.dispose()
  })

  it('marks a pending approval, plan review, or answer before any run activity', () => {
    const b = bench([
      workspace('alpha', ['one']), workspace('beta', ['two']), workspace('gamma', ['three']),
    ])
    b.setStatuses(
      ['one', status({ pendingInteraction: pending('approval', 'one'), running: true, completionUnread: true })],
      ['two', status({ pendingInteraction: pending('question', 'two'), running: true })],
      ['three', status({ pendingInteraction: pending('plan-review', 'three') })],
    )
    expect(b.controller.source.getSnapshot()).toEqual(new Map([
      ['alpha', 'approval'],
      ['beta', 'question'],
      ['gamma', 'plan-review'],
    ]))
    b.controller.dispose()
  })

  it('keeps a pending marker in the current Workspace', () => {
    const b = bench([workspace('alpha', ['one'])])
    b.current.set(wid('alpha'))
    b.setStatuses(['one', status({ pendingInteraction: pending('approval', 'one') })])
    expect(b.controller.source.getSnapshot().get(wid('alpha'))).toBe('approval')
    b.controller.dispose()
  })

  it('uses the highest pending interaction across Sessions and ignores unknown kinds', () => {
    const b = bench([workspace('escalating', ['one', 'two']), workspace('steady', ['three', 'four']), workspace('running', ['five'])])
    b.setStatuses(
      ['one', status({ pendingInteraction: pending('question', 'one') })],
      ['two', status({ pendingInteraction: pending('approval', 'two') })],
      ['three', status({ pendingInteraction: pending('approval', 'three') })],
      ['four', status({ pendingInteraction: pending('question', 'four') })],
      ['five', status({ pendingInteraction: pending('other', 'five'), running: true })],
    )
    expect(b.controller.source.getSnapshot()).toEqual(new Map([
      ['escalating', 'approval'],
      ['steady', 'approval'],
      ['running', 'running'],
    ]))
    b.controller.dispose()
  })

  it('marks an unread completion green or red according to its outcome', () => {
    const b = bench([workspace('alpha', ['one']), workspace('beta', ['two'])])
    b.setStatuses(
      ['one', status({ completionUnread: true })],
      ['two', status({ completionUnread: true, completionFailed: true })],
    )
    expect(b.controller.source.getSnapshot()).toEqual(new Map([
      ['alpha', 'completed'],
      ['beta', 'failed'],
    ]))
    b.controller.dispose()
  })

  it('acknowledges completions when their Workspace becomes current and when it is left', () => {
    const b = bench([workspace('alpha', ['one']), workspace('beta', ['two'])])
    b.setStatuses(
      ['one', status({ completionUnread: true })],
      ['two', status({ completionUnread: true, completionFailed: true })],
    )
    expect(b.controller.source.getSnapshot().has(wid('alpha'))).toBe(true)

    // Entering alpha clears its dot; beta keeps its own.
    b.current.set(wid('alpha'))
    expect(b.controller.source.getSnapshot().has(wid('alpha'))).toBe(false)
    expect(b.controller.source.getSnapshot().get(wid('beta'))).toBe('failed')

    // Entering beta clears beta as well.
    b.current.set(wid('beta'))
    expect(b.controller.source.getSnapshot().size).toBe(0)
    b.controller.dispose()
  })

  it('never raises a marker for a completion observed while its Workspace is current', () => {
    const b = bench([workspace('alpha', ['one']), workspace('beta', ['two'])])
    b.current.set(wid('alpha'))
    b.setStatuses(['one', status({ completionUnread: true })])
    expect(b.controller.source.getSnapshot().size).toBe(0)

    // Leaving acknowledges it, so it never reappears.
    b.current.set(wid('beta'))
    expect(b.controller.source.getSnapshot().size).toBe(0)
    b.controller.dispose()
  })

  it('raises a fresh marker when an acknowledged Session runs again', () => {
    const b = bench([workspace('alpha', ['one']), workspace('beta', ['two'])])
    b.setStatuses(['one', status({ completionUnread: true })])
    b.current.set(wid('alpha'))
    expect(b.controller.source.getSnapshot().size).toBe(0)

    // The next run clears the acknowledgement; its completion is fresh.
    b.setStatuses(['one', status({ running: true })])
    b.current.set(wid('beta'))
    b.setStatuses(['one', status({ completionUnread: true })])
    expect(b.controller.source.getSnapshot().get(wid('alpha'))).toBe('completed')
    b.controller.dispose()
  })

  it('ignores archived Sessions and publishes a stable map when nothing changed', () => {
    const b = bench([workspace('alpha', ['one'])])
    b.workspaces.set(workspaceState([workspace('alpha', ['one'])], [sid('one')]))
    b.setStatuses(['one', status({ running: true, completionUnread: true })])
    expect(b.controller.source.getSnapshot().size).toBe(0)

    const first = b.controller.source.getSnapshot()
    b.setStatuses(['one', status({ running: true, completionUnread: true })])
    expect(b.controller.source.getSnapshot()).toBe(first)
    b.controller.dispose()
  })

  it('ignores a current Workspace that is not registered', () => {
    const b = bench([workspace('alpha', ['one'])])
    b.setStatuses(['one', status({ completionUnread: true })])
    b.current.set(wid('alpha'))
    b.current.set(wid('missing'))
    expect(b.controller.source.getSnapshot().size).toBe(0)
    b.controller.dispose()
  })

  it('stops following its sources after disposal', () => {
    const b = bench([workspace('alpha', ['one'])])
    b.controller.dispose()
    b.setStatuses(['one', status({ running: true })])
    expect(b.controller.source.getSnapshot().size).toBe(0)
  })
})
