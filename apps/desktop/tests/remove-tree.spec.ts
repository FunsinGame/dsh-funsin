import { existsSync, lstatSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { removeTree } from '../scripts/remove-tree.ts'

const roots: string[] = []

afterEach(() => { for (const root of roots.splice(0)) removeTree(root) })

it('removes a tree that links a package directory held outside it', () => {
  const root = mkdtempSync(join(tmpdir(), 'remove-tree-'))
  roots.push(root)
  const installed = join(root, 'store', 'plugin')
  mkdirSync(installed, { recursive: true })
  writeFileSync(join(installed, 'package.json'), '{"name":"plugin","version":"1.0.0"}')
  const modules = join(root, 'home', 'node_modules')
  mkdirSync(modules, { recursive: true })
  symlinkSync(installed, join(modules, 'plugin'), process.platform === 'win32' ? 'junction' : 'dir')

  removeTree(join(root, 'home'))

  expect(existsSync(join(root, 'home'))).toBe(false)
  expect(lstatSync(installed).isDirectory()).toBe(true)
})

it('accepts a directory that is already gone', () => {
  const root = mkdtempSync(join(tmpdir(), 'remove-tree-missing-'))
  roots.push(root)

  expect(() => { removeTree(join(root, 'absent')) }).not.toThrow()
})
