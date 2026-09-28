/** The embed helper outside a DOM: browser halves are also applied by unit tests and workers. */
import { describe, expect, it } from 'vitest'
import { isVscodeEmbed, openDocumentInVscode, openFileInVscode } from '../src/vscode-embed.ts'

describe('vscode embed without a document', () => {
  it('reports no embed and refuses without reaching for a window', async () => {
    expect(typeof document).toBe('undefined')
    expect(isVscodeEmbed()).toBe(false)
    await expect(openFileInVscode('/proj/src/a.ts')).resolves.toBe(false)
    await expect(openDocumentInVscode({ title: 'Plan', text: '# Plan', language: 'markdown' })).resolves.toBe(false)
  })
})
