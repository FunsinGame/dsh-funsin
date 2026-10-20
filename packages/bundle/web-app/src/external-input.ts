/**
 * External composer input: the loopback HTTP entry that lets a local editor
 * (the VS Code extension) place a file reference into an open Session's
 * composer. The route only forwards a request to every connected Client; the
 * Client owns the composer, so it decides which Session is active, inserts at
 * the caret, and answers the route with the same-origin ack.
 *
 * The entry is not part of the browser API: it listens on the existing Web
 * server, authenticates with a per-process token written to a user-only file
 * under `$DSH_HOME`, and can do exactly one thing — ask a Client to insert a
 * reference or plain text. It cannot read a Session, submit a prompt, or call
 * any Remote method.
 *
 * @module @deepseek-ai/dsh-web-app/external-input
 */

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'

/**
 * One external composer insertion request broadcast to every connected Client.
 *
 * This is the Host-side declaration of the wire shape the
 * `composer/insert` entry in `@deepseek-ai/dsh-api-remotes` forwards. The two
 * declarations stay structurally identical; this bundle cannot import the
 * remotes package's root without pulling its whole Host graph into this
 * project, so the shape lives here as well.
 */
export interface ExternalInsertRequest {
  /** Host-minted request identity, echoed by the Client ack. */
  readonly requestId: string
  /** Single-use ack capability, echoed by the Client ack. */
  readonly ackToken: string
  /** `file` inserts a reference chip; `text` inserts plain text at the caret. */
  readonly kind: 'file' | 'text'
  /** `kind: 'file'`: absolute path of the referenced file. */
  readonly path?: string
  /** `kind: 'file'`: 1-based first line of the referenced range. */
  readonly startLine?: number
  /** `kind: 'file'`: 1-based last line of the referenced range. */
  readonly endLine?: number
  /** `kind: 'text'`: text to insert. */
  readonly text?: string
  /** Optional target Session; otherwise each Client picks its active Session. */
  readonly sessionId?: string
  /** Optional workspace path used as a tiebreaker for Session selection. */
  readonly cwd?: string
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * One external composer insertion request, broadcast to every Client.
     * @param request - content, target, and ack correlation.
     * @mode emit
     */
    'composer/insert'(request: ExternalInsertRequest): void
  }
}

/** Exact path of the insertion entry. */
export const EXTERNAL_INPUT_INSERT_PATH = '/external-input/v1/insert'
/** Exact path of the Client's same-origin acknowledgement. */
export const EXTERNAL_INPUT_ACK_PATH = '/external-input/v1/ack'

/** Largest accepted request body. */
const MAX_BODY_BYTES = 1024 * 1024
/** Largest accepted plain-text insertion. */
const MAX_TEXT_LENGTH = 256 * 1024
/** Largest accepted absolute path. */
const MAX_PATH_LENGTH = 4096
/** How long the route waits for a Client ack before answering `202`. */
const ACK_TIMEOUT_MS = 1500
/** Page origin shapes an external editor never sends; a browser page must not call the entry. */
const LOOPBACK_ORIGIN = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/u

/** One accepted insertion request body. */
interface InsertBody {
  readonly kind: 'file' | 'text'
  readonly path?: string
  readonly startLine?: number
  readonly endLine?: number
  readonly text?: string
  readonly sessionId?: string
  readonly cwd?: string
}

/** One Client acknowledgement of a pending insertion request. */
interface AckBody {
  readonly requestId: string
  readonly ackToken: string
  readonly ok: boolean
  readonly sessionId?: string
  readonly error?: string
}

/** One route waiting on a Client ack. */
interface PendingAck {
  readonly token: string
  readonly resolve: (value: AckBody | undefined) => void
  readonly timer: NodeJS.Timeout
}

/**
 * Resolve the harness home exactly as the Host's `home-paths` package does:
 * an explicit `$DSH_HOME`, otherwise `~/.dsh`.
 * @returns the absolute harness home path.
 */
