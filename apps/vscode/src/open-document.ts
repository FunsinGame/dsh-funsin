/**
 * The in-memory-document grammar of the page's open channel: what the embedded
 * GUI sends when it wants text that has no file on disk — a submitted plan, for
 * instance — shown in the editor window, and the tab name that document is
 * given. Node-only (no `vscode` import) so the frame relay and the extension
 * host validate input identically.
 */

/** One request to show in-memory text as an editor document. */
export interface OpenDocumentRequest {
  /** Document name the editor shows in its tab. */
  readonly title: string
  /** Complete document text. */
  readonly text: string
  /** Editor language id used for highlighting, such as `markdown`. */
  readonly language: string
}

/** One webview frame's document request, carrying the id its answer echoes. */
export interface OpenDocumentMessage extends OpenDocumentRequest {
  readonly id: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read one in-memory-document request from untrusted input.
 * @param value - decoded webview message payload.
 * @returns the request, or undefined when it names no usable document.
 */
export function readOpenDocumentRequest(value: unknown): OpenDocumentRequest | undefined {
  if (!isRecord(value)) return undefined
  const title = value.title
  const text = value.text
  const language = value.language
  if (typeof title !== 'string' || title.trim() === '') return undefined
  if (typeof text !== 'string') return undefined
  if (typeof language !== 'string' || language === '') return undefined
  return { title, text, language }
}

/**
 * Read one document request sent by the embedded GUI's frame.
 * @param value - the frame's message payload.
 * @returns the request with the frame's correlation id, or undefined when either is unusable.
 */
export function readOpenDocumentMessage(value: unknown): OpenDocumentMessage | undefined {
  if (!isRecord(value)) return undefined
  const id = value.id
  if (typeof id !== 'string' || id.length === 0) return undefined
  const request = readOpenDocumentRequest(value)
  return request === undefined ? undefined : { id, ...request }
}

/** The name a document with no usable title is shown under. */
const FALLBACK_TITLE = 'Document'

/**
 * The tab name one request's document address carries. Characters a URI path
 * cannot hold — path separators, the reserved punctuation Windows also rejects
 * in names, and control characters — become spaces, and runs of whitespace
 * collapse; a title that is left empty falls back to {@link FALLBACK_TITLE}.
 * @param title - the page's requested document title.
 * @returns the name the editor shows in the tab.
 */
export function documentTabName(title: string): string {
  const name = title.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return name === '' ? FALLBACK_TITLE : name
}
