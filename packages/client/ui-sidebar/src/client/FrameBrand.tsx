/**
 * Frame brand: the product mark and name in the frame's top band. It sits
 * outside every activity, so the wordmark stays put when the activity rail
 * switches between the Workspace columns and a registered activity.
 *
 * The band is the same one the Workspace tab strip used before that strip moved
 * into the Workspace activity. On the Windows desktop the brand rides the window
 * caption instead — one line with the native menus — and publishes its right
 * edge so the caption controls and the menus start after it.
 *
 * The fallback mark is the sleeping whale and the fallback name is `deepsleep`;
 * occupants of `shell.header.brand.mark` and `shell.header.brand.name` replace
 * either half.
 */
import { useLayoutEffect, useRef } from 'react'
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { SleepingWhale } from './SleepingWhale.tsx'
import css from './FrameBrand.module.css'

/** Complete-build metadata for the local brand badge. */
function localBuildVersion(): string | undefined {
  const version = process.env.DSH_CLIENT_VERSION
  if (version === undefined) return undefined
  const commit = process.env.DSH_CLIENT_COMMIT_HASH
  return version
    + (commit === undefined ? '' : `-${commit}`)
    + (process.env.DSH_CLIENT_GIT_DIRTY === 'true' ? '-dirty' : '')
}

/** Frame-brand props: the occupied header seat, its two brand holes, and the locale seat. */
export type FrameBrandProps =
  & PropsRuntime<'shell.header'>
  & PropsRenderSlots<'shell.header.brand.mark' | 'shell.header.brand.name'>
  & PropsLocale<'sidebar'>

/**
 * Render the frame's brand band.
 * @param props - the brand holes and the locale seat.
 * @returns the band element tree.
 */
export function FrameBrand({ renderSlot, t }: FrameBrandProps) {
  const buildVersion = localBuildVersion()
  // Windows desktop: the caption strip is the window's first line, so the brand
  // joins the native menus there instead of adding a band below them.
  const windowsTitlebar = document.documentElement.hasAttribute('data-windows-titlebar')
  const brand = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!windowsTitlebar) return undefined
    const element = brand.current
    /* v8 ignore next -- the brand element renders whenever the effect runs. */
    if (element === null) return undefined
    const publish = (): void => {
      const end = Math.round(element.getBoundingClientRect().right) + 8
      document.documentElement.style.setProperty('--dsh-windows-brand-end', `${end}px`)
    }
    // The wordmark's width follows the locale, the brand occupant, and the
    // build badge, so it is measured rather than reserved.
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(element)
    return () => {
      observer.disconnect()
      document.documentElement.style.removeProperty('--dsh-windows-brand-end')
    }
  }, [windowsTitlebar])
  return (
    <div ref={brand} className={windowsTitlebar ? css.captionBar : css.bar} data-frame-brand data-window-drag>
      <span className={css.brandIdentity}>
        <span className={css.brandMark}>
          {renderSlot('shell.header.brand.mark', { size: 24 }, { fallback: <SleepingWhale size={24} /> })}
        </span>
        <span className={css.brandName}>
          {renderSlot('shell.header.brand.name', {}, {
            fallback: <span className={css.wordmark}>{t('brand.name')}</span>,
          })}
          {buildVersion !== undefined && <span className={css.buildVersion}>{buildVersion}</span>}
        </span>
      </span>
    </div>
  )
}
