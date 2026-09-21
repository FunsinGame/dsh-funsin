/**
 * VS Code webview embed support: the sidebar extension's page, and the channel
 * that asks it to show a file in the editor window. The embedded single-column
 * layout mounts no right Sidebar, so a file link there has no column to land
 * in; the extension answers every request, and an unanswered one reads as a
 * refusal so no caller claims a file nobody opened.
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

/** One command this page posts to the extension's webview frame. */
interface EmbedOpenFileCommand {
  readonly source: 'dsh-web'
  readonly type: 'open-file'
  readonly id: string
  readonly path: string
  readonly line?: number
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
    if (!isRecord(data) || data.source !== 'dsh-vscode' || data.type !== 'open-file-result') return
    if (typeof data.id !== 'string') return
    settle(data.id, data.ok === true)
  })

  return {
    open(path, line) {
      const id = `dsh-open-${String(++sequence)}`
      return new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => { settle(id, false) }, ANSWER_TIMEOUT_MS)
        waiting.set(id, (opened) => {
          clearTimeout(timer)
          resolve(opened)
        })
        const command: EmbedOpenFileCommand = {
          source: 'dsh-web', type: 'open-file', id, path, ...(line === undefined ? {} : { line }),
        }
        window.parent.postMessage(command, '*')
      })
    },
  }
}

/** The document's channel; created by the first request and kept for the page's lifetime. */
let channel: EmbedChannel | undefined

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
  channel ??= createChannel()
  return channel.open(path, line)
}
