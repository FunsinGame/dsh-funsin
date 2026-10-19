/**
 * Frame-wide Workspace tab strip, the `shell.header` occupant: one tab per
 * registered Workspace in durable registry order with the current Workspace
 * selected.
 *
 * - Left click makes a Workspace current (see `selectWorkspace`: its most
 *   recent openable Session, or a blank one when it has none) and the sidebar
 *   list follows it.
 * - Right click opens the tab's own menu, which currently offers Close only:
 *   it removes the registry registration and keeps the directory and every
 *   Session log.
 * - Dragging a tab writes the registry order through `insertBefore`, the same
 *   order every other surface reads.
 * - The trailing add control sits at the strip's right edge and raises this
 *   surface's own directory flow; a composition with no flow occupant shows
 *   no add control at all.
 *
 * The strip is the only Workspace list: the sidebar lists the current
 * Workspace's Sessions, never the Workspaces.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  IconCloseFillRegular, IconFolderCloseRegular, IconFolderOpenRegular, IconPlusOutlineRegular, Menu, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { workspaceDisplayTitle } from '@deepseek-ai/dsh-api-workspace-controller/default-workspace'
import type { WorkspaceTabsProps } from '../contract/slots.ts'
import { WorkspacePickFlow } from '../WorkspacePicker.tsx'
import css from './WorkspaceTabs.module.css'

/** Close row of the tab's context menu; the menu may also carry the file-manager row. */
const CLOSE_TAB = 'close'
/** File-manager row of the tab's context menu, present only where the Host can open a directory. */
const OPEN_FOLDER = 'open-folder'

/** In-flight tab drag: source identity plus the insertion marker the pointer currently reports. */
interface TabDrag {
  /** Tab being dragged. */
  id: WorkspaceId
  /** Tab the marker sits on and which half (insert before/after it). */
  over: { id: WorkspaceId; half: 'before' | 'after' } | null
}

/** The open tab menu: its target plus the pointer position it opened at. */
interface TabMenu {
  id: WorkspaceId
  rect: DOMRect
}

/** Resolve the insertion side across one tab from the pointer's horizontal position. */
function tabHalf(event: { clientX: number; currentTarget: HTMLElement }): 'before' | 'after' {
  const rect = event.currentTarget.getBoundingClientRect()
  return event.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
}

/**
 * Render the Workspace tab strip.
 * @param props - `shell.header` owner share, the strip's directory-flow hole, injected actions, and the locale seat.
 * @returns the strip element tree.
 */
