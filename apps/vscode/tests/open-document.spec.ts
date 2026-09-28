import { describe, expect, it } from 'vitest'
import { documentTabName, readOpenDocumentMessage, readOpenDocumentRequest } from '../src/open-document'

describe('readOpenDocumentRequest', () => {
  it('accepts a titled text document with its language', () => {
    expect(readOpenDocumentRequest({ title: 'Saved plan', text: '# Saved plan', language: 'markdown' }))
      .toEqual({ title: 'Saved plan', text: '# Saved plan', language: 'markdown' })
  })

  it('accepts empty text, which names a document with no content', () => {
    expect(readOpenDocumentRequest({ title: 'Plan', text: '', language: 'markdown' }))
      .toEqual({ title: 'Plan', text: '', language: 'markdown' })
  })

  it('rejects payloads that name no usable document', () => {
    expect(readOpenDocumentRequest(undefined)).toBeUndefined()
    expect(readOpenDocumentRequest('Saved plan')).toBeUndefined()
    expect(readOpenDocumentRequest(['Saved plan'])).toBeUndefined()
    expect(readOpenDocumentRequest({})).toBeUndefined()
    expect(readOpenDocumentRequest({ title: '   ', text: 'body', language: 'markdown' })).toBeUndefined()
    expect(readOpenDocumentRequest({ title: 7, text: 'body', language: 'markdown' })).toBeUndefined()
    expect(readOpenDocumentRequest({ title: 'Plan', text: 7, language: 'markdown' })).toBeUndefined()
    expect(readOpenDocumentRequest({ title: 'Plan', text: 'body', language: '' })).toBeUndefined()
    expect(readOpenDocumentRequest({ title: 'Plan', text: 'body' })).toBeUndefined()
  })
})

describe('readOpenDocumentMessage', () => {
  it('reads the request with the frame correlation id', () => {
    expect(readOpenDocumentMessage({ type: 'dsh.open-document', id: 'dsh-open-1', title: 'Plan', text: '# Plan', language: 'markdown' }))
      .toEqual({ id: 'dsh-open-1', title: 'Plan', text: '# Plan', language: 'markdown' })
  })

  it('rejects a message without an id or without a usable request', () => {
    expect(readOpenDocumentMessage(undefined)).toBeUndefined()
    expect(readOpenDocumentMessage({ title: 'Plan', text: '# Plan', language: 'markdown' })).toBeUndefined()
    expect(readOpenDocumentMessage({ id: '', title: 'Plan', text: '# Plan', language: 'markdown' })).toBeUndefined()
    expect(readOpenDocumentMessage({ id: 7, title: 'Plan', text: '# Plan', language: 'markdown' })).toBeUndefined()
    expect(readOpenDocumentMessage({ id: 'dsh-open-1', title: '', text: '# Plan', language: 'markdown' })).toBeUndefined()
  })
})

describe('documentTabName', () => {
  it('keeps an ordinary plan title as the tab name', () => {
    expect(documentTabName('Saved plan')).toBe('Saved plan')
  })

  it('replaces characters a document path cannot hold', () => {
    expect(documentTabName('a/b\\c:d*e?f"g<h>i|j')).toBe('a b c d e f g h i j')
    expect(documentTabName('line\u0000break\u007f')).toBe('line break')
  })

  it('collapses whitespace and falls back when nothing is left', () => {
    expect(documentTabName('  spaced   title  ')).toBe('spaced title')
    expect(documentTabName('///')).toBe('Document')
  })
})
