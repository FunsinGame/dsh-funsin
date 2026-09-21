/**
 * Format helpers for the VS Code extension's "send to DeepSeek Harness"
 * commands.
 */

/** A 0-based VS Code selection line span. */
export interface SelectionLines {
  startLine: number
  startCharacter: number
  endLine: number
  endCharacter: number
}

/** One file reference as the harness composer receives it. */
export interface FileReference {
  /**
   * The reference id: an absolute path, plus `:line` or `:start-end` when a
   * range is referenced. It is the draft's clipboard text and the model's
   * form of this reference.
   */
  readonly ref: string
  /** Chip label: the file name with its extension, plus the same line range. */
  readonly label: string
}

/**
 * Format one absolute file path, optionally narrowed to a 0-based selection,
 * as the harness composer's file reference. A whole file keeps its path and
 * displays its name; a single-line selection appends `:line`; a multi-line
 * selection appends `:start-end`, where `end` is the last included line (a
 * selection that stops at the start of a line does not include that line).
 * @param path - absolute file path.
 * @param name - the file's display name, its final path segment.
 * @param selection - 0-based VS Code selection; absent for a whole file.
 * @returns the reference id and the chip label.
 */
export function formatFileReference(path: string, name: string, selection?: SelectionLines): FileReference {
  const range = selection === undefined ? '' : rangeSuffix(selection)
  return { ref: `${path}${range}`, label: `${name}${range}` }
}

/**
 * The 1-based inclusive `:line` or `:start-end` suffix of one selection.
 * @param selection - 0-based VS Code selection.
 * @returns the suffix, including its leading colon.
 */
function rangeSuffix(selection: SelectionLines): string {
  const first = selection.startLine + 1
  const last = selection.endLine + (selection.endCharacter === 0 && selection.endLine > selection.startLine ? 0 : 1)
  return first === last ? `:${String(first)}` : `:${String(first)}-${String(last)}`
}

/**
 * The warning shown when the composer did not take the reference. The embedded
 * page reports why it refused — most often because no session is open, where
 * there is no composer to insert into at all — and only an unanswered request
 * means the harness itself is not reachable through the sidebar.
 * @param error - the page's refusal reason; absent when no page answered.
 * @returns the user-facing warning text.
 */
export function insertFailureMessage(error: string | undefined): string {
  switch (error) {
    case 'no active session':
      return '请先在 DeepSeek Harness 中打开一个会话，再发送到输入框。'
    case 'unauthorized':
      return 'DeepSeek Harness 页面校验失败，请运行「DeepSeek Harness: Restart」后重试。'
    case undefined:
      return 'DeepSeek Harness 尚未就绪，无法发送到输入框。'
    default:
      return `无法发送到输入框：${error}`
  }
}
