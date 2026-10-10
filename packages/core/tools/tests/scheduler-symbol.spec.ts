/**
 * Guards the cross-copy identity of the scheduler Symbol.
 *
 * `TOOL_RUNTIME_SCHEDULER` is the key a caller uses to reach the scheduler on a
 * `ToolRuntime` instance, and this package is emitted twice: the `tsdown`
 * runtime entry (`lib/index.js`) and the `tsc` consumer entry
 * (`lib/types/index.js`). A plain `Symbol()` is only equal to itself, so two
 * copies would make `ctx.tools[TOOL_RUNTIME_SCHEDULER]` resolve to `undefined`
 * for whichever copy did not install the property — the production symptom is
 * `Cannot read properties of undefined (reading 'prepare')` from the agent
 * loop's tool scheduler. Using the global symbol registry keeps the key stable
 * no matter how many module instances exist.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { TOOL_RUNTIME_SCHEDULER, type ToolRuntimeScheduler } from '@deepseek-ai/dsh-tools'

describe('TOOL_RUNTIME_SCHEDULER', () => {
  it('is drawn from the global symbol registry so copies compare equal', () => {
    // `Symbol.for` round-trips through the global registry: a second, independent
    // lookup of the same key must produce the very same symbol. That is exactly
    // the property a duplicate module instance relies on.
    expect(TOOL_RUNTIME_SCHEDULER).toBe(Symbol.for('@deepseek-ai/dsh-tools.scheduler'))
    expect(Symbol.keyFor(TOOL_RUNTIME_SCHEDULER)).toBe('@deepseek-ai/dsh-tools.scheduler')
  })

  it('resolves the scheduler on a registry that used a different lookup of the same key', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)

    // Simulate the split-module-instance case: a caller that reached the Symbol
    // through its own lookup of the registry key, not through this module's
    // binding. With a non-registered Symbol this is `undefined` and the
    // subsequent `.prepare` throws the production error.
    // Each `Symbol.for` call carries its own `unique symbol` type, so the read
    // goes through the runtime property lookup rather than an index expression.
    const viaIndependentLookup = Symbol.for('@deepseek-ai/dsh-tools.scheduler')
    const scheduler = Reflect.get(ctx.tools, viaIndependentLookup) as ToolRuntimeScheduler

    expect(scheduler).toBeDefined()
    expect(typeof scheduler.prepare).toBe('function')
    expect(typeof scheduler.dispatch).toBe('function')
    expect(typeof scheduler.finalize).toBe('function')
    expect(typeof scheduler.finish).toBe('function')
  })
})
