// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  handleEmbedInsertMessage,
  installEmbedInput,
  type EmbedInputDeps,
  type EmbedInsertResult,
} from '../src/client/embed-input.ts'

const SID = 'session-1' as SessionId

type DepsWithMocks = EmbedInputDeps & {
  insertFileReference: ReturnType<typeof vi.fn>
  sendResult: ReturnType<typeof vi.fn>
}

function deps(overrides: Partial<EmbedInputDeps> = {}): DepsWithMocks {
  const insertFileReference = (overrides.insertFileReference ?? vi.fn()) as unknown as ReturnType<typeof vi.fn>
  const sendResult = (overrides.sendResult ?? vi.fn()) as unknown as ReturnType<typeof vi.fn>
  return {
    isEmbed: overrides.isEmbed ?? (() => true),
    pageToken: overrides.pageToken ?? (() => 'token'),
    currentSessionId: overrides.currentSessionId ?? (() => SID),
    insertFileReference,
    sendResult,
  } as unknown as DepsWithMocks
}

describe('handleEmbedInsertMessage', () => {
  it('ignores messages outside the VS Code embed iframe', () => {
    const d = deps({ isEmbed: () => false })
    expect(handleEmbedInsertMessage(
      { source: 'dsh-vscode', type: 'insert-reference', id: '1', ref: '/a.ts', label: 'a.ts' }, d,
    )).toBeUndefined()
  })

  it('ignores messages this feature does not own', () => {
    const d = deps()
    expect(handleEmbedInsertMessage(
      { source: 'other', type: 'insert-reference', id: '1', ref: '/a.ts', label: 'a.ts' }, d,
    )).toBeUndefined()
    expect(handleEmbedInsertMessage({ source: 'dsh-vscode', type: 'ping', id: '1', ref: '/a.ts', label: 'a.ts' }, d))
      .toBeUndefined()
  })

  it('rejects messages without an id, reference, or label', () => {
    const d = deps()
    expect(handleEmbedInsertMessage({ source: 'dsh-vscode', type: 'insert-reference', id: '', ref: '/a.ts', label: 'a.ts' }, d))
      .toBeUndefined()
    expect(handleEmbedInsertMessage({ source: 'dsh-vscode', type: 'insert-reference', id: '1', ref: 7, label: 'a.ts' }, d))
      .toBeUndefined()
    expect(handleEmbedInsertMessage({ source: 'dsh-vscode', type: 'insert-reference', id: '1', ref: '', label: 'a.ts' }, d))
      .toBeUndefined()
    expect(handleEmbedInsertMessage({ source: 'dsh-vscode', type: 'insert-reference', id: '1', ref: '/a.ts' }, d))
      .toBeUndefined()
  })

  it('rejects a mismatched launch token', () => {
    const d = deps()
    expect(handleEmbedInsertMessage(
      { source: 'dsh-vscode', type: 'insert-reference', id: '1', token: 'wrong', ref: '/a.ts', label: 'a.ts' }, d,
    )).toEqual<EmbedInsertResult>({
      source: 'dsh-web',
      type: 'insert-reference-result',
      id: '1',
      ok: false,
      error: 'unauthorized',
    })
    expect(d.insertFileReference).not.toHaveBeenCalled()
  })

  it('reports when no session is current', () => {
    const d = deps({ currentSessionId: () => undefined })
    expect(handleEmbedInsertMessage(
      { source: 'dsh-vscode', type: 'insert-reference', id: '1', token: 'token', ref: '/a.ts', label: 'a.ts' }, d,
    )).toEqual<EmbedInsertResult>({
      source: 'dsh-web',
      type: 'insert-reference-result',
      id: '1',
      ok: false,
      error: 'no active session',
    })
  })

  it('inserts a file chip at the active composer caret and echoes success', () => {
    const d = deps()
    expect(handleEmbedInsertMessage(
      { source: 'dsh-vscode', type: 'insert-reference', id: '1', token: 'token', ref: 'C:\\a.ts:3-9', label: 'a.ts:3-9' }, d,
    )).toEqual<EmbedInsertResult>({ source: 'dsh-web', type: 'insert-reference-result', id: '1', ok: true })
    expect(d.insertFileReference).toHaveBeenCalledWith(SID, {
      source: 'reference',
      ref: 'C:\\a.ts:3-9',
      label: 'a.ts:3-9',
      appearance: 'file',
      clipboardText: 'C:\\a.ts:3-9',
    })
    expect(d.sendResult).not.toHaveBeenCalled()
  })

  it('echoes insert failures', () => {
    const d = deps({ insertFileReference: () => { throw new Error('boom') } })
    expect(handleEmbedInsertMessage(
      { source: 'dsh-vscode', type: 'insert-reference', id: '1', token: 'token', ref: '/a.ts', label: 'a.ts' }, d,
    )).toEqual<EmbedInsertResult>({
      source: 'dsh-web',
      type: 'insert-reference-result',
      id: '1',
      ok: false,
      error: 'boom',
    })
  })
})

describe('installEmbedInput', () => {
  it('listens for parent-frame messages and disposes cleanly', () => {
    const d = deps()
    const off = installEmbedInput(d)
    const message = { source: 'dsh-vscode', type: 'insert-reference', id: '1', token: 'token', ref: '/a.ts', label: 'a.ts' }
    window.dispatchEvent(new MessageEvent('message', { data: message, source: window }))
    expect(d.insertFileReference).toHaveBeenCalledTimes(1)
    expect(d.sendResult).toHaveBeenCalledWith({
      source: 'dsh-web',
      type: 'insert-reference-result',
      id: '1',
      ok: true,
    } satisfies EmbedInsertResult)

    off()
    window.dispatchEvent(new MessageEvent('message', { data: message, source: window }))
    expect(d.insertFileReference).toHaveBeenCalledTimes(1)
  })

  it('ignores messages not sent by the parent frame', () => {
    const d = deps()
    installEmbedInput(d)
    window.dispatchEvent(new MessageEvent('message', {
      data: { source: 'dsh-vscode', type: 'insert-reference', id: '1', token: 'token', ref: '/a.ts', label: 'a.ts' },
      source: null,
    }))
    expect(d.insertFileReference).not.toHaveBeenCalled()
  })
})
