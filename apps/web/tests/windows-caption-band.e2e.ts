/**
 * Windows desktop: the frame brand shares the window caption's first line with
 * the native menus instead of adding a second band below them, and keeps that
 * reservation when an activity replaces the Workspace columns.
 */
import { chromium, type Page } from 'playwright'
import { expect, it } from 'vitest'
import { launchWebScaffold, watchConsole } from './scaffold.ts'

interface CaptionGeometry {
  brandTop: number
  brandHeight: number
  brandRight: number
  captionControlsStart: string
  headerHeight: number
  /** Where the native menus start, resolved from the published variable. */
  menuStartX: number
  railTop: number
}

async function geometry(page: Page): Promise<CaptionGeometry> {
  return page.evaluate(() => {
    const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
    const brand = box('[data-frame-brand]')
    // The native menu bar is OS-drawn, so its start is resolved through a probe
    // that consumes the same variable the desktop preload positions it from.
    const probe = document.createElement('div')
    probe.style.cssText = 'position: fixed; top: 0; left: var(--dsh-windows-menu-start); width: 1px; height: 1px;'
    document.body.appendChild(probe)
    const menuStartX = probe.getBoundingClientRect().x
    probe.remove()
    return {
      brandTop: brand.top,
      brandHeight: brand.height,
      brandRight: brand.right,
      captionControlsStart: document.documentElement.style.getPropertyValue('--dsh-windows-caption-controls-start'),
      headerHeight: box('[data-shell-header]').height,
      menuStartX,
      railTop: box('[data-shell-activitybar]').top,
    }
  })
}

it('keeps the brand on the Windows caption line, above the collapsed brand band', async () => {
  const scaffold = await launchWebScaffold()
  try {
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, locale: 'en-US' })
      const console = watchConsole(page)
      // The desktop preload sets the caption marker before the page scripts
      // run; this stands in for it so the first client render sees it.
      await page.addInitScript(() => {
        const apply = (): void => {
          document.documentElement.setAttribute('data-windows-titlebar', '')
          document.documentElement.style.setProperty('--dsh-windows-titlebar-height', '40px')
        }
        if (document.documentElement !== null) apply()
        document.addEventListener('DOMContentLoaded', apply, { once: true })
      })
      await page.goto(scaffold.authenticatedUrl)
      await page.locator('[data-frame-brand]').waitFor()
      // This build's fallback brand: the sleeping-whale mark and the deepsleep
      // wordmark, both in the caption line.
      await expect.poll(async () => page.locator('[data-frame-brand] svg').count()).toBe(1)
      expect(await page.locator('[data-frame-brand]').innerText()).toContain('deepsleep')
      await expect.poll(async () => (await geometry(page)).captionControlsStart).not.toBe('')
      const box = await geometry(page)
      // One line: the brand fills the 40px caption strip, the frame's own brand
      // band collapses, and the activity rail starts right below the caption.
      expect(box.brandTop).toBe(0)
      expect(box.brandHeight).toBe(40)
      expect(box.headerHeight).toBe(0)
      expect(box.railTop).toBe(40)
      // The caption controls start after the measured wordmark, not at a fixed inset.
      expect(box.captionControlsStart).not.toBe('')
      // The native menus start after the wordmark rather than over it.
      expect(box.menuStartX).toBeGreaterThanOrEqual(box.brandRight)

      // An activity replaces the Workspace columns, which unloads the sidebar
      // and everything it published. The brand stays in the caption, so the
      // menus must keep starting after it instead of falling back over it.
      await page.getByRole('navigation', { name: 'Activity bar' })
        .getByRole('button', { name: 'Plugins', exact: true }).click()
      await page.locator('[data-plugin-panel]').waitFor()
      const activity = await geometry(page)
      expect(activity.brandTop).toBe(0)
      expect(activity.menuStartX).toBeGreaterThanOrEqual(activity.brandRight)
      expect(activity.captionControlsStart).not.toBe('')

      // Back on the Workspace activity the reservation is unchanged.
      await page.getByRole('navigation', { name: 'Activity bar' })
        .getByRole('button', { name: 'Workspace', exact: true }).click()
      await page.locator('[data-plugin-panel]').waitFor({ state: 'detached' })
      const workspace = await geometry(page)
      expect(workspace.menuStartX).toBeGreaterThanOrEqual(workspace.brandRight)
      expect(console.pageErrors).toEqual([])
    } finally {
      await browser.close()
    }
  } finally {
    await scaffold.close()
  }
})
