/** Delete build-time directory trees that package managers populate with directory links. */

import { rmSync } from 'node:fs'

/**
 * Delete a directory tree, including the links a package manager leaves inside it.
 *
 * Asynchronous `fs.rm` of such a tree never settles on Windows: it deletes every
 * other entry, then stays pending on the link until the process ends, so a build
 * step that awaits it makes no further progress. Synchronous removal of the same
 * tree finishes in milliseconds, which is why build-time teardown uses it.
 * @param path - Directory to delete; a missing path is not an error.
 */
export function removeTree(path: string): void {
  rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
}
