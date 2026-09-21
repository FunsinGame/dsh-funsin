import { describe, expect, it } from 'vitest'
import { formatFileReference, insertFailureMessage } from '../src/format'

const PATH = 'c:\\g-workspace\\Heyang-Projects\\All-Wiki\\余烬狩猎.md'
const NAME = '余烬狩猎.md'

describe('formatFileReference', () => {
  it('sends a whole file as its path and displays its name', () => {
    expect(formatFileReference(PATH, NAME)).toEqual({ ref: PATH, label: NAME })
  })

  it('appends a single-line selection as :line', () => {
    expect(formatFileReference(PATH, NAME, { startLine: 52, startCharacter: 0, endLine: 52, endCharacter: 5 }))
      .toEqual({ ref: `${PATH}:53`, label: `${NAME}:53` })
  })

  it('appends an empty caret as its current line', () => {
    expect(formatFileReference(PATH, NAME, { startLine: 52, startCharacter: 3, endLine: 52, endCharacter: 3 }))
      .toEqual({ ref: `${PATH}:53`, label: `${NAME}:53` })
  })

  it('appends a multi-line selection as an inclusive :start-end range', () => {
    expect(formatFileReference(PATH, NAME, { startLine: 52, startCharacter: 0, endLine: 62, endCharacter: 12 }))
      .toEqual({ ref: `${PATH}:53-63`, label: `${NAME}:53-63` })
  })

  it('does not include a line the selection only stops at the start of', () => {
    expect(formatFileReference(PATH, NAME, { startLine: 52, startCharacter: 0, endLine: 63, endCharacter: 0 }))
      .toEqual({ ref: `${PATH}:53-63`, label: `${NAME}:53-63` })
  })
})

describe('insertFailureMessage', () => {
  it('asks for an open session when the composer does not exist yet', () => {
    expect(insertFailureMessage('no active session')).toContain('打开一个会话')
  })

  it('points at Restart when the page rejected the launch token', () => {
    expect(insertFailureMessage('unauthorized')).toContain('Restart')
  })

  it('reads an unanswered request as a harness that is not ready', () => {
    expect(insertFailureMessage(undefined)).toContain('尚未就绪')
  })

  it('repeats any other reason the page reported', () => {
    expect(insertFailureMessage('conversation.input: session "a" resolved no binding'))
      .toContain('session "a" resolved no binding')
  })
})
