import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  readOpenFileMessage,
  readOpenFileRequest,
  resolveWorkspaceFilePath,
} from '../src/open-file'

describe('readOpenFileRequest', () => {
  it('accepts a path with an optional 1-based line', () => {
    expect(readOpenFileRequest({ path: 'src/a.ts' })).toEqual({ path: 'src/a.ts' })
    expect(readOpenFileRequest({ path: 'src/a.ts', line: 7 })).toEqual({ path: 'src/a.ts', line: 7 })
  })

  it('rejects payloads that name no usable file or line', () => {
    expect(readOpenFileRequest(undefined)).toBeUndefined()
    expect(readOpenFileRequest('src/a.ts')).toBeUndefined()
    expect(readOpenFileRequest(['src/a.ts'])).toBeUndefined()
    expect(readOpenFileRequest({})).toBeUndefined()
    expect(readOpenFileRequest({ path: '' })).toBeUndefined()
    expect(readOpenFileRequest({ path: 7 })).toBeUndefined()
    expect(readOpenFileRequest({ path: 'src/a.ts', line: 0 })).toBeUndefined()
    expect(readOpenFileRequest({ path: 'src/a.ts', line: 1.5 })).toBeUndefined()
    expect(readOpenFileRequest({ path: 'src/a.ts', line: '7' })).toBeUndefined()
  })
})

describe('readOpenFileMessage', () => {
  it('reads the request with the frame correlation id', () => {
    expect(readOpenFileMessage({ type: 'dsh.open-file', id: 'dsh-open-1', path: 'src/a.ts', line: 3 }))
      .toEqual({ id: 'dsh-open-1', path: 'src/a.ts', line: 3 })
  })

  it('rejects a message without an id or without a usable request', () => {
    expect(readOpenFileMessage(undefined)).toBeUndefined()
    expect(readOpenFileMessage({ path: 'src/a.ts' })).toBeUndefined()
    expect(readOpenFileMessage({ id: '', path: 'src/a.ts' })).toBeUndefined()
    expect(readOpenFileMessage({ id: 7, path: 'src/a.ts' })).toBeUndefined()
    expect(readOpenFileMessage({ id: 'dsh-open-1', path: '' })).toBeUndefined()
  })
})

describe('resolveWorkspaceFilePath', () => {
  it('returns an absolute path as written', () => {
    expect(resolveWorkspaceFilePath(resolve(tmpdir(), 'a.ts'), [])).toBe(resolve(tmpdir(), 'a.ts'))
  })

  it('resolves a relative path against the first folder that holds it', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-vscode-open-file-')))
    const first = join(root, 'first')
    const second = join(root, 'second')
    mkdirSync(join(second, 'src'), { recursive: true })
    writeFileSync(join(second, 'src', 'a.ts'), 'a')

    expect(resolveWorkspaceFilePath('src/a.ts', [first, second]))
      .toBe(join(second, 'src', 'a.ts'))
  })

  it('falls back to the first folder for a path no folder holds', () => {
    expect(resolveWorkspaceFilePath('src/missing.ts', ['C:/first', 'C:/second']))
      .toBe(resolve('C:/first', 'src/missing.ts'))
  })

  it('keeps the relative path when no folder is open', () => {
    expect(resolveWorkspaceFilePath('src/a.ts', [])).toBe('src/a.ts')
  })
})
