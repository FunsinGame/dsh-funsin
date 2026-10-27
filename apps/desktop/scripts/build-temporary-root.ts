/** Temporary root inside the build tree for directories bundled runtimes write into. */

import { mkdirSync } from 'node:fs'
import { resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'

/**
 * Create and return the build-wide temporary root.
 *
 * Build steps that run the packaged Electron executable keep their scratch directories
 * here instead of the build host's `%TEMP%`: on Windows that process cannot create
 * directories under the user's temporary directory at all, which fails the bundled pnpm
 * install and every later step with `EPERM` on its first `mkdir`.
 * @param paths - Target paths supplying the temporary root; defaults to the selected target.
 * @returns Absolute path of the existing temporary root.
 */
export function resolveBuildTemporaryRoot(paths: { tmp: string } = resolveDesktopTargetBuildPaths()): string {
  mkdirSync(paths.tmp, { recursive: true })
  return paths.tmp
}

/**
 * Point a child process's temporary directory at a build-owned path.
 * @param directory - Directory the child may create files in; created when missing.
 * @returns Temporary-directory variables to merge into the child environment.
 */
export function buildTemporaryEnvironment(directory: string): { TMP: string; TEMP: string; TMPDIR: string } {
  mkdirSync(directory, { recursive: true })
  return { TMP: directory, TEMP: directory, TMPDIR: directory }
}
