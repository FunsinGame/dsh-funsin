/**
 * Status-bar entry for the current Workspace: the name the tab strip shows,
 * kept current through the navigation service's published `currentWorkspace`
 * source, so switching tabs, opening a Session from search, or closing the
 * current Workspace updates this item without any bar-level state.
 */
import { IconFolderCloseRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { workspaceDisplayTitle } from '@deepseek-ai/dsh-api-workspace-controller/default-workspace'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { CurrentWorkspaceInjected } from '../contract/slots.ts'
import css from './WorkspaceStatusItem.module.css'

/** Status-item props: the status-bar seat, the current-Workspace hook, and the locale seat. */
export type WorkspaceStatusItemProps =
  & PropsRuntime<'shell.statusbar.left'>
  & InjectFace<CurrentWorkspaceInjected>
  & PropsLocale<'workspace'>

/**
 * Render the current Workspace's status entry.
 * @param props - global Workspace list hook, current-Workspace hook, locale seat.
 * @returns the entry, or nothing while the registry has no current Workspace.
 */
export function WorkspaceStatusItem({ useWorkspaces, useCurrentWorkspace, t }: WorkspaceStatusItemProps) {
  const workspaces = useWorkspaces(state => state.items)
  const currentId = useCurrentWorkspace(id => id)
  const current = currentId === undefined ? undefined : workspaces.find(item => item.workspaceId === currentId)
  if (current === undefined) return null
  return (
    <span className={css.item} data-workspace-status>
      <IconFolderCloseRegular size={12} />
      <span className={css.title}>{workspaceDisplayTitle(current.title, t('workspace.defaultName'))}</span>
    </span>
  )
}
