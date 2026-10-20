/**
 * `workbench` namespace dictionaries: the frame chrome this package owns —
 * the activity bar and the status bar. The shared `common` dictionary belongs
 * to the locale package, so chrome copy that the frame introduces lives here.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'activitybar.aria': '功能入口',
  'activity.workspace': '工作区',
  'statusbar.aria': '状态栏',
}

/** English dictionary over the same keys. */
export const en: Record<keyof typeof zh, string> = {
  'activitybar.aria': 'Activity bar',
  'activity.workspace': 'Workspace',
  'statusbar.aria': 'Status bar',
}

/** Keys of the `workbench` namespace. */
export type WorkbenchKey = keyof typeof zh
