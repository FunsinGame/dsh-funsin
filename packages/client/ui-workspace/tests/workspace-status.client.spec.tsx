// @vitest-environment jsdom
/** Status entry: the current Workspace's name, live from the navigation source. */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import type { WorkspaceId, WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { DEFAULT_WORKSPACE_DIRECTORY } from '@deepseek-ai/dsh-api-workspace-controller/default-workspace'
import { WorkspaceStatusItem } from '../src/client/status/WorkspaceStatusItem.tsx'
import type { WorkspaceStatusItemProps } from '../src/client/status/WorkspaceStatusItem.tsx'

afterEach(() => { cleanup() })

function snapshot(items: readonly { workspaceId: string; title: string }[]): WorkspaceSnapshot {
  return {
    items, archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  } as unknown as WorkspaceSnapshot
}

function mount(items: readonly { workspaceId: string; title: string }[], current: string | undefined) {
  const list = createSnapshotStore<WorkspaceSnapshot>(snapshot(items))
  const currentStore = createSnapshotStore<WorkspaceId | undefined>(current as WorkspaceId | undefined)
  const props = (): WorkspaceStatusItemProps => ({
    useWorkspaces: bindSnapshotSelector(list),
    useCurrentWorkspace: bindSnapshotSelector(currentStore),
    t: key => key === 'workspace.defaultName' ? 'Home' : key,
  }) as WorkspaceStatusItemProps
  const utils = render(<WorkspaceStatusItem {...props()} />)
  return { ...utils, list, currentStore }
}

describe('WorkspaceStatusItem', () => {
  it('shows the current Workspace name and follows the published source', () => {
    const { container, list, currentStore } = mount([
      { workspaceId: 'a', title: 'Alpha' },
      { workspaceId: 'b', title: 'Beta' },
    ], 'a')
    const status = (): HTMLElement | null => container.querySelector('[data-workspace-status]')
    expect(status()?.textContent).toBe('Alpha')
    act(() => { currentStore.set('b' as WorkspaceId) })
    expect(status()?.textContent).toBe('Beta')
    // A renamed Workspace reaches the entry through the list source.
    act(() => { list.set(snapshot([{ workspaceId: 'a', title: 'Alpha' }, { workspaceId: 'b', title: 'Renamed' }])) })
    expect(status()?.textContent).toBe('Renamed')
  })

  it('localizes the default Workspace directory', () => {
    const { container } = mount([{ workspaceId: 'a', title: DEFAULT_WORKSPACE_DIRECTORY }], 'a')
    expect(container.querySelector('[data-workspace-status]')?.textContent).toBe('Home')
  })

  it('renders nothing without a current Workspace or when that id is unlisted', () => {
    const noCurrent = mount([{ workspaceId: 'a', title: 'Alpha' }], undefined)
    expect(noCurrent.container.querySelector('[data-workspace-status]')).toBeNull()
    cleanup()
    const unlisted = mount([{ workspaceId: 'a', title: 'Alpha' }], 'z')
    expect(unlisted.container.querySelector('[data-workspace-status]')).toBeNull()
  })
})
