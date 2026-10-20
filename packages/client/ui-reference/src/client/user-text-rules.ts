/** Forward file and folder recognition in original text, without Facts or discovery. */
import type { UserTextRule } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { fileReferenceLabel, parseFileReferenceTarget } from './reference-target.ts'

interface PathReferenceData {
  readonly path: string
  readonly label: string
  /** Optional 1-based first line of a ranged file reference. */
  readonly line?: number
  /** Optional 1-based last line of a ranged file reference. */
  readonly endLine?: number
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface UserTextDataMap {
    file: PathReferenceData
    folder: PathReferenceData
  }
}

/** One `@` token: an optionally quoted path plus an optional line fragment. */
const TOKENS = /(?<!\S)(@"[^"\n]+"(?:#L[1-9]\d*(?:-L[1-9]\d*)?)?|@[^\s]+)/gu

function nextPath(text: string, from: number, folder: boolean) {
  TOKENS.lastIndex = from
  for (let match = TOKENS.exec(text); match !== null; match = TOKENS.exec(text)) {
    const token = match[0]
    const raw = token.startsWith('@"') ? token : token.replace(/[.,;:!?，。；：！？]+$/u, '')
    if (raw.length <= 1) continue
    const target = parseFileReferenceTarget(raw)
    if (target === undefined) continue
    if (target.path.endsWith('/') !== folder) continue
    return {
      start: match.index,
      end: match.index + raw.length,
      data: {
        path: target.path,
        label: fileReferenceLabel(target.path, target.line, target.endLine),
        ...(target.line === undefined ? {} : { line: target.line }),
        ...(target.endLine === undefined ? {} : { endLine: target.endLine }),
      },
    }
  }
  return undefined
}

/** Return the nearest complete file reference using original whitespace boundaries. */
export const fileReferenceRule: UserTextRule<'file'> = {
  id: 'file',
  order: 30,
  match(text, from) {
    const candidate = nextPath(text, from, false)
    return candidate === undefined ? undefined : { id: 'file', ...candidate }
  },
}

/** Return the nearest trailing-slash directory using the file-reference grammar. */
export const folderReferenceRule: UserTextRule<'folder'> = {
  id: 'folder',
  order: 30,
  match(text, from) {
    const candidate = nextPath(text, from, true)
    return candidate === undefined ? undefined : { id: 'folder', ...candidate }
  },
}
