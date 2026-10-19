// @vitest-environment jsdom
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { allowAllAccess, bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type {
  WorkspaceId, WorkspaceSnapshot, WorkspaceView,
} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { DirectoryFlowOwnerProps, WorkspaceBrowserProps } from '../src/client/contract/slots.ts'
import { createWorkspaceShortcutControls } from '../src/client/shortcuts.ts'
import { createWorkspaceViewStore } from '../src/client/stores.ts'
import { WorkspaceBrowser } from '../src/client/rows/WorkspaceBrowser.tsx'
import { zh } from '../src/client/locales.ts'

// Every fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })

afterEach(cleanup)
const scrollIntoView = vi.fn()
beforeEach(() => {
  localStorage.clear()
  Element.prototype.scrollIntoView = scrollIntoView
  scrollIntoView.mockClear()
})

// The seat's key domain is workspace ∪ common; the stub mirrors the real
// lookup chain (namespace, then common vocabulary, then the key).
const t: WorkspaceBrowserProps['t'] = makeTranslate(zh, commonZh)

const sid = (id: string) => id as SessionId
const wid = (id: string) => id as WorkspaceId
const summary = (id: string, updatedAt: number, overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  id: sid(id), title: overrides.displayTitle ?? id, displayTitle: id, running: false, blank: false, updatedAt, ...overrides,
  retainedBy: overrides.retainedBy ?? {},
})
const sessionState = (
  items: readonly SessionSummary[],
  overrides: Partial<SessionListState> & { main?: SessionId } = {},
): SessionListState => {
  const { main, ...stateOverrides } = overrides
  const state: SessionListState = {
    ids: items.map(item => item.id),
    byId: Object.fromEntries(items.map(item => [item.id, item])),
    phase: 'ready',
    projectionsBySession: {},
    ...stateOverrides,
  }
  if (main === undefined) return state
  const row = state.byId[main]
  if (row === undefined) return state
  return {
    ...state,
    byId: { ...state.byId, [main]: { ...row, retainedBy: { ...row.retainedBy, mainView: 1 } } },
  }
}
const workspace = (id: string, sessionIds: string[], title = id): WorkspaceView => ({
  workspaceId: wid(id), path: `/projects/${id}`, title,
  sessionIds: sessionIds.map(sid), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
})
const workspaceState = (
  items: readonly WorkspaceView[],
  archivedSessionIds: readonly SessionId[] = [],
  pinnedSessionIds: readonly SessionId[] = [],
): WorkspaceSnapshot => ({
  items,
  archivedSessionIds,
  pinnedSessionIds,
  state: 'idle',
  phase: 'ready',
  error: null,
})
const noPendingInteraction: SessionStatusSnapshot = new Map()

/** Selector hook over one fixed snapshot. */
function hook<T>(snapshot: T) {
  return function select<S>(selector: (state: T) => S): S { return selector(snapshot) }
}

/** jsdom lacks DragEvent — the fireEvent fallback drops clientY, so pin it on the built event. */
function fireDrag(row: HTMLElement, kind: 'dragOver' | 'drop', clientY: number): void {
  const event = kind === 'dragOver' ? createEvent.dragOver(row) : createEvent.drop(row)
  Object.defineProperty(event, 'clientY', { value: clientY })
  Object.defineProperty(event, 'dataTransfer', { value: { effectAllowed: '', dropEffect: '' } })
  fireEvent(row, event)
}

function dragData(): Pick<DataTransfer, 'effectAllowed' | 'dropEffect' | 'setData'> {
  return { effectAllowed: 'uninitialized', dropEffect: 'none', setData: vi.fn() }
}

/** Row bounding box so a drop can resolve its half without layout. */
function placeRow(row: HTMLElement, top: number): void {
  row.getBoundingClientRect = () => ({
    top, bottom: top + 34, left: 0, right: 200, width: 200, height: 34, x: 0, y: top, toJSON: () => ({}),
  })
}

const renderSlotStub: WorkspaceBrowserProps['renderSlot'] = (name: string, owner: object) =>
  name === 'shell.header.directoryFlow' && (owner as DirectoryFlowOwnerProps).open
    ? <div data-testid="directory-flow" />
    : null

/** The Session rows currently rendered, in order. */
function rowTexts(): (string | null)[] {
  return screen.queryAllByRole('treeitem').map(row => row.textContent)
}