export function WorkspaceTabs({
  useWorkspaces,
  useCurrentWorkspace,
  useWorkspaceShortcuts,
  useDirectoryFlow,
  selectWorkspace,
  reorderWorkspace,
  closeWorkspace,
  createWorkspace,
  requestAddWorkspace,
  closeAddWorkspace,
  setDirectoryBusy,
  canOpenWorkspaceFolder,
  openWorkspaceFolder,
  notify,
  renderSlot,
  t,
}: WorkspaceTabsProps) {
  const workspaces = useWorkspaces(state => state.items)
  const currentId = useCurrentWorkspace(id => id)
  const shortcutState = useWorkspaceShortcuts(state => state)
  // The resolved name, not `t`, is the memo dependency: the bound seat keeps
  // its identity across a language switch.
  const defaultWorkspaceName = t('workspace.defaultName')
  const tabs = useMemo(
    () => workspaces.map(workspace => ({
      id: workspace.workspaceId,
      title: workspaceDisplayTitle(workspace.title, defaultWorkspaceName),
      path: workspace.path,
    })),
    [workspaces, defaultWorkspaceName],
  )
  const [drag, setDrag] = useState<TabDrag | null>(null)
  // A drop and the drag end that follows it report the same gesture once.
  const dropCommitted = useRef(false)
  const [menu, setMenu] = useState<TabMenu | null>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  // The Host answers desktop availability once per page: a headless or remote
  // browser Host has no file manager to hand the directory to, so the row stays
  // out of the menu. A failed probe reads like an unavailable desktop.
  const [folderAvailable, setFolderAvailable] = useState(false)
  useEffect(() => {
    let active = true
    canOpenWorkspaceFolder()
      .then((available) => { if (active) setFolderAvailable(available) })
      .catch(() => { if (active) setFolderAvailable(false) })
    return () => { active = false }
  }, [canOpenWorkspaceFolder])
  const menuItems = folderAvailable
    ? [
      { id: OPEN_FOLDER, label: t('tabs.openFolder'), icon: <IconFolderOpenRegular size={14} /> },
      { type: 'separator' as const, id: 'tab-actions' },
      { id: CLOSE_TAB, label: t('tabs.close'), icon: <IconCloseFillRegular size={14} /> },
    ]
    : [{ id: CLOSE_TAB, label: t('tabs.close'), icon: <IconCloseFillRegular size={14} /> }]

  /**
   * Apply the visible drop to the registry order without trusting the pointer
   * to still name a listed tab: an unresolvable anchor leaves the order alone.
   */
  const commitDrag = (active: TabDrag, over: NonNullable<TabDrag['over']>): void => {
    if (dropCommitted.current) return
    dropCommitted.current = true
    setDrag(null)
    if (active.id === over.id) return
    const ids = tabs.map(tab => tab.id)
    const sourceIndex = ids.indexOf(active.id)
    const rest = ids.filter(id => id !== active.id)
    const targetIndex = rest.indexOf(over.id)
    if (sourceIndex === -1 || targetIndex === -1) return
    const insertAt = targetIndex + (over.half === 'after' ? 1 : 0)
    if (insertAt === sourceIndex) return
    // An undefined anchor appends, which is what a drop past the last tab means.
    reorderWorkspace(active.id, rest[insertAt]).catch((reason: unknown) => {
      console.warn('workspace reorder rejected:', reason)
    })
  }

  const closeTab = (id: WorkspaceId): void => {
    closeWorkspace(id).catch((reason: unknown) => {
      console.warn('workspace close rejected:', reason)
    })
  }

  const openFolder = (path: string): void => {
    openWorkspaceFolder(path).catch((reason: unknown) => {
      notify({ kind: 'openFolderFailed', message: reason instanceof Error ? reason.message : String(reason) })
    })
  }

  return (
    <div className={css.bar}>
      <div className={css.strip} role="tablist" aria-label={t('tabs.aria')}>
        {tabs.map((tab) => {
          const selected = tab.id === currentId
          const marker = drag?.over?.id === tab.id ? drag.over.half : null
          return (
            <div
              key={tab.id}
              className={clsx(
                css.tabSlot,
                marker === 'before' && css.dropBefore,
                marker === 'after' && css.dropAfter,
              )}
            >
              <Tooltip label={tab.path} side="bottom" delayMs={600} disabled={drag !== null}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={clsx(
                    css.tab,
                    selected && css.tabActive,
                    drag?.id === tab.id && css.tabDragging,
                  )}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', tab.id)
                    dropCommitted.current = false
                    setDrag({ id: tab.id, over: null })
                  }}
                  onDragOver={(event) => {
                    if (drag === null || drag.id === tab.id) return
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    setDrag({ ...drag, over: { id: tab.id, half: tabHalf(event) } })
                  }}
                  onDrop={(event) => {
                    if (drag === null || drag.id === tab.id) return
                    event.preventDefault()
                    commitDrag(drag, { id: tab.id, half: tabHalf(event) })
                  }}
                  onDragEnd={() => {
                    if (drag !== null && drag.over !== null) commitDrag(drag, drag.over)
                    else setDrag(null)
                    dropCommitted.current = false
                  }}
                  onClick={() => {
                    if (tab.id !== currentId) selectWorkspace(tab.id)
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    setMenu({ id: tab.id, rect: new DOMRect(event.clientX, event.clientY, 0, 0) })
                  }}
                >
                  <IconFolderCloseRegular size={14} />
                  <span className={css.tabLabel}>{tab.title}</span>
                </button>
              </Tooltip>
            </div>
          )
        })}
      </div>
      <Tooltip label={t('workspace.add')} side="bottom" delayMs={500}>
        <button
          ref={addButton}
          type="button"
          className={css.addButton}
          aria-label={t('workspace.add')}
          onClick={() => { requestAddWorkspace() }}
        >
          <IconPlusOutlineRegular size={16} />
        </button>
      </Tooltip>
      <Menu
        open={menu !== null}
        anchor={null}
        items={menuItems}
        onSelect={(id) => {
          const target = menu
          setMenu(null)
          if (target === null) return
          const tab = tabs.find(candidate => candidate.id === target.id)
          /* v8 ignore next -- every row targets the tab the menu opened for. */
          if (tab === undefined) return
          if (id === OPEN_FOLDER) {
            openFolder(tab.path)
            return
          }
          if (id === CLOSE_TAB) closeTab(tab.id)
        }}
        onClose={() => { setMenu(null) }}
        portal
        getAnchorRect={() => menu?.rect ?? null}
        side="bottom"
      />
      {/* This surface's add flow: the same interaction the empty state hosts,
          adopted for the Workspace it returns. */}
      <WorkspacePickFlow
        t={t}
        open={shortcutState.addRequested}
        anchorRef={addButton}
        useWorkspaces={useWorkspaces}
        createWorkspace={createWorkspace}
        useDirectoryFlow={useDirectoryFlow}
        renderDirectoryFlow={owner => renderSlot('shell.header.directoryFlow', owner)}
        addOnly
        onBusyChange={setDirectoryBusy}
        onPick={(workspaceId) => {
          closeAddWorkspace()
          selectWorkspace(workspaceId)
        }}
        onClose={() => { closeAddWorkspace() }}
      />
    </div>
  )
}
