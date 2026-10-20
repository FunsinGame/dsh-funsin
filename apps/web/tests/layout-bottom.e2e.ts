/** Bottom Slot geometry and lifetime in the shipped Web composition. */
import { fileURLToPath } from 'node:url'
import { chromium, type Page } from 'playwright'
import { expect, it } from 'vitest'
import { compareOrRefreshGolden, launchWebScaffold, watchConsole, webSnapshotMode } from './scaffold.ts'

async function geometry(page: Page) {
  return page.evaluate(() => {
    const bottom = document.querySelector<HTMLElement>('[data-shell-bottom]')!
    const header = document.querySelector<HTMLElement>('[data-shell-header]')!
    const statusbar = document.querySelector<HTMLElement>('[data-shell-statusbar]')!
    const rail = document.querySelector<HTMLElement>('[data-shell-activitybar]')!
    const rect = (element: Element) => {
      const box = element.getBoundingClientRect()
      return { top: box.top, height: box.height, bottom: box.bottom }
    }
    const maybeRect = (element: Element | null) => element === null ? null : rect(element)
    return {
      header: rect(header), statusbar: rect(statusbar), rail: rect(rail), railWidth: rail.getBoundingClientRect().width,
      // The Workspace tab strip is part of the Workspace activity's page.
      tabs: maybeRect(document.querySelector('[data-shell-workspace-tabs]')),
      bottom: rect(bottom),
      // A registered activity replaces the three columns with one content area,
      // so these three are absent while it is selected.
      main: maybeRect(document.querySelector('[data-slot="main"]')?.parentElement ?? null),
      sidebar: maybeRect(document.querySelector('[data-slot="sidebar"]')?.parentElement ?? null),
      rightbar: maybeRect(document.querySelector('[data-rightbar-col]')),
      overlay: rect(document.querySelector('[data-shell-overlay]')!),
      handles: [...document.querySelectorAll('[data-side]')].map(handle => rect(handle)),
      pageHeight: document.documentElement.scrollHeight,
    }
  })
}

