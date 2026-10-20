/**
 * Decode one file-reference spelling into its path and optional line range.
 *
 * A chip's `ref` is prompt text: `@path` or `@"path with spaces"`, with an
 * optional GitHub-style `#L12` / `#L12-L30` fragment. The fragment is display
 * and navigation metadata, so the path stays exactly the text before it; an
 * unparsable fragment leaves the plain file reference intact.
 *
 * @module @deepseek-ai/dsh-client-ui-reference/reference-target
 */

/** One decoded file reference. */
export interface FileReferenceTarget {
  /** Decoded path as authored in the mention (quotes and fragment removed). */
  readonly path: string
  /** Optional 1-based first line of the referenced range. */
  readonly line?: number
  /** Optional 1-based last line; equal to {@link line} for a single line. */
  readonly endLine?: number
}

/** GitHub-style line fragment: `L12` or `L12-L30`, both 1-based. */
const LINE_FRAGMENT = /^L([1-9]\d*)(?:-L([1-9]\d*))?$/u

/**
 * Decode one `@path`, `@"path with spaces"`, or ranged spelling of either.
 * @param ref - reference text stored on a composer chip.
 * @returns the decoded path and optional range, or undefined when the text is
 *   not a file reference.
 */
export function parseFileReferenceTarget(ref: string): FileReferenceTarget | undefined {
  if (!ref.startsWith('@')) return undefined
  let body = ref.slice(1)
  if (body.startsWith('"')) {
    const close = body.indexOf('"', 1)
    if (close < 0) return undefined
    body = body.slice(1, close) + body.slice(close + 1)
  }
  const hash = body.indexOf('#')
  const path = hash < 0 ? body : body.slice(0, hash)
  if (path === '') return undefined
  if (hash < 0) return { path }
  const match = LINE_FRAGMENT.exec(body.slice(hash + 1))
  if (match === null) return { path }
  const line = Number(match[1])
  const endLine = match[2] === undefined ? line : Number(match[2])
  if (!Number.isSafeInteger(line) || !Number.isSafeInteger(endLine) || endLine < line) return { path }
  return { path, line, endLine }
}

/**
 * Render the chip label for one path and its optional range.
 * @param path - file path as authored in the mention.
 * @param line - optional 1-based first line.
 * @param endLine - optional 1-based last line.
 * @returns the path's final segment plus `:line` or `:start-end`.
 */
export function fileReferenceLabel(path: string, line?: number, endLine?: number): string {
  const name = path.split(/[\\/]/u).filter(Boolean).at(-1) ?? path
  if (line === undefined) return name
  const end = endLine ?? line
  return end === line ? `${name}:${String(line)}` : `${name}:${String(line)}-${String(end)}`
}
