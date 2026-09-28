/**
 * VS Code webview embed support: the sidebar extension's page, and the channel
 * that asks it to show a file or an in-memory document in the editor window.
 * The embedded single-column layout mounts no right Sidebar, so a file link or
 * a document view has no column to land in; the extension answers every
 * request, and an unanswered one reads as a refusal so no caller claims a file
 * or document nobody opened.
 */

/**
 * Whether this document is the VS Code sidebar extension's embedded page.
 *
 * Browser-half plugins are also applied by unit tests and workers without a
 * DOM, where there is no embed to detect.
 * @returns true only inside the extension's embedded page.
 */
export function isVscodeEmbed(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.dshEmbed === '1'
}

/** One file this page asks the editor to show. */
interface EmbedOpenFileCommand {
  readonly source: 'dsh-web'
  readonly type: 'open-file'
  readonly id: string
  readonly path: string
  readonly line?: number
}

/** One text document with no file on disk this page asks the editor to show. */
interface EmbedOpenDocumentCommand {
  readonly source: 'dsh-web'
  readonly type: 'open-document'
  readonly id: string
  readonly title: string
  readonly text: string
  readonly language: string
}

/** One command this page posts to the extension's webview frame. */
type EmbedOpenCommand = EmbedOpenFileCommand | EmbedOpenDocumentCommand

/** One in-memory document handed to the hosting editor. */
export interface EmbedDocument {
  /** Document name the editor shows in its tab. */
  readonly title: string
  /** Complete document text. */
  readonly text: string
  /** Editor language id used for highlighting, such as `markdown`. */
  readonly language: string
}

/** How long one request waits for the frame's answer before it reads as a refusal. */
const ANSWER_TIMEOUT_MS = 2000

/** Request ids minted by this document; unique across every page module that asks. */
let sequence = 0

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** One channel over this window: the requests it waits on and the answers it accepts. */
interface EmbedChannel {
  open(path: string, line: number | undefined): Promise<boolean>
  openDocument(document: EmbedDocument): Promise<boolean>
}

/** Create the channel and start listening for the frame's answers. */
function createChannel(): EmbedChannel {
  const waiting = new Map<string, (opened: boolean) => void>()

  const settle = (id: string, opened: boolean): void => {
    const resolve = waiting.get(id)
    if (resolve === undefined) return
    waiting.delete(id)
    resolve(opened)
  }

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window.parent) return
    const data: unknown = event.data
    if (!isRecord(data) || data.source !== 'dsh-vscode') return
    // One answer per request kind; both mean the same outcome for the caller.
    if (data.type !== 'open-file-result' && data.type !== 'open-document-result') return
    if (typeof data.id !== 'string') return
    settle(data.id, data.ok === true)
  })

  const request = (command: (id: string) => EmbedOpenCommand): Promise<boolean> => {
    const id = `dsh-open-${String(++sequence)}`
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => { settle(id, false) }, ANSWER_TIMEOUT_MS)
      waiting.set(id, (opened) => {
        clearTimeout(timer)
        resolve(opened)
      })
      window.parent.postMessage(command(id), '*')
    })
  }

  return {
    open: (path, line) => request(id => ({
      source: 'dsh-web', type: 'open-file', id, path, ...(line === undefined ? {} : { line }),
    })),
    openDocument: document => request(id => ({
      source: 'dsh-web',
      type: 'open-document',
      id,
      title: document.title,
      text: document.text,
      language: document.language,
    })),
  }
}

/** The document's channel; created by the first request and kept for the page's lifetime. */
let channel: EmbedChannel | undefined

/** The page's channel, opening it on the first request. */
function embedChannel(): EmbedChannel {
  channel ??= createChannel()
  return channel
}

/**
 * Ask the hosting VS Code extension to show one file in the editor window.
 *
 * Reads as a refusal (`false`) outside the VS Code embed, for a request the
 * frame never answers, and for a file that editor could not open, so a caller
 * with its own surface keeps it for every case it does not handle.
 * @param path - absolute path, or one the extension resolves against its workspace.
 * @param line - optional 1-based line to reveal.
 * @returns whether the editor showed the file.
 */
export async function openFileInVscode(path: string, line?: number): Promise<boolean> {
  if (!isVscodeEmbed()) return false
  return embedChannel().open(path, line)
}

/**
 * Ask the hosting VS Code extension to show one document that has no file on
 * disk — text this page holds, such as a submitted plan — in the editor window.
 *
 * The extension names the editor tab after `title` and keeps the text under
 * that name for the window's lifetime, so asking for the same title again
 * refreshes the open tab instead of opening a second one. Reads as a refusal
 * (`false`) under the same conditions as {@link openFileInVscode}.
 * @param document - the document's tab name, complete text, and editor language.
 * @returns whether the editor showed the document.
 */
export async function openDocumentInVscode(document: EmbedDocument): Promise<boolean> {
  if (!isVscodeEmbed()) return false
  return embedChannel().openDocument(document)
}