it('reserves bottom content height without remounting it on activity navigation', async () => {
  const scaffold = await launchWebScaffold({
    extraOverlayPath: fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url)),
    extraInstallAnchors: [fileURLToPath(new URL('./fixtures/plugins/fixture-layout-bottom/package.json', import.meta.url))],
  })
  try {
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, locale: 'en-US' })
      const console = watchConsole(page)
      await page.goto(scaffold.authenticatedUrl)
      await page.locator('[data-shell-bottom]').waitFor({ state: 'attached' })
      const expected: string[] = []
      // The columns sit below two chrome bands — the frame's brand band and the
      // Workspace activity's own tab strip — and above the status bar. Each
      // takes its measured height, so the column expectation follows them
      // rather than the viewport edges.
      const check = async (height: number, caption = 0) => {
        await expect.poll(async () => (await geometry(page)).bottom.height).toBe(height)
        const result = await geometry(page)
        const viewportHeight = page.viewportSize()!.height
        expect(result.statusbar).toEqual({
          top: viewportHeight - result.statusbar.height, height: result.statusbar.height, bottom: viewportHeight,
        })
        expect(result.bottom).toEqual({
          top: viewportHeight - result.statusbar.height - height,
          height,
          bottom: viewportHeight - result.statusbar.height,
        })
        const tabsHeight = result.tabs?.height ?? 0
        const columns = {
          top: caption + result.header.height + tabsHeight,
          height: viewportHeight - caption - result.header.height - tabsHeight - height - result.statusbar.height,
          bottom: viewportHeight - result.statusbar.height - height,
        }
        expect(result.main).toEqual(columns)
        expect(result.sidebar).toEqual(columns)
        expect(result.rightbar).toEqual(columns)
        // The activity rail is frame chrome beside the tab strip: a fixed 48px
        // track from below the brand band down to the columns' bottom.
        expect(result.railWidth).toBe(48)
        expect(result.rail).toEqual({
          top: caption + result.header.height,
          height: tabsHeight + columns.height,
          bottom: columns.bottom,
        })
        expect(result.overlay).toEqual({ top: 0, height: viewportHeight, bottom: viewportHeight })
        for (const handle of result.handles) expect(handle).toEqual(columns)
        expect(result.pageHeight).toBe(viewportHeight)
        return result
      }
      expected.push(`empty: ${JSON.stringify(await check(0))}`)
      const entryId = await scaffold.ctx.loader.create({ name: '@fixture/layout-bottom' })
      const input = page.getByRole('textbox', { name: 'Bottom input' })
      await input.fill('Retained across activities')
      const original = await input.elementHandle()
      expected.push(`open: ${JSON.stringify(await check(240))}`)
      await page.getByRole('button', { name: 'Grow bottom', exact: true }).click()
      expected.push(`grown: ${JSON.stringify(await check(360))}`)
      // The Plugins activity replaces the three workbench columns whole, and the
      // bottom panel is frame chrome: its input keeps both value and identity.
      await page.getByRole('navigation', { name: 'Activity bar' }).getByRole('button', { name: 'Plugins', exact: true }).click()
      await page.locator('[data-plugin-panel]').waitFor()
      await expect.poll(() => page.locator('[data-shell-activity]').count()).toBe(1)
      await expect.poll(() => page.locator('[data-slot="main"]').count()).toBe(0)
      // The Workspace tab strip belongs to the Workspace activity, so it leaves
      // with the columns; the brand band above it stays.
      await expect.poll(() => page.locator('[data-shell-workspace-tabs]').count()).toBe(0)
      await expect.poll(() => page.locator('[data-frame-brand]').count()).toBe(1)
      await expect.poll(async () => (await geometry(page)).bottom.height).toBe(360)
      expect(await input.inputValue()).toBe('Retained across activities')
      expect(await input.evaluate((element, previous) => element === previous, original)).toBe(true)
      await original?.dispose()
      // Back to the Workspace activity: the columns return with the layout intact.
      await page.getByRole('navigation', { name: 'Activity bar' }).getByRole('button', { name: 'Workspace', exact: true }).click()
      await page.locator('[data-plugin-panel]').waitFor({ state: 'detached' })
      await expect.poll(() => page.locator('[data-shell-activity]').count()).toBe(0)
      await expect.poll(() => page.locator('[data-shell-workspace-tabs]').count()).toBe(1)

      for (const platform of ['darwin', 'windows', 'browser']) {
        await page.evaluate((value) => {
          document.documentElement.removeAttribute('data-platform')
          document.documentElement.toggleAttribute('data-windows-titlebar', value === 'windows')
          if (value === 'darwin') document.documentElement.setAttribute('data-platform', value)
          document.documentElement.style.setProperty('--dsh-windows-titlebar-height', '40px')
        }, platform)
        expected.push(`${platform}: ${JSON.stringify(await check(360, platform === 'windows' ? 40 : 0))}`)
      }
      await page.setViewportSize({ width: 520, height: 600 })
      await expect.poll(() => page.locator('[data-shell-bottom]').locator('..').getAttribute('data-sidebar-collapsed')).toBe('true')
      expected.push(`narrow: ${JSON.stringify(await check(360))}`)
      scaffold.ctx.loader.remove(entryId)
      await page.locator('[data-bottom-fixture]').waitFor({ state: 'detached' })
      expected.push(`unregistered: ${JSON.stringify(await check(0))}`)
      const nextEntryId = await scaffold.ctx.loader.create({ name: '@fixture/layout-bottom' })
      await input.waitFor()
      expect(await input.inputValue()).toBe('')
      await check(240)
      await page.getByRole('button', { name: 'Collapse bottom', exact: true }).click()
      expected.push(`collapsed: ${JSON.stringify(await check(0))}`)
      scaffold.ctx.loader.remove(nextEntryId)
      await expect.poll(() => page.locator('[data-slot="shell.bottom"] > *').count()).toBe(0)
      expect(await check(0)).toBeDefined()
      expect(console.pageErrors).toEqual([])
      expect(console.warnings).toEqual([])
      await compareOrRefreshGolden(fileURLToPath(new URL('./expected/layout-bottom/geometry.expected.md', import.meta.url)),
        expected.join('\n'), webSnapshotMode())
    } finally { await browser.close() }
  } finally { await scaffold.close() }
})
