import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { describe, expect, it, vi } from 'vitest'
import { LayoutController } from '../src/client/service.ts'
import type { MainPanelId, PanelActions } from '../src/client/service.ts'

function fakePanels(): PanelActions {
  return {
    selectPanel: vi.fn(),
    retainMainPanels: vi.fn(),
    selectActivity: vi.fn(),
    retainActivities: vi.fn(),
    setSidebar: vi.fn(),
    toggleSidebar: vi.fn(),
    setViewportWidth: vi.fn(),
    setRightbar: vi.fn(),
    openRightbar: vi.fn(),
    closeRightbar: vi.fn(),
  }
}

/** Service under test over the given faces and action stubs. */
function service(
  panels = fakePanels(),
  hasMainPanel: (id: MainPanelId) => boolean = () => true,
  hasActivity: (id: string) => boolean = () => true,
): LayoutController {
  return new LayoutController(
    panels,
    hasMainPanel,
    createSnapshotStore({ activePanelId: null }),
    hasActivity,
    createSnapshotStore({ activeId: 'workspace' }),
  )
}

describe('LayoutController', () => {
  it('forwards right column transitions to the constructor-supplied actions', () => {
    const panels = fakePanels()
    const controller = service(panels)

    controller.openRightbar(true, false)
    controller.openRightbar(true, true)
    controller.openRightbar(false, true)
    controller.closeRightbar()

    expect(panels.openRightbar).toHaveBeenNthCalledWith(1, true, false)
    expect(panels.openRightbar).toHaveBeenNthCalledWith(2, true, true)
    expect(panels.openRightbar).toHaveBeenNthCalledWith(3, false, true)
    expect(panels.closeRightbar).toHaveBeenCalledTimes(1)
    // The drag width stays the frame's own business, never the caller's.
    expect(panels.setRightbar).not.toHaveBeenCalled()
  })

  it('can toggle the sidebar immediately after construction', () => {
    const panels = fakePanels()
    const controller = service(panels)

    controller.toggleSidebar()

    expect(panels.toggleSidebar).toHaveBeenCalledTimes(1)
    expect(panels.setSidebar).not.toHaveBeenCalled()
  })

  it('forwards panel selection and returning to the Conversation without changing geometry', () => {
    const panels = fakePanels()
    const controller = service(panels)
    const panelId = 'panel-a' as MainPanelId
    controller.selectPanel(panelId)
    controller.selectPanel(panelId)
    controller.selectPanel(null)
    expect(panels.selectPanel).toHaveBeenNthCalledWith(1, panelId)
    expect(panels.selectPanel).toHaveBeenNthCalledWith(2, panelId)
    expect(panels.selectPanel).toHaveBeenNthCalledWith(3, null)
    expect(panels.toggleSidebar).not.toHaveBeenCalled()
    expect(panels.openRightbar).not.toHaveBeenCalled()
    expect(panels.closeRightbar).not.toHaveBeenCalled()
  })

  it('keeps separately constructed controllers bound to their own instances', () => {
    const first = fakePanels()
    const second = fakePanels()
    const firstService = service(first)
    const secondService = service(second)
    firstService.toggleSidebar()
    expect(first.toggleSidebar).toHaveBeenCalledTimes(1)
    expect(second.toggleSidebar).not.toHaveBeenCalled()
    secondService.closeRightbar()
    expect(first.closeRightbar).not.toHaveBeenCalled()
    expect(second.closeRightbar).toHaveBeenCalledTimes(1)
  })

  it('forwards activity selection and rejects an id the ledger does not offer', () => {
    const panels = fakePanels()
    const selectable = new Set(['workspace', 'plugins'])
    const controller = service(panels, () => true, id => selectable.has(id))
    controller.selectActivity('plugins')
    expect(panels.selectActivity).toHaveBeenCalledWith('plugins')
    selectable.delete('plugins')
    expect(() => { controller.selectActivity('plugins') }).toThrow('activity "plugins" is not registered')
    expect(panels.selectActivity).toHaveBeenCalledOnce()
  })

  it('rejects an absent main entry without changing selection or cancelling pending navigation', () => {
    const panels = fakePanels()
    const present = new Set(['panel-a'])
    const controller = service(panels, id => present.has(id))
    controller.selectPanel('panel-a' as MainPanelId)
    const navigation = controller.beginNavigation()
    present.delete('panel-a')
    expect(() => { controller.selectPanel('panel-a' as MainPanelId) }).toThrow('main panel "panel-a" is not registered')
    expect(panels.selectPanel).toHaveBeenCalledOnce()
    expect(navigation.aborted).toBe(false)
    controller.selectPanel(null)
    expect(navigation.aborted).toBe(true)
  })

  it('supersedes asynchronous navigation on another request, any valid selection, and disposal', () => {
    const controller = service()
    const first = controller.beginNavigation()
    const second = controller.beginNavigation()
    expect(first.aborted).toBe(true)
    expect(second.aborted).toBe(false)
    controller.selectPanel('panel-a' as MainPanelId)
    expect(second.aborted).toBe(true)
    const repeated = controller.beginNavigation()
    controller.selectPanel('panel-a' as MainPanelId)
    expect(repeated.aborted).toBe(true)
    const pending = controller.beginNavigation()
    controller.dispose()
    expect(pending.aborted).toBe(true)
    controller.dispose()
  })
})
