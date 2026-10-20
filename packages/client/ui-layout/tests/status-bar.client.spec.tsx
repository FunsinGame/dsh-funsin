// @vitest-environment jsdom
/** Status bar: the shell-owned strip around two independently registered groups. */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { StatusBarProps } from '../src/client/contract.ts'
import { StatusBar } from '../src/client/StatusBar.tsx'

const COPY: Record<string, string> = { 'statusbar.aria': 'Status bar' }

afterEach(() => { cleanup() })

function mount() {
  const calls: { key: string; owner: object }[] = []
  const renderSlot: StatusBarProps['renderSlot'] = (key: string, owner: object) => {
    calls.push({ key, owner })
    return <span data-slot={key} />
  }
  // The strip consumes only the render share and the locale seat; the
  // framework-standard props are inherited from the slot runtime, so the
  // direct-props fixture supplies just these two.
  const props = (): StatusBarProps => ({ renderSlot, t: key => COPY[key] ?? key }) as StatusBarProps
  const utils = render(<StatusBar {...props()} />)
  return { ...utils, calls }
}

describe('StatusBar', () => {
  it('renders both item groups inside the named strip', () => {
    const { container, calls } = mount()
    const bar = container.querySelector('footer[aria-label="Status bar"]')
    expect(bar).not.toBeNull()
    expect(calls).toEqual([
      { key: 'shell.statusbar.left', owner: {} },
      { key: 'shell.statusbar.right', owner: {} },
    ])
    // Each group keeps its own container: the trailing one never shrinks, so
    // the two lists cannot be collapsed into one flow.
    expect(bar?.querySelector('[data-statusbar-left] [data-slot="shell.statusbar.left"]')).not.toBeNull()
    expect(bar?.querySelector('[data-statusbar-right] [data-slot="shell.statusbar.right"]')).not.toBeNull()
  })
})
