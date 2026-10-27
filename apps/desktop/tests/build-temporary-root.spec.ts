import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { buildTemporaryEnvironment, resolveBuildTemporaryRoot } from '../scripts/build-temporary-root.ts'
import { removeTree } from '../scripts/remove-tree.ts'

const roots: string[] = []

afterEach(() => { for (const root of roots.splice(0)) removeTree(root) })

it('creates the temporary root it returns and accepts being asked again', () => {
  const base = mkdtempSync(join(tmpdir(), 'build-temp-root-'))
  roots.push(base)
  const tmp = join(base, 'tmp')

  expect(resolveBuildTemporaryRoot({ tmp })).toBe(tmp)
  expect(existsSync(tmp)).toBe(true)
  expect(resolveBuildTemporaryRoot({ tmp })).toBe(tmp)
})

it('points every temporary variable at a directory the child may write', () => {
  const base = mkdtempSync(join(tmpdir(), 'build-temp-env-'))
  roots.push(base)
  const directory = join(base, 'child-temp')

  expect(buildTemporaryEnvironment(directory)).toEqual({ TMP: directory, TEMP: directory, TMPDIR: directory })
  expect(existsSync(directory)).toBe(true)
})