function mount(overrides: Partial<WorkspaceBrowserProps> = {}) {
  const controls = createWorkspaceShortcutControls()
  const store = createWorkspaceViewStore().create()
  const props: WorkspaceBrowserProps = {
    useShortcuts: select => select([]),
    useWorkspaceShortcuts: bindSnapshotSelector(controls.state),
    useCurrentWorkspace: hook(wid('alpha')),
    requestSearch: controls.search,
    requestSessionRename: controls.rename,
    wide: true,
    expandSidebar: vi.fn(),
    useSessions: hook(sessionState([])),
    useSessionStatus: hook(noPendingInteraction),
    useSessionRetainInfo: () => undefined,
    usePanelInfo, useResource,
    useWorkspaces: hook(workspaceState([])),
    ...allowAllAccess,
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    open: vi.fn(),
    searchSessions: vi.fn(async () => ({ items: [], hasMore: false })),
    searchResultLimit: 20,
    notifyArchivedNotOpenable: vi.fn(),
    renameWorkspace: vi.fn(async () => {}),
    unarchiveSession: vi.fn(async () => {}),
    renderSlot: renderSlotStub,
    t,
    ...overrides,
  }
  const view = render(<WorkspaceBrowser {...props} />)
  return { view, props, store, controls }
}

/** Re-render with (possibly) changed props — WorkspaceBrowser has no side channel. */
function rerender(b: ReturnType<typeof mount>, overrides: Partial<WorkspaceBrowserProps>) {
  Object.assign(b.props, overrides)
  b.view.rerender(<WorkspaceBrowser {...b.props} />)
}

/** Mount one Workspace holding `items`, with `alpha` current. */
function mountWorkspace(
  items: readonly SessionSummary[],
  options: {
    archived?: readonly SessionId[]
    pinned?: readonly SessionId[]
    main?: SessionId
    title?: string
    overrides?: Partial<WorkspaceBrowserProps>
  } = {},
) {
  const { archived = [], pinned = [], main, title = 'alpha', overrides = {} } = options
  const sessions = sessionState(items, main === undefined ? {} : { main })
  return mount({
    useSessions: hook(sessions),
    useWorkspaces: hook(workspaceState(
      [workspace('alpha', items.map(item => item.id), title)],
      archived,
      pinned,
    )),
    ...overrides,
  })
}

