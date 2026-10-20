/**
 * The one home of this application's forwarded-Host-event allowlist. Both
 * compiler faces list this file, so the Host forwarding loop and the consumer
 * `ctx.remote.$on` key face read one declaration instead of two copies that
 * could drift; `./types.ts` derives the type projection from it and stays
 * type-only.
 */

import type {} from '@deepseek-ai/dsh-api-session-controller/remote-events'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-deepseek-account/types'
import type {} from '@deepseek-ai/dsh-permission-presets/types'
import type {} from '@deepseek-ai/dsh-plugin-manager/types'
import type {} from '@deepseek-ai/dsh-plugin-market/types'
import type {} from '@deepseek-ai/dsh-schedule/client'
import type { TypertForwardableEventEntry } from '@deepseek-ai/dsh-typert-protocol'

/**
 * One external composer insertion request broadcast to every connected Client.
 * The Host route mints `requestId` and `ackToken`; the Client echoes both on
 * the same-origin ack that settles the route, while the content fields locate
 * what to place in the composer.
 */
export interface ComposerInsertRequest {
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
    'composer/insert'(request: ComposerInsertRequest): void
  }
}

/**
 * Host events this application forwards without renaming. The explicit mode is
 * both the Host dispatch strategy and the legal key set of `ctx.remote.$on`.
 * An `emit` entry declares readers of the resources its payload carries, or
 * none to touch the built-in `global` resource; it reaches a non-owner Peer
 * only when access control allows it. Each notification names one resource
 * identity or none, and collection changes travel on follow streams instead.
 */
export const API_REMOTE_FORWARDED_EVENTS = [
  { event: 'agent-preset/selected', mode: 'emit' },
  { event: 'approval/request', mode: 'waterfall' },
  { event: 'api-session/activity', mode: 'emit', resources: { session: (sessionId): SessionId => sessionId } },
  { event: 'api-session/added', mode: 'emit', resources: { session: (summary): SessionId => summary.sessionId } },
  { event: 'api-session/error', mode: 'emit', resources: { session: (sessionId): SessionId => sessionId } },
  { event: 'api-session/removed', mode: 'emit', resources: { session: (sessionId): SessionId => sessionId } },
  { event: 'api-session/status', mode: 'emit', resources: { session: (sessionId): SessionId => sessionId } },
  { event: 'commands/change', mode: 'emit' },
  { event: 'composer/insert', mode: 'emit' },
  { event: 'deepseek-account/session-expired', mode: 'emit' },
  { event: 'deepseek-account/model-sign-in-required', mode: 'emit' },
  { event: 'credentials/record-updated', mode: 'emit' },
  { event: 'credentials/reference-updated', mode: 'emit' },
  { event: 'goal/activation-changed', mode: 'emit' },
  { event: 'cordis/request-run', mode: 'emit' },
  { event: 'cordis/request-run-resolved', mode: 'emit' },
  { event: 'cordis/dynamic-package', mode: 'emit' },
  { event: 'cordis/dynamic-retract', mode: 'emit' },
  { event: 'cordis/inspect-query', mode: 'emit' },
  { event: 'cordis/inspect-query-resolved', mode: 'emit' },
  { event: 'llm/adapters-updated', mode: 'emit' },
  { event: 'permission-presets/catalog-changed', mode: 'emit' },
  { event: 'plugin-manager/changed', mode: 'emit' },
  { event: 'plugin-manager/install-log', mode: 'emit' },
  { event: 'plugin-manager/install-state', mode: 'emit' },
  { event: 'plugin-market/changed', mode: 'emit' },
  { event: 'settings/document-updated', mode: 'emit' },
  { event: 'schedule/changed', mode: 'emit' },
  { event: 'user-questions/request', mode: 'waterfall' },
] as const satisfies readonly TypertForwardableEventEntry[]
