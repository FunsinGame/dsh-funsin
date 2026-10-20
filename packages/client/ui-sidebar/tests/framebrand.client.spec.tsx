// @vitest-environment jsdom
/** Frame brand band: the always-mounted wordmark outside every activity. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { FrameBrandProps } from '../src/client/FrameBrand.tsx'
import { FrameBrand } from '../src/client/FrameBrand.tsx'
import { en } from '../src/client/locales.ts'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'

const t: FrameBrandProps['t'] = makeTranslate({ ...commonEn, ...en })
const BRAND_NAME = commonEn['brand.name']

/** Minimal ResizeObserver stand-in: jsdom ships none. */
class ObserverStub {
  disconnected = false
  observed: Element[] = []
  constructor(private readonly callback: () => void) {}
  observe(element: Element): void { this.observed.push(element) }
  unobserve(): void {}
  disconnect(): void { this.disconnected = true }
  fire(): void { this.callback() }
}
let observers: ObserverStub[] = []

afterEach(() => {
  cleanup()
  document.documentElement.removeAttribute('data-windows-titlebar')
  document.documentElement.style.removeProperty('--dsh-windows-brand-end')
  document.documentElement.style.removeProperty('--dsh-windows-caption-controls-start')
  document.documentElement.style.removeProperty('--dsh-windows-menu-start')
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  observers = []
})

/** Render the band with either custom occupants or the shell's own fallbacks. */
function mountSlots(filled: boolean) {
  const renderSlot: FrameBrandProps['renderSlot'] = ((key: string, _owner: object, options?: { fallback?: ReactNode }) => {
    if (!filled) return options?.fallback ?? null
    return key === 'shell.header.brand.mark'
      ? <span data-testid="custom-brand-mark">M</span>
      : <span data-testid="custom-brand-name">Custom Brand</span>
  }) as FrameBrandProps['renderSlot']
  const props = (): FrameBrandProps => ({ renderSlot, t }) as FrameBrandProps
  return render(<FrameBrand {...props()} />)
}

describe('FrameBrand', () => {
  it('renders the slotted mark and name', () => {
    mountSlots(true)
    expect(screen.getByTestId('custom-brand-mark')).toBeTruthy()
    expect(screen.getByTestId('custom-brand-name')).toBeTruthy()
    expect(document.querySelector('[data-frame-brand]')).not.toBeNull()
  })

  it('joins the Windows caption line and publishes the brand edge for the menus', () => {
    vi.stubGlobal('ResizeObserver', class extends ObserverStub {
      constructor(callback: () => void) {
        super(callback)
        observers.push(this)
      }
    })
    document.documentElement.setAttribute('data-windows-titlebar', '')
    const view = mountSlots(true)
    const brand = document.querySelector('[data-frame-brand]')!
    // The caption line is the window's first row: the brand is fixed over it,
    // not a full band below it.
    expect(brand.className).toContain('captionBar')
    expect(observers).toHaveLength(1)
    expect(observers[0]!.observed[0]).toBe(brand)
    // The caption controls start at the brand's edge; the menus reserve that
    // edge plus whatever width the sidebar declares for its caption controls.
    expect(document.documentElement.style.getPropertyValue('--dsh-windows-brand-end')).toBe('8px')
    expect(document.documentElement.style.getPropertyValue('--dsh-windows-caption-controls-start')).toBe('8px')
    expect(document.documentElement.style.getPropertyValue('--dsh-windows-menu-start'))
      .toBe('calc(8px + var(--dsh-windows-caption-controls-width, 0px))')
    // A width change republishes the edge.
    observers[0]!.fire()
    expect(document.documentElement.style.getPropertyValue('--dsh-windows-brand-end')).toBe('8px')
    view.unmount()
    expect(observers[0]!.disconnected).toBe(true)
    for (const name of ['--dsh-windows-brand-end', '--dsh-windows-caption-controls-start', '--dsh-windows-menu-start']) {
      expect(document.documentElement.style.getPropertyValue(name)).toBe('')
    }
  })

  it('falls back to the sleeping whale and the deepsleep wordmark with its build badge', () => {
    vi.stubEnv('DSH_CLIENT_COMMIT_HASH', '0123456')
    vi.stubEnv('DSH_CLIENT_GIT_DIRTY', 'true')
    vi.stubEnv('DSH_CLIENT_VERSION', '1.2.3-rc.4')
    const { container } = mountSlots(false)
    expect(screen.getByText(BRAND_NAME)).toBeTruthy()
    expect(screen.getByText('1.2.3-rc.4-0123456-dirty')).toBeTruthy()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it.each([
    [{ DSH_CLIENT_VERSION: '1.2.3' }, '1.2.3'],
    [{ DSH_CLIENT_COMMIT_HASH: 'abcdef0', DSH_CLIENT_VERSION: '1.2.3' }, '1.2.3-abcdef0'],
  ])('omits unavailable build-version suffixes from %j', (environment, expected) => {
    for (const [name, value] of Object.entries(environment)) vi.stubEnv(name, value)
    mountSlots(false)
    expect(screen.getByText(BRAND_NAME)).toBeTruthy()
    expect(screen.getByText(expected)).toBeTruthy()
  })

  it('retains the wordmark without complete build metadata', () => {
    mountSlots(false)
    expect(screen.getByText(BRAND_NAME)).toBeTruthy()
  })
})
