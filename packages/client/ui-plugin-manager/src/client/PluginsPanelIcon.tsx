/** The activity bar's Plugins entry glyph; the bar owns the button, label, and selected state around it. */

import type { ReactNode } from 'react'
import { IconPluginPinwheelOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'

/**
 * Render the plugin glyph at the size the activity bar asks for.
 * @param props - the bar's glyph share: the requested edge and whether the activity is selected.
 * @returns the icon element.
 */
export function PluginsPanelIcon({ size }: PropsRuntime<'shell.activitybar.items'>): ReactNode {
  return <IconPluginPinwheelOutlineRegular size={size} />
}
