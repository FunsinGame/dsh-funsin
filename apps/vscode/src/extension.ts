/**
 * The DeepSeek Harness VS Code extension. It lazily boots the harness `web`
 * profile as a child process bound to the open workspace, then embeds the full
 * DeepSeek Harness GUI in the activity-bar view. Because the harness boots with
 * the workspace as its working directory, the GUI's session list shows exactly
 * that workspace's conversations, and clicking a session opens its chat.
 */

import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join, resolve } from 'node:path'
import * as vscode from 'vscode'
import { startBridge, type BridgeHandlers, type RunningBridge } from './bridge'
import { buildProfileArgs, resolveLaunch, type WebFlags } from './cli'
import { formatFileReference, insertFailureMessage, type FileReference } from './format'
import { readOpenFileMessage, resolveWorkspaceFilePath, type OpenFileMessage } from './open-file'
import { documentTabName, readOpenDocumentMessage, type OpenDocumentMessage, type OpenDocumentRequest } from './open-document'
import { startServer, type RunningServer } from './server'

const OUTPUT_NAME = 'DeepSeek Harness'
const VIEW_ID = 'dsh.web'
/** URI scheme of the read-only documents the embedded page supplies as text. */
const PAGE_DOCUMENT_SCHEME = 'dsh-doc'

/** Module-scope so `deactivate` can stop the harness on extension shutdown. */
let server: RunningServer | undefined
let booting: Promise<RunningServer | undefined> | undefined
let webProvider: WebViewProvider | undefined
let bridge: RunningBridge | undefined
let bridgePromise: Promise<RunningBridge | undefined> | undefined

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

interface PendingInsert {
  resolve(outcome: InsertOutcome): void
  timer: ReturnType<typeof setTimeout>
}

/** Outcome of one composer insert request. */
interface InsertOutcome {
  /** Whether the embedded composer took the reference. */
  readonly ok: boolean
  /** The page's refusal reason; absent when no page answered. */
  readonly error?: string
}

class WebViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined
  private connected = false
  private messageListener: vscode.Disposable | undefined
  private readonly pending = new Map<string, PendingInsert>()
  private ready: Promise<void> = Promise.resolve()
  private resolveReady: (() => void) | undefined
  private seq = 0

  constructor(
    private readonly boot: () => Promise<RunningServer | undefined>,
    private readonly openFileInEditor: (path: string, line: number | undefined) => Promise<boolean>,
    private readonly openDocumentInEditor: (request: OpenDocumentRequest) => Promise<boolean>,
    private readonly log: (line: string) => void,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view
    this.connected = false
    this.resetReady()
    this.log('[dsh-vscode] view: resolved')
    view.webview.options = { enableScripts: true }
    this.messageListener?.dispose()
    this.messageListener = view.webview.onDidReceiveMessage((message) => {
      if (!isRecord(message)) return
      if (message.type === 'dsh.ready') {
        this.resolveReady?.()
        return
      }
      if (message.type === 'dsh.open-file') {
        const request = readOpenFileMessage(message)
        if (request !== undefined) void this.openInEditor(request)
        return
      }
      if (message.type === 'dsh.open-document') {
        const request = readOpenDocumentMessage(message)
        if (request !== undefined) void this.openDocument(request)
        return
      }
      if (message.type === 'dsh.frame-log') {
        this.log(`[dsh-vscode] frame: ${String(message.event)} ${JSON.stringify(message.detail ?? null)}`)
        return
      }
      if (message.type !== 'dsh.insert-reference-result' || typeof message.id !== 'string') return
      const pending = this.pending.get(message.id)
      if (pending === undefined) return
      clearTimeout(pending.timer)
      this.pending.delete(message.id)
      pending.resolve({
        ok: message.ok === true,
        ...(typeof message.error === 'string' ? { error: message.error } : {}),
      })
    })
    view.webview.html = this.shell('<p class="hint">正在启动 DeepSeek Harness…</p>')
    void this.connect()
  }

  /**
   * Open one frame-reported path and answer the frame, which resolves the
   * embedded page's pending open.
   * @param request - the validated request and the id its answer echoes.
   */
  private async openInEditor(request: OpenFileMessage): Promise<void> {
    const ok = await this.openFileInEditor(request.path, request.line)
    const webview = this.view?.webview
    if (webview === undefined) return
    try {
      await webview.postMessage({ type: 'dsh.open-file-result', id: request.id, ok })
    } catch {
      // The view was disposed while the file opened; the page's own timeout answers instead.
    }
  }

  /**
   * Show one frame-supplied document and answer the frame, which resolves the
   * embedded page's pending open.
   * @param request - the validated document request and the id its answer echoes.
   */
  private async openDocument(request: OpenDocumentMessage): Promise<void> {
    const ok = await this.openDocumentInEditor(request)
    const webview = this.view?.webview
    if (webview === undefined) return
    try {
      await webview.postMessage({ type: 'dsh.open-document-result', id: request.id, ok })
    } catch {
      // The view was disposed while the document opened; the page's own timeout answers instead.
    }
  }

  async connect(): Promise<void> {
    this.log('[dsh-vscode] view: connecting')
    const running = await this.boot()
    const webview = this.view?.webview
    if (webview === undefined) {
      this.log('[dsh-vscode] view: connecting without a view')
      return
    }
    if (running === undefined) {
      this.connected = false
      this.log('[dsh-vscode] view: the harness did not start')
      webview.html = this.shell('<p class="hint error">DeepSeek Harness 启动失败。</p>')
      return
    }
    // Keep the launch token from the printed URL and scope the embedded session
    // list to the open workspace: its path rides the URL so the web filters
    // `session.list` rows by `cwd`.
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd()
    const url = new URL(running.url)
    url.searchParams.set('embed', '1')
    url.searchParams.set('cwd', cwd)
    this.resetReady()
    this.log(`[dsh-vscode] view: loading ${url.origin}${url.pathname} embed=${String(url.searchParams.get('embed'))}`)
    webview.html = this.frame(url.toString())
    this.connected = true
  }

  offline(): void {
    const webview = this.view?.webview
    if (webview === undefined) return
    this.connected = false
    this.log('[dsh-vscode] view: offline')
    this.resetReady()
    webview.html = this.shell('<p class="hint">DeepSeek Harness 已停止——运行「DeepSeek Harness: Open」重新启动。</p>')
  }

  /**
   * Send one file reference into the embedded harness input. Focuses the
   * sidebar view and waits for the harness iframe before posting; an
   * unanswered request reads as a failure without a reason, while the page's
   * own answer carries the one it refused with.
   * @param reference - the reference id and chip label to insert.
   * @returns whether the composer took the reference, and why it did not.
   */
  async sendToHarness(reference: FileReference): Promise<InsertOutcome> {
    if (this.view === undefined) {
      this.log('[dsh-vscode] send: no sidebar view yet; focusing it')
      await vscode.commands.executeCommand(`${VIEW_ID}.focus`)
      if (this.view === undefined) {
        this.log('[dsh-vscode] send: the sidebar view did not resolve')
        return { ok: false }
      }
    }
    if (!this.connected) {
      this.log('[dsh-vscode] send: the webview is not connected; booting the harness')
      const running = await this.boot()
      if (running === undefined || this.view === undefined) {
        this.log('[dsh-vscode] send: the harness did not boot')
        return { ok: false }
      }
      await this.connect()
      if (!this.connected) {
        this.log('[dsh-vscode] send: the webview did not connect')
        return { ok: false }
      }
    }
    const ready = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 5000)
      void this.ready.then(() => {
        clearTimeout(timer)
        resolve(true)
      })
    })
    if (!ready) {
      this.log('[dsh-vscode] send: the embedded frame never posted dsh.ready')
      return { ok: false }
    }
    const webview = this.view.webview
    const id = `dsh-${String(++this.seq)}`
    return new Promise<InsertOutcome>((resolve) => {
      let settled = false
      const settle = (outcome: InsertOutcome): void => {
        if (settled) return
        settled = true
        this.log(`[dsh-vscode] send ${id}: ${outcome.ok ? 'accepted' : `refused (${outcome.error ?? 'no answer from the page'})`}`)
        resolve(outcome)
      }
      const timer = setTimeout(() => {
        this.pending.delete(id)
        settle({ ok: false })
      }, 5000)
      this.pending.set(id, { resolve: settle, timer })
      const message = { type: 'dsh.insert-reference', id, ref: reference.ref, label: reference.label }
      this.log(`[dsh-vscode] send ${id}: posting ${reference.ref}`)
      try {
        const posted = webview.postMessage(message)
        if (posted !== undefined) {
          void Promise.resolve(posted).then((accepted) => {
            if (accepted !== false) return
            if (!this.pending.delete(id)) return
            this.log(`[dsh-vscode] send ${id}: the webview refused delivery`)
            settle({ ok: false })
          }).catch((error: unknown) => {
            if (!this.pending.delete(id)) return
            this.log(`[dsh-vscode] send ${id}: delivery failed: ${errorMessage(error)}`)
            settle({ ok: false })
          })
        }
      } catch (error) {
        if (this.pending.delete(id)) {
          this.log(`[dsh-vscode] send ${id}: postMessage threw: ${errorMessage(error)}`)
          settle({ ok: false })
        }
      }
    })
  }

  dispose(): void {
    this.messageListener?.dispose()
    this.messageListener = undefined
    for (const { timer, resolve } of this.pending.values()) {
      clearTimeout(timer)
      resolve({ ok: false })
    }
    this.pending.clear()
  }

  private resetReady(): void {
    this.resolveReady = undefined
    this.ready = new Promise<void>((resolve) => { this.resolveReady = resolve })
  }

  private frame(url: string): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src http://127.0.0.1:*;">