function dshHome(): string {
  const configured = process.env.DSH_HOME?.trim()
  if (configured !== undefined && configured !== '') {
    return configured.startsWith('~') ? join(homedir(), configured.slice(1)) : configured
  }
  return join(homedir(), '.dsh')
}

/**
 * Install the external composer input entry and its discovery file.
 * @param ctx - plugin context carrying the Web server.
 */
export function installExternalInput(ctx: Context): void {
  const token = randomBytes(32).toString('base64url')
  const directory = join(dshHome(), 'runtime', 'external-input')
  const discoveryFile = join(directory, `${String(process.pid)}.json`)
  const pending = new Map<string, PendingAck>()

  const writeDiscovery = (): void => {
    try {
      mkdirSync(dirname(discoveryFile), { recursive: true })
      writeFileSync(discoveryFile, JSON.stringify({
        schema: 1,
        pid: process.pid,
        port: ctx.webServer.port,
        url: `http://127.0.0.1:${String(ctx.webServer.port)}`,
        token,
        cwd: process.cwd(),
        startedAt: new Date().toISOString(),
      }, null, 2), { mode: 0o600 })
    } catch (error) {
      console.error('[external-input] could not write the discovery file:', error)
    }
  }

  ctx.effect(() => {
    writeDiscovery()
    return () => {
      rmSync(discoveryFile, { force: true })
      for (const waiter of pending.values()) {
        clearTimeout(waiter.timer)
        waiter.resolve(undefined)
      }
      pending.clear()
    }
  }, 'external-input: discovery file and pending acks')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: EXTERNAL_INPUT_INSERT_PATH,
    handler: (request, response) => { void handleInsert(request, response) },
  }), 'external-input: insert route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: EXTERNAL_INPUT_ACK_PATH,
    handler: (request, response) => { void handleAck(request, response) },
  }), 'external-input: ack route')

  /**
   * Accept one authenticated insertion request, broadcast it, and wait for the
   * first Client answer.
   * @param request - incoming HTTP request.
   * @param response - response owned by this handler.
   */
  async function handleInsert(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== 'POST') {
      respond(response, 405, { error: 'method' })
      return
    }
    if (!authorized(request, token)) {
      respond(response, 401, { error: 'unauthorized' })
      return
    }
    const origin = request.headers.origin
    if (origin !== undefined && !LOOPBACK_ORIGIN.test(origin)) {
      respond(response, 403, { error: 'origin' })
      return
    }
    let body: unknown
    try {
      body = await readJson(request)
    } catch {
      respond(response, 400, { error: 'bad request' })
      return
    }
    if (!isInsertBody(body)) {
      respond(response, 400, { error: 'bad request' })
      return
    }

    const requestId = randomBytes(12).toString('base64url')
    const ackToken = randomBytes(18).toString('base64url')
    const settled = new Promise<AckBody | undefined>((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(requestId)
        resolve(undefined)
      }, ACK_TIMEOUT_MS)
      timer.unref()
      pending.set(requestId, { token: ackToken, resolve, timer })
    })
    const payload: ExternalInsertRequest = { ...body, requestId, ackToken }
    ctx.emit('composer/insert', payload)

    const ack = await settled
    if (ack === undefined) {
      respond(response, 202, { accepted: true, ack: 'timeout' })
      return
    }
    respond(response, 200, {
      accepted: true,
      ok: ack.ok,
      ...(ack.sessionId === undefined ? {} : { sessionId: ack.sessionId }),
      ...(ack.error === undefined ? {} : { error: ack.error }),
    })
  }

  /**
   * Settle one pending insertion request from a Client's same-origin answer.
   * @param request - incoming HTTP request.
   * @param response - response owned by this handler.
   */
  async function handleAck(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== 'POST') {
      respond(response, 405, { error: 'method' })
      return
    }
    let body: unknown
    try {
      body = await readJson(request)
    } catch {
      respond(response, 400, { error: 'bad request' })
      return
    }
    if (!isAckBody(body)) {
      respond(response, 400, { error: 'bad request' })
      return
    }
    const waiter = pending.get(body.requestId)
    if (waiter === undefined) {
      respond(response, 404, { error: 'unknown request' })
      return
    }
    if (!sameToken(waiter.token, body.ackToken)) {
      respond(response, 403, { error: 'unauthorized' })
      return
    }
    clearTimeout(waiter.timer)
    pending.delete(body.requestId)
    waiter.resolve(body)
    respond(response, 204, undefined)
  }
}

