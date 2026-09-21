// @vitest-environment jsdom
/** The page half of the VS Code embed file-open channel. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isVscodeEmbed, openFileInVscode } from '../src/vscode-embed.ts'

/** Answer one posted command the way the extension's webview frame does. */
function answer(command: Record<string, unknown>, ok: boolean): void {
  window.dispatchEvent(new MessageEvent('message', {
    data: { source: 'dsh-vscode', type: 'open-file-result', id: command.id, ok },
    source: window,
  }))
}

/** Capture every posted command and answer each one immediately. */
function capture(ok: boolean): Record<string, unknown>[] {
  const posted: Record<string, unknown>[] = []
  vi.spyOn(window.parent, 'postMessage').mockImplementation((message: unknown) => {
    const command = message as Record<string, unknown>
    posted.push(command)
    answer(command, ok)
  })
  return posted
}

/** Capture the posted commands without answering them. */
function captureUnanswered(): Record<string, unknown>[] {
  const posted: Record<string, unknown>[] = []
  vi.spyOn(window.parent, 'postMessage').mockImplementation((message: unknown) => {
    posted.push(message as Record<string, unknown>)
  })
  return posted
}

afterEach(() => {
  vi.restoreAllMocks()
  delete document.documentElement.dataset.dshEmbed
})

describe('isVscodeEmbed', () => {
  it('reads the embed mark the page shell sets', () => {
    expect(isVscodeEmbed()).toBe(false)
    document.documentElement.dataset.dshEmbed = '1'
    expect(isVscodeEmbed()).toBe(true)
  })
})

describe('openFileInVscode', () => {
  it('refuses without asking the frame outside the embed', async () => {
    const posted = capture(true)
    await expect(openFileInVscode('/proj/src/a.ts')).resolves.toBe(false)
    expect(posted).toEqual([])
  })

  it('posts the path and line, and resolves on the frame\'s answer', async () => {
    document.documentElement.dataset.dshEmbed = '1'
    const posted = capture(true)
    await expect(openFileInVscode('/proj/src/a.ts', 7)).resolves.toBe(true)
    expect(posted).toHaveLength(1)
    expect(posted[0]).toMatchObject({
      source: 'dsh-web', type: 'open-file', path: '/proj/src/a.ts', line: 7,
    })
    expect(typeof posted[0]?.id).toBe('string')
  })

  it('posts no line when the request names none', async () => {
    document.documentElement.dataset.dshEmbed = '1'
    const posted = capture(true)
    await expect(openFileInVscode('/proj/src/a.ts')).resolves.toBe(true)
    expect(posted).toHaveLength(1)
    expect(posted[0]).toMatchObject({ source: 'dsh-web', type: 'open-file', path: '/proj/src/a.ts' })
    expect('line' in (posted[0] ?? {})).toBe(false)
  })

  it('reads a refused request as failure and ignores an answer for another request', async () => {
    document.documentElement.dataset.dshEmbed = '1'
    const posted = captureUnanswered()
    const pending = openFileInVscode('/proj/src/a.ts', 3)
    window.dispatchEvent(new MessageEvent('message', {
      data: { source: 'dsh-vscode', type: 'open-file-result', id: 'dsh-open-999', ok: true },
      source: window,
    }))
    answer(posted[0]!, false)
    await expect(pending).resolves.toBe(false)
  })

  it('ignores messages that are not this channel\'s answer from the parent frame', async () => {
    document.documentElement.dataset.dshEmbed = '1'
    const posted = captureUnanswered()
    const pending = openFileInVscode('/proj/src/a.ts')
    const foreign: Array<[unknown, MessageEventSource | null]> = [
      [{ source: 'dsh-vscode', type: 'open-file-result', id: 'dsh-open-1', ok: true }, null],
      ['not a message', window],
      [{ source: 'other', type: 'open-file-result', id: 'dsh-open-1', ok: true }, window],
      [{ source: 'dsh-vscode', type: 'insert-text', id: 'dsh-open-1' }, window],
      [{ source: 'dsh-vscode', type: 'open-file-result', id: 7, ok: true }, window],
      [{ source: 'dsh-vscode', type: 'open-file-result' }, window],
    ]
    for (const [data, source] of foreign) {
      window.dispatchEvent(new MessageEvent('message', { data, source }))
    }
    answer(posted[0]!, true)
    await expect(pending).resolves.toBe(true)
  })

  it('refuses a request the frame never answers', async () => {
    document.documentElement.dataset.dshEmbed = '1'
    vi.useFakeTimers()
    try {
      captureUnanswered()
      const pending = openFileInVscode('/proj/src/a.ts', 2)
      await vi.advanceTimersByTimeAsync(2000)
      await expect(pending).resolves.toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps one channel for every request this document makes', async () => {
    document.documentElement.dataset.dshEmbed = '1'
    const posted = capture(true)
    await expect(openFileInVscode('/proj/src/a.ts')).resolves.toBe(true)
    await expect(openFileInVscode('/proj/src/b.ts')).resolves.toBe(true)
    expect(posted.map(command => command['path'])).toEqual(['/proj/src/a.ts', '/proj/src/b.ts'])
    expect(posted[0]?.['id']).not.toBe(posted[1]?.['id'])
  })
})