<style>
html, body { margin: 0; padding: 0; height: 100%; background: var(--vscode-editor-background); }
iframe { width: 100%; height: 100%; border: 0; display: block; }
</style>
</head>
<body>
<iframe id="dsh" src="${url}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals" allow="clipboard-read; clipboard-write"></iframe>
<script>
(function () {
  const vscode = acquireVsCodeApi()
  const log = (event, detail) => {
    try { vscode.postMessage({ type: 'dsh.frame-log', event, detail }) } catch (error) { /* the host is gone */ }
  }
  vscode.postMessage({ type: 'dsh.ready' })
  const iframe = document.getElementById('dsh')
  const params = new URL(iframe.getAttribute('src')).searchParams
  const origin = new URL(iframe.getAttribute('src')).origin
  const token = params.get('token') || ''
  log('frame-boot', { origin, embed: params.get('embed'), cwd: params.get('cwd'), tokenLength: token.length })
  let loaded = false
  const pending = []
  const awaiting = new Map()
  iframe.addEventListener('load', () => {
    loaded = true
    log('iframe-load', { queued: pending.length })
    for (const message of pending) iframe.contentWindow.postMessage(message, origin)
    pending.length = 0
  })
  iframe.addEventListener('error', () => { log('iframe-error', {}) })
  window.addEventListener('message', (event) => {
    const data = event.data
    if (!data || data.type !== 'dsh.insert-reference' || typeof data.id !== 'string') return
    if (typeof data.ref !== 'string' || typeof data.label !== 'string') return
    const message = { source: 'dsh-vscode', type: 'insert-reference', id: data.id, ref: data.ref, label: data.label, token }
    log('relay', { id: data.id, loaded, queued: !loaded })
    if (loaded) iframe.contentWindow.postMessage(message, origin)
    else pending.push(message)
    // A page carrying no embed listener answers nothing at all; report that as
    // the refusal it is instead of leaving the extension to time out blindly.
    const previous = awaiting.get(data.id)
    if (previous !== undefined) clearTimeout(previous)
    awaiting.set(data.id, setTimeout(() => {
      awaiting.delete(data.id)
      log('page-silent', { id: data.id, loaded })
      vscode.postMessage({ type: 'dsh.insert-reference-result', id: data.id, ok: false, error: 'the embedded page did not answer' })
    }, 4000))
  })
  window.addEventListener('message', (event) => {
    if (event.source !== iframe.contentWindow) return
    const data = event.data
    if (!data || data.source !== 'dsh-web') return
    if (data.type === 'insert-reference-result' && typeof data.id === 'string') {
      const timer = awaiting.get(data.id)
      if (timer !== undefined) {
        clearTimeout(timer)
        awaiting.delete(data.id)
      }
      log('page-result', { id: data.id, ok: data.ok === true, error: data.error })
      vscode.postMessage({ type: 'dsh.insert-reference-result', id: data.id, ok: data.ok === true, error: data.error })
      return
    }
    if (data.type === 'open-file' && typeof data.id === 'string' && typeof data.path === 'string') {
      log('page-open-file', { id: data.id, path: data.path, line: data.line })
      vscode.postMessage({ type: 'dsh.open-file', id: data.id, path: data.path, line: data.line })
      return
    }
    if (data.type === 'open-document' && typeof data.id === 'string' && typeof data.title === 'string'
      && typeof data.text === 'string' && typeof data.language === 'string') {
      log('page-open-document', { id: data.id, title: data.title, language: data.language, length: data.text.length })
      vscode.postMessage({
        type: 'dsh.open-document', id: data.id, title: data.title, text: data.text, language: data.language,
      })
    }
  })
  window.addEventListener('message', (event) => {
    const data = event.data
    if (!data || typeof data.id !== 'string') return
    if (data.type !== 'dsh.open-file-result' && data.type !== 'dsh.open-document-result') return
    if (!loaded) return
    const type = data.type === 'dsh.open-file-result' ? 'open-file-result' : 'open-document-result'
    iframe.contentWindow.postMessage({ source: 'dsh-vscode', type, id: data.id, ok: data.ok === true }, origin)
  })
})()
</script>
</body>
</html>`
  }

  private shell(body: string): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; frame-src http://127.0.0.1:*;">
<style>
html, body { margin: 0; padding: 0; height: 100%; background: var(--vscode-editor-background); color: var(--vscode-foreground); font-family: var(--vscode-font-family); }
.hint { padding: 12px; margin: 0; color: var(--vscode-descriptionForeground); }
.hint.error { color: var(--vscode-errorForeground); }
</style>
</head>
<body>${body}</body>
</html>`
  }
}