/**
 * Compare one supplied bearer token with the process token.
 * @param request - request carrying the Authorization header.
 * @param token - expected process token.
 * @returns whether the header carries exactly that token.
 */
function authorized(request: IncomingMessage, token: string): boolean {
  const header = request.headers.authorization
  if (header === undefined || !header.startsWith('Bearer ')) return false
  return sameToken(token, header.slice('Bearer '.length))
}

/**
 * Constant-time comparison of two textual capabilities.
 * @param expected - expected value.
 * @param supplied - caller-supplied value.
 * @returns whether both encode the same bytes.
 */
function sameToken(expected: string, supplied: string): boolean {
  const left = Buffer.from(expected, 'utf8')
  const right = Buffer.from(supplied, 'utf8')
  return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * Read one JSON request body within the size limit.
 * @param request - incoming HTTP request.
 * @returns the parsed JSON value.
 * @throws when the body is too large or is not JSON.
 */
async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > MAX_BODY_BYTES) throw new Error('external-input: request body is too large')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

/**
 * Validate one insertion request body.
 * @param value - parsed JSON value.
 * @returns whether the value is an accepted insertion body.
 */
function isInsertBody(value: unknown): value is InsertBody {
  if (typeof value !== 'object' || value === null) return false
  const body = value as Record<string, unknown>
  if (!optionalString(body.sessionId) || !optionalString(body.cwd)) return false
  if (body.kind === 'file') {
    if (typeof body.path !== 'string' || body.path.length === 0 || body.path.length > MAX_PATH_LENGTH) return false
    if (!isAbsolutePath(body.path)) return false
    if (body.startLine !== undefined && !isLineNumber(body.startLine)) return false
    if (body.endLine !== undefined && !isLineNumber(body.endLine)) return false
    if (body.startLine === undefined && body.endLine !== undefined) return false
    if (typeof body.startLine === 'number' && typeof body.endLine === 'number' && body.endLine < body.startLine) {
      return false
    }
    return true
  }
  if (body.kind === 'text') {
    return typeof body.text === 'string' && body.text.length > 0 && body.text.length <= MAX_TEXT_LENGTH
  }
  return false
}

/**
 * Validate one Client ack body.
 * @param value - parsed JSON value.
 * @returns whether the value is an accepted ack body.
 */
function isAckBody(value: unknown): value is AckBody {
  if (typeof value !== 'object' || value === null) return false
  const body = value as Record<string, unknown>
  return typeof body.requestId === 'string' && body.requestId.length > 0 && body.requestId.length <= 128
    && typeof body.ackToken === 'string' && body.ackToken.length > 0 && body.ackToken.length <= 128
    && typeof body.ok === 'boolean'
    && optionalString(body.sessionId)
    && optionalString(body.error)
}

/**
 * Whether an optional field is absent or a string.
 * @param value - field value.
 * @returns whether the value is acceptable.
 */
function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}

/**
 * Whether a value is an absolute native path.
 * @param value - candidate path.
 * @returns whether it names an absolute path.
 */
function isAbsolutePath(value: string): boolean {
  return /^(?:[a-zA-Z]:[\\/]|\\\\|\/)/u.test(value)
}

/**
 * Whether a value is a 1-based line number.
 * @param value - candidate line number.
 * @returns whether it is a positive safe integer.
 */
function isLineNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
}

/**
 * Write one JSON response.
 * @param response - response to own.
 * @param status - HTTP status code.
 * @param value - JSON body, or undefined for an empty response.
 */
function respond(response: ServerResponse, status: number, value: unknown): void {
  if (value === undefined) {
    response.writeHead(status)
    response.end()
    return
  }
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(value))
}
