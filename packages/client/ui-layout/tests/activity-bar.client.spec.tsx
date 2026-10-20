// @vitest-environment jsdom
/** Activity rail: shell-owned buttons over a real layout store and stubbed glyphs. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
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

afterEach(() => { cleanup() })

function mount(initial: readonly ActivityEntry[] = []) {
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
  const props = (): ActivityBarProps => ({
    renderSlot,
    select,
    useStore: bindSnapshotSelector(instance),
    actions: instance.actions,
    useActivities: bindSnapshotSelector(activities),
    t: key => COPY[key] ?? key,
  }) as ActivityBarProps
  const utils = render(<ActivityBar {...props()} />)
  const nav = (): HTMLElement => utils.getByRole('navigation', { name: 'Activity bar' })
  const buttons = (): HTMLElement[] => within(nav()).getAllByRole('button')
  return { ...utils, instance, activities, select, slotCalls, footerCalls, nav, buttons }
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

  it('renders registered glyphs in ledger order and marks the selected entry', () => {
    const { buttons, slotCalls } = mount([
      { id: 'plugins', order: 100, label: 'Plugins' },
      { id: 'schedules', order: 200, label: 'Schedules' },
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
    const { instance, select, nav, buttons, slotCalls } = mount([{ id: 'plugins', order: 100, label: 'Plugins' }])
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
    act(() => { activities.set([{ id: 'plugins', order: 0, label: 'Plugins' }]) })
    expect(buttons().map(button => button.getAttribute('aria-label'))).toEqual(['Workspace', 'Plugins'])
    act(() => { activities.set([]) })
    expect(buttons()).toHaveLength(1)
  })
})