function fileUriFor(targetPath: string): vscode.Uri {
  const folders = vscode.workspace.workspaceFolders ?? []
  return vscode.Uri.file(resolveWorkspaceFilePath(targetPath, folders.map(folder => folder.uri.fsPath)))
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel(OUTPUT_NAME)
  context.subscriptions.push(output)

  /**
   * Show one file in this window, optionally at a 1-based line.
   * @param path - absolute or workspace-relative path.
   * @param line - 1-based line to reveal.
   * @returns whether the editor accepted the file.
   */
  async function openFileInEditor(path: string, line: number | undefined): Promise<boolean> {
    try {
      const document = await vscode.workspace.openTextDocument(fileUriFor(path))
      await vscode.window.showTextDocument(document, {
        preview: true,
        ...(line === undefined ? {} : { selection: new vscode.Range(line - 1, 0, line - 1, 0) }),
      })
      return true
    } catch (error) {
      output.appendLine(`[dsh-vscode] openFile failed: ${errorMessage(error)}`)
      return false
    }
  }

  /**
   * Text of every page-supplied document this window has been asked to show,
   * keyed by document address. The page resends the text on every open, so the
   * entry exists to answer the editor's own read of the document, including a
   * later re-read after the page refreshed it.
   */
  const pageDocuments = new Map<string, string>()
  const documentsChanged = new vscode.EventEmitter<vscode.Uri>()
  context.subscriptions.push(
    documentsChanged,
    vscode.workspace.registerTextDocumentContentProvider(PAGE_DOCUMENT_SCHEME, {
      onDidChange: documentsChanged.event,
      provideTextDocumentContent: uri => pageDocuments.get(uri.toString()) ?? '',
    }),
  )

  /**
   * Show one page-supplied document in this window, refreshing it when the page
   * asks for a title whose tab is already open.
   * @param request - the page's document title, text, and language.
   * @returns whether the editor accepted the document.
   */
  async function openDocumentInEditor(request: OpenDocumentRequest): Promise<boolean> {
    try {
      const uri = vscode.Uri.from({ scheme: PAGE_DOCUMENT_SCHEME, path: `/${documentTabName(request.title)}` })
      pageDocuments.set(uri.toString(), request.text)
      documentsChanged.fire(uri)
      const document = await vscode.workspace.openTextDocument(uri)
      await vscode.languages.setTextDocumentLanguage(document, request.language)
      await vscode.window.showTextDocument(document, { preview: false })
      return true
    } catch (error) {
      output.appendLine(`[dsh-vscode] openDocument failed: ${errorMessage(error)}`)
      return false
    }
  }

  function getBridge(): Promise<RunningBridge | undefined> {
    if (bridge !== undefined) return Promise.resolve(bridge)
    if (bridgePromise !== undefined) return bridgePromise

    const handlers: BridgeHandlers = {
      openFile: async ({ path, line }) => openFileInEditor(path, line),
      openDiff: async ({ path, oldText, newText }) => {
        try {
          const dir = await mkdtemp(join(tmpdir(), 'dsh-vscode-diff-'))
          const ext = extname(path)
          const base = basename(path, ext)
          const oldPath = join(dir, `${base}.old${ext}`)
          const newPath = join(dir, `${base}.new${ext}`)
          await writeFile(oldPath, oldText, 'utf8')
          await writeFile(newPath, newText, 'utf8')
          await vscode.commands.executeCommand(
            'vscode.diff',
            vscode.Uri.file(oldPath),
            vscode.Uri.file(newPath),
            `${base}${ext} (DSH diff)`,
          )
          return true
        } catch (error) {
          output.appendLine(`[dsh-vscode] openDiff failed: ${errorMessage(error)}`)
          return false
        }
      },
    }

    bridgePromise = startBridge(handlers)
      .then((running) => {
        bridge = running
        bridgePromise = undefined
        return running
      })
      .catch((error: unknown) => {
        bridgePromise = undefined
        output.appendLine(`[dsh-vscode] bridge failed to start: ${errorMessage(error)}`)
        return undefined
      })
    return bridgePromise
  }

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  statusBar.command = 'dsh.open'
  context.subscriptions.push(statusBar)

  let statusRunning = false
  let statusUrl: string | undefined

  function readShowStatusBar(): boolean {
    return vscode.workspace.getConfiguration('dsh').get<boolean>('showStatusBar', false)
  }

  /** Render the status bar button, or hide it when `dsh.showStatusBar` is off. */
  const applyStatus = (): void => {
    if (!readShowStatusBar()) {
      statusBar.hide()
      return
    }
    statusBar.text = statusRunning ? '$(rocket) DeepSeek Harness' : '$(debug-start) DeepSeek Harness'
    statusBar.tooltip = statusRunning
      ? `DeepSeek Harness running at ${statusUrl ?? ''} — click to open`
      : 'DeepSeek Harness stopped — click to start'
    statusBar.show()
  }

  const setStatus = (running: boolean, url?: string): void => {
    statusRunning = running
    statusUrl = url
    applyStatus()
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('dsh.showStatusBar')) applyStatus()
    }),
  )

  function readFlags(): WebFlags {
    const config = vscode.workspace.getConfiguration('dsh')
    return { host: config.get<string>('host', '127.0.0.1'), port: config.get<number>('port', 0) }
  }

  async function boot(): Promise<RunningServer | undefined> {
    if (server !== undefined) return server
    if (booting !== undefined) return booting

    const flags = readFlags()
    const config = vscode.workspace.getConfiguration('dsh')
    const launch = resolveLaunch({
      cliPath: config.get<string>('cliPath', ''),
      envCli: process.env.DSH_CLI,
      platform: process.platform,
      pathEnv: process.env.PATH,
      devFallback: resolve(__dirname, '..', '..', 'cli', 'lib', 'bin.js'),
    })

    if (launch === undefined) {
      void vscode.window.showErrorMessage(
        'DeepSeek Harness: could not find the `dsh` CLI. '
        + 'Set the `dsh.cliPath` setting, or install @deepseek-ai/dsh so `dsh` is on PATH.',
      )
      return undefined
    }

    const argv = [...launch.argsPrefix, ...buildProfileArgs(flags)]
    output.appendLine(`$ ${[launch.command, ...argv].join(' ')}`)

    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    const runningBridge = await getBridge()
    const env = runningBridge === undefined ? undefined : {
      DSH_VSCODE: '1',
      DSH_VSCODE_BRIDGE: runningBridge.url,
      DSH_VSCODE_BRIDGE_TOKEN: runningBridge.token,
    }
    const promise = startServer({
      launch,
      flags: buildProfileArgs(flags),
      ...(cwd === undefined ? {} : { cwd }),
      ...(env === undefined ? {} : { env }),
      onLog: text => output.append(text),
    }).then((running) => {
      server = running
      setStatus(true, running.url)
      void running.exitCode.then((code) => {
        output.appendLine(`dsh exited (code ${String(code)})`)
        if (server === running) {
          server = undefined
          setStatus(false)
          webProvider?.offline()
        }
      })
      return running
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      output.appendLine(`dsh failed to start: ${message}`)
      void vscode.window.showErrorMessage(`DeepSeek Harness failed to start: ${message}`)
      setStatus(false)
      return undefined
    }).finally(() => {
      booting = undefined
    })
    booting = promise

    return promise
  }

  async function openBrowser(): Promise<void> {
    const running = await boot()
    if (running === undefined) return
    await vscode.env.openExternal(vscode.Uri.parse(running.url))
  }

  async function stop(): Promise<void> {
    const running = server
    server = undefined
    if (running === undefined) return
    output.appendLine('Stopping dsh')
    setStatus(false)
    await running.stop()
  }

  async function restart(): Promise<void> {
    await stop()
    await webProvider?.connect()
  }

  async function sendToHarness(reference: FileReference): Promise<void> {
    if (webProvider === undefined) return
    const outcome = await webProvider.sendToHarness(reference)
    if (outcome.ok) return
    output.appendLine(`[dsh-vscode] send refused: ${outcome.error ?? 'the embedded page did not answer'}`)
    void vscode.window.showWarningMessage(insertFailureMessage(outcome.error))
  }

  async function sendSelection(uri?: vscode.Uri): Promise<void> {
    const editor = uri === undefined
      ? vscode.window.activeTextEditor
      : vscode.window.visibleTextEditors.find(candidate => candidate.document.uri.toString() === uri.toString())
        ?? vscode.window.activeTextEditor
    if (editor === undefined || editor.document.uri.scheme !== 'file') {
      void vscode.window.showWarningMessage('只能发送本地文件的选择。')
      return
    }
    const path = editor.document.uri.fsPath
    const selection = editor.selection
    await sendToHarness(formatFileReference(path, basename(path), {
      startLine: selection.start.line,
      startCharacter: selection.start.character,
      endLine: selection.end.line,
      endCharacter: selection.end.character,
    }))
  }

  async function sendFile(uri?: vscode.Uri): Promise<void> {
    const fileUri = uri ?? vscode.window.activeTextEditor?.document.uri
    if (fileUri === undefined || fileUri.scheme !== 'file') {
      void vscode.window.showWarningMessage('没有可发送的本地文件。')
      return
    }
    await sendToHarness(formatFileReference(fileUri.fsPath, basename(fileUri.fsPath)))
  }

  webProvider = new WebViewProvider(boot, openFileInEditor, openDocumentInEditor, line => output.appendLine(line))
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, webProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('dsh.open', () => vscode.commands.executeCommand(`${VIEW_ID}.focus`)),
    vscode.commands.registerCommand('dsh.openBrowser', () => openBrowser()),
    vscode.commands.registerCommand('dsh.restart', () => restart()),
    vscode.commands.registerCommand('dsh.stop', () => stop()),
    vscode.commands.registerCommand('dsh.sendSelection', (uri?: vscode.Uri) => sendSelection(uri)),
    vscode.commands.registerCommand('dsh.sendFile', (uri?: vscode.Uri) => sendFile(uri)),
  )

  setStatus(false)
}

export async function deactivate(): Promise<void> {
  webProvider?.dispose()
  webProvider = undefined
  const running = server
  server = undefined
  if (running !== undefined) {
    await running.stop()
  }
  const runningBridge = bridge
  bridge = undefined
  bridgePromise = undefined
  if (runningBridge !== undefined) {
    await runningBridge.stop()
  }
}
