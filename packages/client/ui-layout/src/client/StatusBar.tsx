/**
 * Status bar: the frame's bottom band. The shell owns the strip (height,
 * chrome, the two groups, the accessible name); each entry renders its own
 * content and keeps it current through its registration's `hooks` source, so
 * a status value is a plugin-owned observable rather than shared mutable bar
 * state.
 */
import type { StatusBarProps } from './contract.ts'
import css from './StatusBar.module.css'

/**
 * Render the status bar.
 * @param props - the two item lists and the locale seat.
 * @returns the bar element tree.
 */
export function StatusBar({ renderSlot, t }: StatusBarProps) {
  return (
    <footer className={css.bar} aria-label={t('statusbar.aria')}>
      <div className={css.group} data-statusbar-left>
        {renderSlot('shell.statusbar.left', {})}
      </div>
      <div className={css.trailing} data-statusbar-right>
        {renderSlot('shell.statusbar.right', {})}
      </div>
    </footer>
  )
}