describe('WorkspaceBrowser', () => {
  it('lists only the current Workspace and names it in the section header', () => {
    const b = mount({
      useCurrentWorkspace: hook(wid('beta')),
      useSessions: hook(sessionState([summary('alpha-s', 2), summary('beta-s', 1)])),
      useWorkspaces: hook(workspaceState([
        workspace('alpha', ['alpha-s']),
        workspace('beta', ['beta-s'], 'Beta project'),
      ])),
    })
    expect(screen.getByText('Beta project')).toBeTruthy()
    expect(screen.getByText('beta-s')).toBeTruthy()
    expect(screen.queryByText('alpha-s')).toBeNull()
    expect(b.store.getSnapshot().orderBy).toBe('updated')
  })

  it('orders the list by recency and keeps a saved manual order', async () => {
    const items = [summary('older', 1), summary('newer', 2)]
    const b = mountWorkspace(items)
    await waitFor(() => {
      expect(rowTexts()[0]).toContain('newer')
      expect(rowTexts()[1]).toContain('older')
    })

    b.store.actions.setSessionOrder('alpha', ['older', 'newer'], { alpha: ['older', 'newer'] })
    await waitFor(() => {
      expect(b.store.getSnapshot().orderBy).toBe('manual')
      expect(rowTexts()[0]).toContain('older')
      expect(rowTexts()[1]).toContain('newer')
    })
  })

  it('leads the list with the selected blank Session', () => {
    const blank = summary('blank', 5, { blank: true })
    mountWorkspace([summary('one', 4), blank], { main: blank.id })
    expect(rowTexts()[0]).toContain('新会话')
    expect(rowTexts()[1]).toContain('one')
  })

  it('shows five rows and reveals the rest on Show more, then folds them back', () => {
    const items = Array.from({ length: 8 }, (_, index) => summary(`session-${index + 1}`, 8 - index))
    mountWorkspace(items)
    expect(screen.getByText('session-5')).toBeTruthy()
    expect(screen.queryByText('session-6')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '展开其余 3 个会话' }))
    expect(screen.getByText('session-8')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '收起' }))
    expect(screen.queryByText('session-6')).toBeNull()
  })

  it('raises the watermark to the current Session', () => {
    const items = Array.from({ length: 8 }, (_, index) => summary(`session-${index + 1}`, 8 - index))
    mountWorkspace(items, { main: sid('session-7') })
    expect(screen.getByText('session-7')).toBeTruthy()
    expect(screen.queryByText('session-8')).toBeNull()
  })

  it('hides archived rows, shows them on request, and narrows to them', () => {
    const items = [summary('kept', 2), summary('stored', 1)]
    const b = mountWorkspace(items, { archived: [sid('stored')] })
    expect(screen.getByText('kept')).toBeTruthy()
    expect(screen.queryByText('stored')).toBeNull()

    const pick = (name: string) => {
      fireEvent.click(screen.getByRole('button', { name: '视图选项' }))
      fireEvent.click(screen.getByRole('menuitem', { name }))
    }
    pick('全部对话（显示已归档）')
    expect(b.store.getSnapshot().archivedFilter).toBe('show')
    expect(screen.getByText('stored')).toBeTruthy()

    pick('仅显示已归档')
    expect(b.store.getSnapshot().archivedFilter).toBe('only')
    expect(screen.queryByText('kept')).toBeNull()
    expect(screen.getByText('stored')).toBeTruthy()

    pick('隐藏已归档')
    expect(b.store.getSnapshot().archivedFilter).toBe('default')
    expect(screen.getByText('kept')).toBeTruthy()
    expect(screen.queryByText('stored')).toBeNull()
  })

  it('names the filter and offers the way back in an empty archived-only view', () => {
    mountWorkspace([summary('kept', 1)])
    fireEvent.click(screen.getByRole('button', { name: '视图选项' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '仅显示已归档' }))
    expect(screen.getByText('暂无已归档会话')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '查看其他会话' }))
    expect(screen.getByText('kept')).toBeTruthy()
  })

  it('shows the plain empty state for a Workspace without Sessions', () => {
    mountWorkspace([])
    expect(screen.getByText('暂无会话')).toBeTruthy()
  })

  it('keeps the picked filter across remounts through the view store', () => {
    mountWorkspace([summary('kept', 1)])
    fireEvent.click(screen.getByRole('button', { name: '视图选项' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '全部对话（显示已归档）' }))
    cleanup()
    const restored = mountWorkspace([summary('kept', 1)])
    expect(restored.store.getSnapshot().archivedFilter).toBe('show')
  })

  it('opens a row and refuses an archived one', () => {
    const open = vi.fn()
    const notifyArchivedNotOpenable = vi.fn()
    mountWorkspace([summary('kept', 2), summary('stored', 1)], {
      archived: [sid('stored')],
      overrides: { open, notifyArchivedNotOpenable },
    })
    fireEvent.click(screen.getByText('kept'))
    expect(open).toHaveBeenCalledWith('kept')

    fireEvent.click(screen.getByRole('button', { name: '视图选项' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '全部对话（显示已归档）' }))
    fireEvent.click(screen.getByText('stored'))
    expect(open).toHaveBeenCalledTimes(1)
    expect(notifyArchivedNotOpenable).toHaveBeenCalledOnce()
  })

  it('asks for a Session rename from a title double-click', () => {
    const requestSessionRename = vi.fn()
    mountWorkspace([summary('one', 1)], { overrides: { requestSessionRename } })
    fireEvent.doubleClick(screen.getByText('one'))
    expect(requestSessionRename).toHaveBeenCalledWith('one', 'one')
  })

  it('reorders rows by drag and switches the account to Manual', async () => {
    const b = mountWorkspace([summary('one', 2), summary('two', 1)])
    const [one, two] = screen.getAllByRole('treeitem') as [HTMLElement, HTMLElement]
    placeRow(two, 150)
    fireEvent.dragStart(one, { dataTransfer: dragData() })
    fireDrag(two, 'drop', 180)
    await waitFor(() => {
      expect(b.store.getSnapshot().orderBy).toBe('manual')
      expect(b.store.getSnapshot().sessionOrderByAccount.alpha).toEqual(['two', 'one'])
    })
  })

  it('searches Sessions and opens a result, clearing the query', async () => {
    const open = vi.fn()
    const searchSessions = vi.fn(async () => ({
      items: [{ sessionId: sid('hit'), snippet: 'match' }],
      hasMore: false,
    }))
    mount({
      useSessions: hook(sessionState([summary('keeper', 1), summary('hit', 2)])),
      useWorkspaces: hook(workspaceState([workspace('alpha', ['keeper', 'hit'])])),
      open,
      searchSessions,
    })
    fireEvent.click(screen.getByRole('button', { name: '搜索会话' }))
    fireEvent.change(screen.getByPlaceholderText('搜索会话名称'), { target: { value: 'hit' } })
    await waitFor(() => { expect(searchSessions).toHaveBeenCalled() })

    fireEvent.click(await screen.findByText('hit'))
    expect(open).toHaveBeenCalledWith('hit')
    const input = screen.getByPlaceholderText('搜索会话名称') as HTMLInputElement
    expect(input.value).toBe('')
  })

  it('offers unarchive on an archived search result instead of opening it', async () => {
    const open = vi.fn()
    const unarchiveSession = vi.fn(async () => {})
    const notifyArchivedNotOpenable = vi.fn()
    const b = mount({
      useSessions: hook(sessionState([summary('stored', 1)])),
      useWorkspaces: hook(workspaceState([workspace('alpha', ['stored'])], [sid('stored')])),
      open,
      unarchiveSession,
      notifyArchivedNotOpenable,
    })
    // Search follows the archived filter: archived rows surface under "show".
    b.store.actions.setArchivedFilter('show')
    fireEvent.click(screen.getByRole('button', { name: '搜索会话' }))
    fireEvent.change(screen.getByPlaceholderText('搜索会话名称'), { target: { value: 'stored' } })
    fireEvent.click(await screen.findByText('stored'))
    expect(open).not.toHaveBeenCalled()
    expect(notifyArchivedNotOpenable).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: '取消归档' }))
    expect(unarchiveSession).toHaveBeenCalledWith('stored')
  })

  it('renders only the search control in the rail and asks for expansion', () => {
    const expandSidebar = vi.fn()
    mountWorkspace([summary('one', 1)], { overrides: { wide: false, expandSidebar } })
    expect(screen.getAllByRole('button')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '搜索会话' }))
    expect(expandSidebar).toHaveBeenCalled()
  })

  it('focuses the search input on a search command', async () => {
    const b = mountWorkspace([summary('one', 1)])
    b.controls.search()
    rerender(b, {})
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByPlaceholderText('搜索会话名称'))
    })
  })

  it('renames the current Workspace through the header menu', async () => {
    const renameWorkspace = vi.fn(async () => {})
    mountWorkspace([summary('one', 1)], { overrides: { renameWorkspace } })
    fireEvent.click(screen.getByRole('button', { name: '工作区“alpha”的操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名工作区' }))
    const input = screen.getByLabelText('工作区名称') as HTMLInputElement
    expect(input.value).toBe('alpha')
    fireEvent.change(input, { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByRole('button', { name: '重命名' }))
    await waitFor(() => { expect(renameWorkspace).toHaveBeenCalledWith('alpha', 'Renamed') })
    await waitFor(() => { expect(screen.queryByLabelText('工作区名称')).toBeNull() })
  })

  it('reports a rename failure in the dialog and cancels without writing', async () => {
    const renameWorkspace = vi.fn(async () => { throw new Error('name taken') })
    mountWorkspace([summary('one', 1)], { overrides: { renameWorkspace } })
    const openRename = () => {
      fireEvent.click(screen.getByRole('button', { name: '工作区“alpha”的操作' }))
      fireEvent.click(screen.getByRole('menuitem', { name: '重命名工作区' }))
    }
    openRename()
    fireEvent.change(screen.getByLabelText('工作区名称'), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByRole('button', { name: '重命名' }))
    expect(await screen.findByText('name taken')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByLabelText('工作区名称')).toBeNull()
  })

  it('blocks a rename that repeats another Workspace title', async () => {
    const renameWorkspace = vi.fn(async () => {})
    mount({
      useCurrentWorkspace: hook(wid('alpha')),
      useSessions: hook(sessionState([summary('one', 1)])),
      useWorkspaces: hook(workspaceState([
        workspace('alpha', ['one'], 'Alpha'),
        workspace('beta', [], 'Beta'),
      ])),
      renameWorkspace,
    })
    fireEvent.click(screen.getByRole('button', { name: '工作区“Alpha”的操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名工作区' }))
    fireEvent.change(screen.getByLabelText('工作区名称'), { target: { value: 'Beta' } })
    expect(screen.getByText('已存在名为“Beta”的工作区。')).toBeTruthy()
    expect(screen.getByRole('button', { name: '重命名' }).hasAttribute('disabled')).toBe(true)
    expect(renameWorkspace).not.toHaveBeenCalled()
  })
})
