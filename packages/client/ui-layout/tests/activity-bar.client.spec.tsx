// @vitest-environment jsdom
/** Activity rail: shell-owned buttons over a real layout store and stubbed glyphs. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, createEvent, fireEvent, render, within } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import type { RenderOpts } from '@deepseek-ai/dsh-client-ui-slots'
import { ActivityBar } from '../src/client/ActivityBar.tsx'
import type { ActivityBarProps, ActivityEntry, ActivityItemOwnerProps } from '../src/client/contract.ts'
import { createLayoutStore } from '../src/client/stores.ts'

const COPY: Record<string, string> = {
  'activitybar.aria': 'Activity bar',
  'activity.workspace': 'Workspace',
}

const WORKSPACE: ActivityEntry = { id: 'workspace', label: 'Workspace', builtIn: true }

afterEach(() => { cleanup() })

function mount(initial: readonly ActivityEntry[] = [WORKSPACE]) {
  const instance = createLayoutStore().create()
  const activities = createSnapshotStore<readonly ActivityEntry[]>(initial)
  const slotCalls: { key: string; owner: ActivityItemOwnerProps; options: RenderOpts | undefined }[] = []
  const footerCalls: object[] = []
  const renderSlot: ActivityBarProps['renderSlot'] = (key: string, owner: object, options?: RenderOpts) => {
    if (key === 'shell.activitybar.settings') {
      footerCalls.push(owner)
      return <span data-settings-seat />
    }
    const item = owner as ActivityItemOwnerProps
    slotCalls.push({ key, owner: item, options })
    return <span data-glyph={options?.only} data-size={item.size} data-active={item.active} />
  }
  const select = vi.fn()
  const reorder = vi.fn()
  const props = (): ActivityBarProps => ({
    renderSlot,
    select,
    reorder,
    useStore: bindSnapshotSelector(instance),
    actions: instance.actions,
    useActivities: bindSnapshotSelector(activities),
    t: key => COPY[key] ?? key,
  }) as ActivityBarProps
  const utils = render(<ActivityBar {...props()} />)
  const nav = (): HTMLElement => utils.getByRole('navigation', { name: 'Activity bar' })
  const buttons = (): HTMLElement[] => within(nav()).getAllByRole('button')
  return { ...utils, instance, activities, select, reorder, slotCalls, footerCalls, nav, buttons }
}

/** jsdom lacks DragEvent — the fireEvent fallback drops clientY, so pin it on the built event. */
function fireDrag(entry: HTMLElement, kind: 'dragOver' | 'drop', clientY: number): void {
  const event = kind === 'dragOver' ? createEvent.dragOver(entry) : createEvent.drop(entry)
  Object.defineProperty(event, 'clientY', { value: clientY })
  Object.defineProperty(event, 'dataTransfer', { value: { effectAllowed: '', dropEffect: '' } })
  fireEvent(entry, event)
}

/** Give one entry a vertical box so a drop can resolve its half without layout. */
function placeEntry(entry: HTMLElement, top: number): void {
  entry.getBoundingClientRect = () => ({
    left: 0, right: 40, top, bottom: top + 40, width: 40, height: 40, x: 0, y: top, toJSON: () => ({}),
  })
}

function dragData(): Pick<DataTransfer, 'effectAllowed' | 'dropEffect' | 'setData'> {
  return { effectAllowed: 'uninitialized', dropEffect: 'none', setData: vi.fn() }
}

