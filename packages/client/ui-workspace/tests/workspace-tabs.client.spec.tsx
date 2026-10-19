// @vitest-environment jsdom
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react'
import { allowAllAccess, bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { WorkspaceId, WorkspaceSnapshot, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { DirectoryFlowOwnerProps, WorkspaceTabsProps } from '../src/client/contract/slots.ts'
import { createWorkspaceShortcutControls } from '../src/client/shortcuts.ts'
import { WorkspaceTabs } from '../src/client/tabs/WorkspaceTabs.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)
beforeEach(() => { localStorage.clear() })

const t: WorkspaceTabsProps['t'] = makeTranslate(zh, commonZh)
const wid = (id: string) => id as WorkspaceId

// The frame-wide seat still requires the global standard props the renderer
// supplies in production.
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })

function hook<T>(snapshot: T) {
  return function select<S>(selector: (state: T) => S): S { return selector(snapshot) }
}

const workspace = (id: string, path = `/projects/${id}`, title = id): WorkspaceView => ({
  workspaceId: wid(id), path, title, sessionIds: [],
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
})

const workspaceState = (items: readonly WorkspaceView[]): WorkspaceSnapshot => ({
  items, archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
})

/** jsdom lacks DragEvent — the fireEvent fallback drops clientX, so pin it on the built event. */
function fireDrag(tab: HTMLElement, kind: 'dragOver' | 'drop', clientX: number): void {
  const event = kind === 'dragOver' ? createEvent.dragOver(tab) : createEvent.drop(tab)
  Object.defineProperty(event, 'clientX', { value: clientX })
  Object.defineProperty(event, 'dataTransfer', { value: { effectAllowed: '', dropEffect: '' } })
  fireEvent(tab, event)
}

function skipDragData(): Pick<DataTransfer, 'effectAllowed' | 'dropEffect' | 'setData'> {
  return { effectAllowed: 'uninitialized', dropEffect: 'none', setData: vi.fn() }
}

/** Give one tab a horizontal box so a drop can resolve its half without layout. */
function placeTab(tab: HTMLElement, left: number): void {
  tab.getBoundingClientRect = () => ({
    left, right: left + 100, top: 0, bottom: 26, width: 100, height: 26, x: left, y: 0, toJSON: () => ({}),
  })
}

const renderSlotStub: WorkspaceTabsProps['renderSlot'] = (name: string, owner: object) =>
  name === 'shell.header.directoryFlow' && (owner as DirectoryFlowOwnerProps).open
    ? <div data-testid="directory-flow" />
    : null

function mount(overrides: Partial<WorkspaceTabsProps> = {}) {
  const controls = createWorkspaceShortcutControls()
  const props: WorkspaceTabsProps = {
    useWorkspaces: hook(workspaceState([])),
    useCurrentWorkspace: hook<WorkspaceId | undefined>(undefined),
    useWorkspaceShortcuts: bindSnapshotSelector(controls.state),
    useDirectoryFlow: bindSnapshotSelector({ getSnapshot: () => true, subscribe: () => () => {} }),
    useSessions: hook({ ids: [], byId: {}, phase: 'ready', projectionsBySession: {} }),
    useSessionStatus: hook(new Map()),
    useSessionRetainInfo: () => undefined,
    usePanelInfo, useResource,
    ...allowAllAccess,
    selectWorkspace: vi.fn(),
    reorderWorkspace: vi.fn(async () => {}),
    closeWorkspace: vi.fn(async () => {}),
    createWorkspace: vi.fn(async () => workspace('created')),
    requestAddWorkspace: controls.add,
    closeAddWorkspace: controls.closeAdd,
    setDirectoryBusy: controls.directoryBusy,
    canOpenWorkspaceFolder: vi.fn(async () => false),
    openWorkspaceFolder: vi.fn(async () => {}),
    notify: vi.fn(),
    renderSlot: renderSlotStub,
    t,
    ...overrides,
  }
  const view = render(<WorkspaceTabs {...props} />)
  return { view, props, controls }
}

