/**
 * VS Code embed input: receives `insert-reference` messages from the sidebar
 * extension's webview frame and places the referenced file at the composer
 * caret as an atomic reference chip. The parent frame forwards the extension
 * message after checking the launch token embedded in the iframe URL, and this
 * page echoes the outcome back so the extension can surface a failure.
 */

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ReferenceInsert } from './contract/draft-editor.ts'

/**
 * The composer's file-reference source. `ui-reference` registers this name and
 * owns what a file chip does — click-to-open and the model form of its id — so
 * an address sent from the extension becomes an ordinary file reference.
 */
const FILE_REFERENCE_SOURCE = 'reference'

/** Message sent from the VS Code extension through the webview frame. */
export interface EmbedReferenceMessage {
  readonly source: 'dsh-vscode'
  readonly type: 'insert-reference'
  readonly id: string
  readonly token: string | undefined
  /** Reference id: an absolute path, plus `:line` or `:start-end` for a range. */
  readonly ref: string
  /** Chip label: the file name with its extension, plus the same line range. */
  readonly label: string
}

/** Result echoed back to the VS Code extension through the webview frame. */
export interface EmbedInsertResult {
  readonly source: 'dsh-web'
  readonly type: 'insert-reference-result'
  readonly id: string
  readonly ok: boolean
  readonly error?: string
}

/** Dependencies the embed-input handler needs from the Conversation plugin. */
export interface EmbedInputDeps {
  /** Whether the document is loaded in the VS Code sidebar iframe. */
  isEmbed(): boolean
  /** Launch token from the current page URL, if present. */
  pageToken(): string | undefined
  /** Currently selected session, if any. */
  currentSessionId(): SessionId | undefined
  /** Place one file-reference chip at the composer caret of one session. */
  insertFileReference(sessionId: SessionId, reference: ReferenceInsert): void
  /** Deliver an insert outcome back to the parent webview frame. */
  sendResult(result: EmbedInsertResult): void
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Handle one inbound embed-insert message. Returns a result to echo, or
 * undefined when the message is not one this feature owns.
 * @param value - raw `message.data` from the parent frame.
 * @param deps - embed-mode, token, session, and insert dependencies.
 * @returns the echo result, or undefined for non-feature messages.
 */
export function handleEmbedInsertMessage(value: unknown, deps: EmbedInputDeps): EmbedInsertResult | undefined {
  if (!deps.isEmbed()) return undefined
  if (!isRecord(value) || value.source !== 'dsh-vscode' || value.type !== 'insert-reference') return undefined
  const id = value.id
  const ref = value.ref
  const label = value.label
  if (typeof id !== 'string' || id === '') return undefined
  if (typeof ref !== 'string' || ref === '' || typeof label !== 'string' || label === '') return undefined
  const token = deps.pageToken()
  if (token === undefined || value.token !== token) {
    return { source: 'dsh-web', type: 'insert-reference-result', id, ok: false, error: 'unauthorized' }
  }
  const sessionId = deps.currentSessionId()
  if (sessionId === undefined) {
    return { source: 'dsh-web', type: 'insert-reference-result', id, ok: false, error: 'no active session' }
  }
  try {
    deps.insertFileReference(sessionId, {
      source: FILE_REFERENCE_SOURCE,
      ref,
      label,
      appearance: 'file',
      clipboardText: ref,
    })
    return { source: 'dsh-web', type: 'insert-reference-result', id, ok: true }
  } catch (error) {
    return {
      source: 'dsh-web',
      type: 'insert-reference-result',
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Install the window-message listener that feeds the VS Code sidebar.
 * @param deps - embed-input dependencies.
 * @returns a disposer that removes the listener.
 */
export function installEmbedInput(deps: EmbedInputDeps): () => void {
  const listener = (event: MessageEvent): void => {
    if (event.source !== window.parent) return
    const result = handleEmbedInsertMessage(event.data, deps)
    if (result !== undefined) deps.sendResult(result)
  }
  window.addEventListener('message', listener)
  return () => { window.removeEventListener('message', listener) }
}