describe('ActivityBar', () => {
  it('renders the built-in Workspace entry selected by default', () => {
    const { nav, buttons, footerCalls } = mount()
    expect(nav().getAttribute('aria-label')).toBe('Activity bar')
    expect(buttons().map(button => button.getAttribute('aria-label'))).toEqual(['Workspace'])
    expect(buttons()[0]?.getAttribute('aria-current')).toBe('page')
    // The built-in entry is frame-owned: it draws its own glyph and asks the
    // list for nothing.
    expect(buttons()[0]?.querySelector('svg')).not.toBeNull()
    expect(nav().querySelector('[data-glyph]')).toBeNull()
    // The rail foot hosts the settings trigger in its compact form.
    expect(footerCalls).toEqual([{ wide: false }])
    expect(nav().querySelector('[data-activitybar-footer] [data-settings-seat]')).not.toBeNull()
  })

  it('renders registered glyphs in the projected order and marks the selected entry', () => {
    const { buttons, slotCalls } = mount([
      WORKSPACE,
      { id: 'plugins', label: 'Plugins', builtIn: false },
      { id: 'schedules', label: 'Schedules', builtIn: false },
    ])
    expect(buttons().map(button => button.getAttribute('aria-label'))).toEqual(['Workspace', 'Plugins', 'Schedules'])
    expect(buttons()[0]?.getAttribute('aria-current')).toBe('page')
    expect(buttons()[1]?.getAttribute('aria-current')).toBeNull()
    expect(slotCalls).toEqual([
      { key: 'shell.activitybar.items', owner: { size: 20, active: false }, options: { only: 'plugins' } },
      { key: 'shell.activitybar.items', owner: { size: 20, active: false }, options: { only: 'schedules' } },
    ])
  })

  it('reports the clicked entry and follows the store selection', () => {
    const { instance, select, nav, buttons, slotCalls } = mount([WORKSPACE, { id: 'plugins', label: 'Plugins', builtIn: false }])
    act(() => { fireEvent.click(within(nav()).getByRole('button', { name: 'Plugins' })) })
    expect(select).toHaveBeenCalledWith('plugins')
    slotCalls.length = 0
    act(() => { instance.actions.selectActivity('plugins') })
    expect(buttons()[1]?.getAttribute('aria-current')).toBe('page')
    expect(buttons()[0]?.getAttribute('aria-current')).toBeNull()
    expect(slotCalls).toEqual([
      { key: 'shell.activitybar.items', owner: { size: 20, active: true }, options: { only: 'plugins' } },
    ])
    act(() => { fireEvent.click(within(nav()).getByRole('button', { name: 'Workspace' })) })
    expect(select).toHaveBeenLastCalledWith('workspace')
  })

  it('adds and removes entries as the ledger changes', () => {
    const { activities, buttons } = mount()
    expect(buttons()).toHaveLength(1)
    act(() => { activities.set([WORKSPACE, { id: 'plugins', label: 'Plugins', builtIn: false }]) })
    expect(buttons().map(button => button.getAttribute('aria-label'))).toEqual(['Workspace', 'Plugins'])
    act(() => { activities.set([WORKSPACE]) })
    expect(buttons()).toHaveLength(1)
  })

  it('reports an entry dropped before or after another', () => {
    const { reorder, buttons } = mount([
      WORKSPACE,
      { id: 'plugins', label: 'Plugins', builtIn: false },
      { id: 'schedules', label: 'Schedules', builtIn: false },
    ])
    const [workspace, plugins, schedules] = buttons() as [HTMLElement, HTMLElement, HTMLElement]
    placeEntry(plugins, 50)
    // Schedules dropped on the leading half of Plugins lands above it.
    fireEvent.dragStart(schedules, { dataTransfer: dragData() })
    fireDrag(plugins, 'drop', 60)
    expect(reorder).toHaveBeenCalledWith('schedules', 'plugins', 'before')

    // Workspace dropped on the trailing half of Schedules lands below it.
    placeEntry(schedules, 94)
    fireEvent.dragStart(workspace, { dataTransfer: dragData() })
    fireDrag(schedules, 'drop', 125)
    expect(reorder).toHaveBeenLastCalledWith('workspace', 'schedules', 'after')
  })

  it('commits the last marker reported by drag end when no drop lands', () => {
    const { reorder, buttons } = mount([
      WORKSPACE,
      { id: 'plugins', label: 'Plugins', builtIn: false },
      { id: 'schedules', label: 'Schedules', builtIn: false },
    ])
    const [workspace, plugins] = buttons() as [HTMLElement, HTMLElement]
    placeEntry(plugins, 50)
    fireEvent.dragStart(workspace, { dataTransfer: dragData() })
    fireDrag(plugins, 'dragOver', 85)
    fireEvent.dragEnd(workspace, { dataTransfer: dragData() })
    expect(reorder).toHaveBeenCalledWith('workspace', 'plugins', 'after')
  })

  it('ignores a drop on the dragged entry and a drag end without a target', () => {
    const { reorder, buttons } = mount([WORKSPACE, { id: 'plugins', label: 'Plugins', builtIn: false }])
    const [workspace, plugins] = buttons() as [HTMLElement, HTMLElement]
    placeEntry(plugins, 50)
    fireEvent.dragStart(plugins, { dataTransfer: dragData() })
    fireDrag(plugins, 'dragOver', 10)
    fireEvent.drop(plugins, { dataTransfer: dragData() })
    expect(reorder).not.toHaveBeenCalled()

    // An entry dragged without crossing another reports no target at all.
    fireEvent.dragStart(workspace, { dataTransfer: dragData() })
    fireEvent.dragEnd(workspace, { dataTransfer: dragData() })
    expect(reorder).not.toHaveBeenCalled()
  })

  it('ignores a drop that did not start on the rail', () => {
    const { reorder, buttons } = mount([WORKSPACE, { id: 'plugins', label: 'Plugins', builtIn: false }])
    fireDrag(buttons()[1]!, 'drop', 10)
    expect(reorder).not.toHaveBeenCalled()
  })
})
