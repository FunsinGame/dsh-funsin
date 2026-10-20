// @vitest-environment jsdom
/** Rail-order persistence: tolerant reads, deterministic merges, and move semantics. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ACTIVITY_ORDER_STORAGE_KEY, moveActivityOrder, readActivityOrder, resolveActivityOrder, writeActivityOrder,
} from '../src/client/activity-order.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('readActivityOrder', () => {
  it('returns no order without storage or with no saved entry', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(readActivityOrder()).toEqual([])
    vi.unstubAllGlobals()
    expect(readActivityOrder()).toEqual([])
  })

  it('returns no order when storage refuses the read', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(readActivityOrder()).toEqual([])
  })

  it('keeps only non-empty string ids from a stored array', () => {
    localStorage.setItem(ACTIVITY_ORDER_STORAGE_KEY, JSON.stringify(['plugins', '', 7, null, 'workspace']))
    expect(readActivityOrder()).toEqual(['plugins', 'workspace'])
  })

  it('rejects malformed JSON and non-array values', () => {
    localStorage.setItem(ACTIVITY_ORDER_STORAGE_KEY, '{')
    expect(readActivityOrder()).toEqual([])
    localStorage.setItem(ACTIVITY_ORDER_STORAGE_KEY, JSON.stringify({ order: ['plugins'] }))
    expect(readActivityOrder()).toEqual([])
  })
})

describe('writeActivityOrder', () => {
  it('stores the order as JSON', () => {
    writeActivityOrder(['workspace', 'plugins'])
    expect(localStorage.getItem(ACTIVITY_ORDER_STORAGE_KEY)).toBe(JSON.stringify(['workspace', 'plugins']))
  })

  it('survives missing storage', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(() => { writeActivityOrder(['workspace']) }).not.toThrow()
  })

  it('reports a failed write without breaking the current session', () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('full') },
    })
    expect(() => { writeActivityOrder(['workspace']) }).not.toThrow()
    expect(report).toHaveBeenCalledWith('Activity-bar order persistence failed:', expect.any(Error))
  })
})

describe('resolveActivityOrder', () => {
  const defaults = ['workspace', 'plugins', 'schedules']

  it('keeps the default order until the user saves one', () => {
    expect(resolveActivityOrder(defaults, [])).toEqual(defaults)
  })

  it('applies the saved order and appends ids the saved order omits', () => {
    expect(resolveActivityOrder(defaults, ['schedules', 'workspace'])).toEqual(['schedules', 'workspace', 'plugins'])
  })

  it('ignores unknown and repeated saved ids', () => {
    expect(resolveActivityOrder(defaults, ['missing', 'plugins', 'plugins'])).toEqual(['plugins', 'workspace', 'schedules'])
  })
})

describe('moveActivityOrder', () => {
  it('places the dragged id before or after the anchor', () => {
    expect(moveActivityOrder(['a', 'b', 'c'], 'c', 'a', 'before')).toEqual(['c', 'a', 'b'])
    expect(moveActivityOrder(['a', 'b', 'c'], 'a', 'c', 'after')).toEqual(['b', 'c', 'a'])
    expect(moveActivityOrder(['a', 'b', 'c'], 'c', 'a', 'after')).toEqual(['a', 'c', 'b'])
  })

  it('reports no change for an unknown id, the same id, or a move that keeps the order', () => {
    expect(moveActivityOrder(['a', 'b'], 'missing', 'a', 'before')).toBeUndefined()
    expect(moveActivityOrder(['a', 'b'], 'a', 'missing', 'after')).toBeUndefined()
    expect(moveActivityOrder(['a', 'b'], 'a', 'a', 'before')).toBeUndefined()
    expect(moveActivityOrder(['a', 'b'], 'a', 'b', 'before')).toBeUndefined()
    expect(moveActivityOrder(['a', 'b'], 'b', 'a', 'after')).toBeUndefined()
  })
})
