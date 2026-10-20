// @vitest-environment jsdom

import ShortcutsService from '../../shortcuts/src/client/index.ts'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { Context, type Fiber } from '@deepseek-ai/cordis'
import { stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { SlotRendererHost } from '@deepseek-ai/dsh-client-ui-slots'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply as themeApply, inject as themeInject, ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
import { apply, inject, LayoutController } from '@deepseek-ai/dsh-client-ui-layout/client'
import { apply as nodeApply } from '@deepseek-ai/dsh-client-ui-layout'
import type { MainPanelId } from '../src/client/service.ts'
import type { ActivityBarInjected } from '../src/client/contract.ts'
import { ACTIVITY_ORDER_STORAGE_KEY } from '../src/client/activity-order.ts'
import type { createLayoutStore } from '../src/client/stores.ts'

const owners = new Set<Fiber>()
let originalRootStyle: string | null
let originalBodyStyle: string | null
let originalDarkTheme: string | null
let originalThemeMetadata: Element[]

beforeEach(() => {
  localStorage.clear()
  originalRootStyle = document.documentElement.getAttribute('style')
  originalBodyStyle = document.body.getAttribute('style')
  originalDarkTheme = document.body.getAttribute('data-ds-dark-theme')
  originalThemeMetadata = [...document.head.querySelectorAll('meta[name="theme-color"]')]
  originalThemeMetadata.forEach((node) => { node.remove() })
  vi.stubGlobal('innerWidth', 1920)
})

afterEach(async () => {
  try {
    for (const owner of owners) await owner.dispose()
  } finally {
    owners.clear()
    restoreAttribute(document.documentElement, 'style', originalRootStyle)
    restoreAttribute(document.body, 'style', originalBodyStyle)
    restoreAttribute(document.body, 'data-ds-dark-theme', originalDarkTheme)
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((node) => { node.remove() })
    document.head.append(...originalThemeMetadata)
    vi.unstubAllGlobals()
  }
})

function restoreAttribute(element: Element, name: string, value: string | null): void {
  if (value === null) element.removeAttribute(name)
  else element.setAttribute(name, value)
}

async function bench() {
  const root = new Context()
  let ctx: Context | undefined
  const owner = root.plugin((ownedContext: Context) => { ctx = ownedContext })
  owners.add(owner)
  await owner.await()
  if (ctx === undefined) throw new Error('the fixture owner did not activate')
  const slotsFiber = ctx.plugin(SlotRegistry)
  ctx.provide('locale', new LocaleRuntime(ctx))
  await ctx.plugin(ShortcutsService).await()
  // ui-theme's Appearance row binds a durable scope through these two.
  ctx.provide('remote', { $on: () => () => {} } as never)
  ctx.provide('configForms', { developerTools: { enabled: createSnapshotStore(true) }, get: () => stubConfigForm().scope } as never)
  await ctx.plugin({ inject: themeInject, apply: themeApply }).await()
  await slotsFiber.await()
  const slots = ctx.get('slots') as SlotRegistry
  let host: SlotRendererHost | undefined
  slots.install({ renderRoot: (value) => { host = value; return null } })
  const rendererHost = (): SlotRendererHost => {
    slots.renderSlot('root', {})
    if (host === undefined) throw new Error('the root renderer did not receive its host')
    return host
  }
  return { ctx, slots, rendererHost }
}

describe('ui-layout client apply', () => {
  it('declares its service dependencies', () => {
    expect(inject).toEqual(['slots', 'theme', 'locale', 'shortcuts'])
  })

  it('provides ctx.layout and declares the root-scoped frame slots', async () => {
    const { ctx, slots } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(ctx.get('layout')).toBeInstanceOf(LayoutController)
    expect(slots.entries('root')).toHaveLength(1)
    expect(slots.spec('sidebar')).toEqual({ kind: 'single', scope: 'root' })
    expect(slots.spec('main')).toEqual({ kind: 'keyed', scope: 'root' })
    expect(slots.spec('rightbar')).toEqual({ kind: 'single', scope: 'root' })
    expect(slots.spec('shell.activitybar')).toEqual({ kind: 'single', scope: 'root' })
    expect(slots.spec('shell.activity')).toEqual({ kind: 'keyed', scope: 'root' })
    expect(slots.spec('shell.header')).toEqual({ kind: 'single', scope: 'root' })
    expect(slots.spec('shell.workspace.tabs')).toEqual({ kind: 'single', scope: 'root' })
    expect(slots.spec('shell.bottom')).toEqual({ kind: 'single', scope: 'root' })
    expect(slots.spec('shell.statusbar')).toEqual({ kind: 'single', scope: 'root' })
    expect(slots.spec('shell.overlay')).toEqual({ kind: 'list', scope: 'root' })
    expect(slots.spec('shell.leading')).toEqual({ kind: 'single', scope: 'root' })
    // The frame's own chrome seats are occupied the way a plugin occupies them.
    expect(slots.entries('shell.activitybar')).toHaveLength(1)
    expect(slots.entries('shell.statusbar')).toHaveLength(1)
    expect(slots.spec('shell.activitybar.items')).toEqual({ kind: 'list', scope: 'root' })
    // The rail foot hosts the settings shell; the brand band hosts ui-sidebar.
    expect(slots.spec('shell.activitybar.settings')).toEqual({ kind: 'single', scope: 'root' })
    expect(slots.spec('shell.statusbar.left')).toEqual({ kind: 'list', scope: 'root' })
    expect(slots.spec('shell.statusbar.right')).toEqual({ kind: 'list', scope: 'root' })
  })

  it('drives the activity rail from the entry ledger and validates the selected view', async () => {
    const { ctx, slots } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const bar = slots.entries('shell.activitybar')[0]!
    const face = bar.inject!() as ActivityBarInjected
    const instance = (bar.store as ReturnType<typeof createLayoutStore>).create()
    const activities = face.hooks.activities
    expect(activities.getSnapshot()).toEqual([{ id: 'workspace', label: 'Workspace', builtIn: true }])
    const disposeItem = slots.register({
      name: 'shell.activitybar.items', id: 'plugins', order: 200, label: () => 'Plugins',
    }, () => null)
    await vi.waitFor(() => {
      expect(activities.getSnapshot()).toEqual([
        { id: 'workspace', label: 'Workspace', builtIn: true },
        { id: 'plugins', label: 'Plugins', builtIn: false },
      ])
    })
    // A rail entry without a `shell.activity` view fails at selection and
    // leaves the frame on its own composition.
    expect(() => { face.select('plugins') }).toThrow('layout.selectActivity: activity "plugins" is not registered')
    expect(instance.getSnapshot().activityInfo.activeId).toBe('workspace')
    const disposeView = slots.register({ name: 'shell.activity', key: 'plugins' }, () => null)
    face.select('plugins')
    expect(instance.getSnapshot().activityInfo.activeId).toBe('plugins')
    // The built-in entry's label follows the active language like any other rail label.
    ;(ctx.get('locale') as LocaleRuntime).setLocale('zh')
    await vi.waitFor(() => {
      expect(activities.getSnapshot()).toEqual([
        { id: 'workspace', label: '工作区', builtIn: true },
        { id: 'plugins', label: 'Plugins', builtIn: false },
      ])
    })
    disposeItem()
    await vi.waitFor(() => {
      expect(activities.getSnapshot()).toEqual([{ id: 'workspace', label: '工作区', builtIn: true }])
    })
    // The selected entry is gone: the frame returns to its own composition.
    expect(instance.getSnapshot().activityInfo.activeId).toBe('workspace')
    disposeView()
    await fiber.dispose()
  })

  it('persists a dragged rail order and reapplies it on the next launch', async () => {
    const { ctx, slots } = await bench()
    const first = ctx.plugin({ inject: [...inject], apply })
    await first.await()
    const firstBar = slots.entries('shell.activitybar')[0]!
    const firstFace = firstBar.inject!() as ActivityBarInjected
    const firstIds = (): string[] => firstFace.hooks.activities.getSnapshot().map(entry => entry.id)
    const disposePlugins = slots.register({
      name: 'shell.activitybar.items', id: 'plugins', order: 100, label: () => 'Plugins',
    }, () => null)
    const disposeSchedules = slots.register({
      name: 'shell.activitybar.items', id: 'schedules', order: 200, label: () => 'Schedules',
    }, () => null)
    await vi.waitFor(() => { expect(firstIds()).toEqual(['workspace', 'plugins', 'schedules']) })
    firstFace.reorder('schedules', 'plugins', 'before')
    expect(firstIds()).toEqual(['workspace', 'schedules', 'plugins'])
    expect(JSON.parse(localStorage.getItem(ACTIVITY_ORDER_STORAGE_KEY)!)).toEqual(['workspace', 'schedules', 'plugins'])
    // A move that leaves the order alone does not rewrite the saved value.
    firstFace.reorder('schedules', 'workspace', 'after')
    expect(JSON.parse(localStorage.getItem(ACTIVITY_ORDER_STORAGE_KEY)!)).toEqual(['workspace', 'schedules', 'plugins'])
    disposePlugins()
    disposeSchedules()
    await first.dispose()

    // The next launch reads the saved order before the ledger is populated.
    const second = ctx.plugin({ inject: [...inject], apply })
    await second.await()
    const secondBar = slots.entries('shell.activitybar')[0]!
    const secondFace = secondBar.inject!() as ActivityBarInjected
    expect(secondFace.hooks.activities.getSnapshot()).toEqual([{ id: 'workspace', label: 'Workspace', builtIn: true }])
    const disposeSecondPlugins = slots.register({
      name: 'shell.activitybar.items', id: 'plugins', order: 100, label: () => 'Plugins',
    }, () => null)
    const disposeSecondSchedules = slots.register({
      name: 'shell.activitybar.items', id: 'schedules', order: 200, label: () => 'Schedules',
    }, () => null)
    await vi.waitFor(() => {
      expect(secondFace.hooks.activities.getSnapshot().map(entry => entry.id))
        .toEqual(['workspace', 'schedules', 'plugins'])
    })
    // An entry that left the ledger is ignored instead of keeping a phantom slot.
    disposeSecondPlugins()
    await vi.waitFor(() => {
      expect(secondFace.hooks.activities.getSnapshot().map(entry => entry.id)).toEqual(['workspace', 'schedules'])
    })
    disposeSecondSchedules()
    await second.dispose()
  })

  it('shares a pre-created instance between service actions, root rendering, and panelInfo', async () => {
    const { ctx, slots, rendererHost } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const entry = slots.entries('root')[0]!
    expect(entry.inject).toBeUndefined()
    const handle = entry.store as ReturnType<typeof createLayoutStore>
    const instance = handle.create()
    expect(handle.create()).toBe(instance)
    const layout = ctx.get('layout') as LayoutController
    expect(() => { layout.selectPanel('missing' as MainPanelId) }).toThrow('main panel "missing" is not registered')
    layout.toggleSidebar()
    expect(instance.getSnapshot().layoutInfo.sidebar).toBe(0)
    const host = rendererHost()
    expect(host.storeOf(entry, undefined)).toBe(instance)
    const panelInfo = host.root.getSnapshot().hooks.panelInfo!
    expect(panelInfo).toBe(layout.panelInfo)
    expect(panelInfo.getSnapshot()).toBe(instance.getSnapshot().panelInfo)
    const panelId = 'panel-a' as MainPanelId
    const disposePanel = slots.register({ name: 'main', key: panelId }, () => null)
    layout.selectPanel(panelId)
    expect(panelInfo.getSnapshot()).toEqual({ activePanelId: panelId })
    disposePanel()
    await vi.waitFor(() => { expect(panelInfo.getSnapshot()).toEqual({ activePanelId: null }) })
    expect(() => { layout.selectPanel(panelId) }).toThrow('main panel "panel-a" is not registered')
    expect(instance.getSnapshot().layoutInfo.sidebar).toBe(0)
    const pending = layout.beginNavigation()
    await fiber.dispose()
    expect(pending.aborted).toBe(true)
  })

  it('theme presenter applies the initial snapshot, follows theme/change, and unwinds on dispose', async () => {
    const { ctx } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    // Initial getter application: jsdom has no matchMedia, system resolves light.
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(false)
    const themeColorMeta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    expect(themeColorMeta).not.toBeNull()
    const theme = ctx.get('theme') as ThemeRuntime
    theme.setTheme('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(true)
    expect(document.head.querySelector('meta[name="theme-color"]')).toBe(themeColorMeta)
    await fiber.dispose()
    expect(document.documentElement.style.colorScheme).toBe('')
    expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(false)
    expect(themeColorMeta?.isConnected).toBe(false)
    // Listener is off: further theme changes no longer reach the document.
    theme.setTheme('light')
    theme.setTheme('dark')
    expect(document.documentElement.style.colorScheme).toBe('')
    expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(false)
  })

  it('teardown unwinds the service, the root registration, and the child declarations', async () => {
    const { ctx, slots, rendererHost } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const host = rendererHost()
    expect(host.root.getSnapshot().hooks.panelInfo).toBeDefined()
    await fiber.dispose()
    expect(ctx.get('layout')).toBeUndefined()
    expect(slots.entries('root')).toHaveLength(0)
    expect(slots.spec('sidebar')).toBeUndefined()
    expect(slots.spec('main')).toBeUndefined()
    expect(slots.spec('rightbar')).toBeUndefined()
    expect(slots.spec('shell.activitybar')).toBeUndefined()
    expect(slots.spec('shell.activitybar.items')).toBeUndefined()
    expect(slots.spec('shell.activity')).toBeUndefined()
    expect(slots.spec('shell.bottom')).toBeUndefined()
    expect(slots.spec('shell.statusbar')).toBeUndefined()
    expect(slots.spec('shell.statusbar.left')).toBeUndefined()
    expect(slots.spec('shell.statusbar.right')).toBeUndefined()
    expect(slots.spec('shell.overlay')).toBeUndefined()
    expect(slots.spec('shell.leading')).toBeUndefined()
    expect(host.root.getSnapshot().hooks.panelInfo).toBeUndefined()
    // The built-in root declaration survives entry teardown (renderer-owned).
    expect(slots.spec('root')).toEqual({ kind: 'single', scope: 'root' })
  })
})

describe('node half', () => {
  it('node apply is an intentional no-op (loader-managed lifecycle only)', () => {
    nodeApply()
    expect(true).toBe(true) // reaching here without throw is the contract
  })
})
