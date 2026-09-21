/**
 * The file-open request grammar shared by the two channels that ask this
 * extension to show a file in the current window: the webview frame relaying a
 * click in the embedded GUI, and the loopback bridge a harness plugin calls.
 * Node-only (no `vscode` import) so the bridge keeps loading without the
 * extension host and both channels validate input identically.
 */

import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

/** A request to open one file at an optional 1-based line. */
export interface OpenFileRequest {
  path: string
  line?: number
}

/** One webview frame's open request, carrying the id its answer echoes. */
export interface OpenFileMessage extends OpenFileRequest {
  id: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read one file-open request from untrusted input.
 * @param value - decoded bridge body or webview message payload.
 * @returns the request, or undefined when it names no usable path or line.
 */
export function readOpenFileRequest(value: unknown): OpenFileRequest | undefined {
  if (!isRecord(value)) return undefined
  const path = value.path
  if (typeof path !== 'string' || path.length === 0) return undefined
  const line = value.line
  if (line === undefined) return { path }
  if (typeof line !== 'number' || !Number.isInteger(line) || line <= 0) return undefined
  return { path, line }
}

/**
 * Read one open request sent by the embedded GUI's frame.
 * @param value - the frame's message payload.
 * @returns the request with the frame's correlation id, or undefined when either is unusable.
 */
export function readOpenFileMessage(value: unknown): OpenFileMessage | undefined {
  if (!isRecord(value)) return undefined
  const id = value.id
  if (typeof id !== 'string' || id.length === 0) return undefined
  const request = readOpenFileRequest(value)
  return request === undefined ? undefined : { id, ...request }
}

/**
 * Resolve one request path to a filesystem path. An absolute path is used as
 * written; a relative one is resolved against the first workspace folder that
 * holds it, then against the first folder.
 * @param targetPath - absolute or workspace-relative path.
 * @param workspaceFolders - the open folders' filesystem paths, in window order.
 * @returns the filesystem path to open.
 */
export function resolveWorkspaceFilePath(targetPath: string, workspaceFolders: readonly string[]): string {
  if (isAbsolute(targetPath)) return targetPath
  for (const folder of workspaceFolders) {
    const candidate = resolve(folder, targetPath)
    if (existsSync(candidate)) return candidate
  }
  const first = workspaceFolders[0]
  return first === undefined ? targetPath : resolve(first, targetPath)
}