describe('WorkspaceTabs', () => {
  it('renders one tab per Workspace with the current one selected', () => {
    mount({
      useWorkspaces: hook(workspaceState([workspace('alpha'), workspace('beta', '/projects/beta', 'Beta')])),
      useCurrentWorkspace: hook<WorkspaceId | undefined>(wid('beta')),
    })
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map(tab => tab.textContent)).toEqual(['alpha', 'Beta'])
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('false')
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tablist').getAttribute('aria-label')).toBe('工作区页签')
  })

  it('selects a Workspace on click and leaves the current one alone', () => {
    const selectWorkspace = vi.fn()
    mount({
      useWorkspaces: hook(workspaceState([workspace('alpha'), workspace('beta')])),
      useCurrentWorkspace: hook<WorkspaceId | undefined>(wid('alpha')),
      selectWorkspace,
    })
    fireEvent.click(screen.getAllByRole('tab')[0]!)
    expect(selectWorkspace).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('tab')[1]!)
    expect(selectWorkspace).toHaveBeenCalledWith('beta')
  })

  it('closes a Workspace from its context menu', async () => {
    const closeWorkspace = vi.fn(async () => {})
    mount({
      useWorkspaces: hook(workspaceState([workspace('alpha'), workspace('beta')])),
      closeWorkspace,
    })
    fireEvent.contextMenu(screen.getAllByRole('tab')[1]!)
    fireEvent.click(await screen.findByRole('menuitem', { name: '关闭工作区' }))
    expect(closeWorkspace).toHaveBeenCalledWith('beta')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('reports a rejected close without failing the gesture', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const closeWorkspace = vi.fn(async () => { throw new Error('host refused') })
    mount({
      useWorkspaces: hook(workspaceState([workspace('alpha')])),
      closeWorkspace,
    })
    fireEvent.contextMenu(screen.getAllByRole('tab')[0]!)
    fireEvent.click(await screen.findByRole('menuitem', { name: '关闭工作区' }))
    await vi.waitFor(() => { expect(warn).toHaveBeenCalled() })
    warn.mockRestore()
  })

  it('opens the Workspace directory from the tab menu where the Host has a file manager', async () => {
    const openWorkspaceFolder = vi.fn(async () => {})
    mount({
      useWorkspaces: hook(workspaceState([workspace('alpha'), workspace('beta', '/projects/beta')])),
      canOpenWorkspaceFolder: vi.fn(async () => true),
      openWorkspaceFolder,
    })
    fireEvent.contextMenu(screen.getAllByRole('tab')[1]!)
    fireEvent.click(await screen.findByRole('menuitem', { name: '打开资源管理器' }))
    expect(openWorkspaceFolder).toHaveBeenCalledWith('/projects/beta')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('keeps the file-manager row out of the menu on a Host without a desktop', async () => {
    const canOpenWorkspaceFolder = vi.fn(async () => false)
    mount({
      useWorkspaces: hook(workspaceState([workspace('alpha')])),
      canOpenWorkspaceFolder,
    })
    fireEvent.contextMenu(screen.getAllByRole('tab')[0]!)
    await screen.findByRole('menuitem', { name: '关闭工作区' })
    await vi.waitFor(() => { expect(canOpenWorkspaceFolder).toHaveBeenCalled() })
    expect(screen.queryByRole('menuitem', { name: '打开资源管理器' })).toBeNull()
  })

  it('keeps the file-manager row hidden when the availability probe fails', async () => {
    mount({
      useWorkspaces: hook(workspaceState([workspace('alpha')])),
      canOpenWorkspaceFolder: vi.fn(async () => { throw new Error('host unreachable') }),
    })
    fireEvent.contextMenu(screen.getAllByRole('tab')[0]!)
    await screen.findByRole('menuitem', { name: '关闭工作区' })
    expect(screen.queryByRole('menuitem', { name: '打开资源管理器' })).toBeNull()
  })

  it('reports a refused file-manager gesture through the notice channel', async () => {
    const notify = vi.fn()
    mount({
      useWorkspaces: hook(workspaceState([workspace('alpha')])),
      canOpenWorkspaceFolder: vi.fn(async () => true),
      openWorkspaceFolder: vi.fn(async () => { throw new Error('gateway/internal: path open failed') }),
      notify,
    })
    fireEvent.contextMenu(screen.getAllByRole('tab')[0]!)
    fireEvent.click(await screen.findByRole('menuitem', { name: '打开资源管理器' }))
    await vi.waitFor(() => {
      expect(notify).toHaveBeenCalledWith({
        kind: 'openFolderFailed',
        message: 'gateway/internal: path open failed',
      })
    })
  })

  it('reorders a tab dropped before or after another, and appends past the last tab', async () => {
    const reorderWorkspace = vi.fn(async () => {})
    mount({
      useWorkspaces: hook(workspaceState([workspace('alpha'), workspace('beta'), workspace('gamma')])),
      reorderWorkspace,
    })
    const [alpha, beta, gamma] = screen.getAllByRole('tab') as [HTMLElement, HTMLElement, HTMLElement]
    placeTab(beta, 100)
    // Gamma dropped on the leading half of beta lands between alpha and beta.
    fireEvent.dragStart(gamma, { dataTransfer: skipDragData() })
    fireDrag(beta, 'drop', 110)
    expect(reorderWorkspace).toHaveBeenCalledWith('gamma', 'beta')

    // Alpha dragged past the final tab appends.
    placeTab(gamma, 300)
    fireEvent.dragStart(alpha, { dataTransfer: skipDragData() })
    fireDrag(gamma, 'drop', 390)
    await vi.waitFor(() => { expect(reorderWorkspace).toHaveBeenLastCalledWith('alpha', undefined) })
  })

  it('ignores a drop that would not move the tab and a tab dropped on itself', () => {
    const reorderWorkspace = vi.fn(async () => {})
    mount({
      useWorkspaces: hook(workspaceState([workspace('alpha'), workspace('beta')])),
      reorderWorkspace,
    })
    const [alpha, beta] = screen.getAllByRole('tab') as [HTMLElement, HTMLElement]
    placeTab(beta, 100)
    // Alpha dropped on beta's leading half is where it already is.
    fireEvent.dragStart(alpha, { dataTransfer: skipDragData() })
    fireDrag(beta, 'drop', 110)
    expect(reorderWorkspace).not.toHaveBeenCalled()

    // A tab dragged over itself reports no marker at all.
    fireEvent.dragStart(beta, { dataTransfer: skipDragData() })
    fireDrag(beta, 'dragOver', 190)
    fireEvent.drop(beta, { dataTransfer: skipDragData() })
    expect(reorderWorkspace).not.toHaveBeenCalled()
  })

  it('commits the last marker reported by drag end when no drop lands', async () => {
    const reorderWorkspace = vi.fn(async () => {})
    mount({
      useWorkspaces: hook(workspaceState([workspace('alpha'), workspace('beta'), workspace('gamma')])),
      reorderWorkspace,
    })
    const [alpha, beta] = screen.getAllByRole('tab') as [HTMLElement, HTMLElement]
    placeTab(beta, 100)
    fireEvent.dragStart(alpha, { dataTransfer: skipDragData() })
    fireDrag(beta, 'dragOver', 190)
    fireEvent.dragEnd(alpha, { dataTransfer: skipDragData() })
    // Beta's trailing half resolves to the tab that follows it (gamma) as anchor.
    await vi.waitFor(() => { expect(reorderWorkspace).toHaveBeenCalledWith('alpha', 'gamma') })
  })

  it('raises the directory flow from the trailing add control and adopts the Workspace it returns', async () => {
    const selectWorkspace = vi.fn()
    mount({
      useWorkspaces: hook(workspaceState([workspace('alpha')])),
      createWorkspace: vi.fn(async () => workspace('picked')),
      selectWorkspace,
      renderSlot: renderSlotStub,
    })
    fireEvent.click(screen.getByRole('button', { name: '添加工作区' }))
    expect(await screen.findByTestId('directory-flow')).toBeTruthy()
  })

  it('adopts a picked directory and selects the Workspace it created', async () => {
    const selectWorkspace = vi.fn()
    const createWorkspace = vi.fn(async () => workspace('picked'))
    const pickStub: WorkspaceTabsProps['renderSlot'] = (name: string, owner: object) => {
      const flow = owner as DirectoryFlowOwnerProps
      return name === 'shell.header.directoryFlow' && flow.open
        ? <button type="button" onClick={() => { flow.onPicked('/projects/picked') }}>pick</button>
        : null
    }
    mount({
      useWorkspaces: hook(workspaceState([workspace('alpha')])),
      createWorkspace,
      selectWorkspace,
      renderSlot: pickStub,
    })
    fireEvent.click(screen.getByRole('button', { name: '添加工作区' }))
    fireEvent.click(await screen.findByRole('button', { name: 'pick' }))
    await vi.waitFor(() => { expect(selectWorkspace).toHaveBeenCalledWith('picked') })
    expect(createWorkspace).toHaveBeenCalledWith({ path: '/projects/picked' })
  })

  it('renders no flow marker while the directory hole is empty', () => {
    mount({
      useWorkspaces: hook(workspaceState([workspace('alpha')])),
      useDirectoryFlow: bindSnapshotSelector({ getSnapshot: () => false, subscribe: () => () => {} }),
    })
    fireEvent.click(screen.getByRole('button', { name: '添加工作区' }))
    expect(screen.queryByTestId('directory-flow')).toBeNull()
  })
})
