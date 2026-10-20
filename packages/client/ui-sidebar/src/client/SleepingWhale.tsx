/**
 * The frame brand's fallback mark: a sleeping little whale, drawn in the same
 * `currentColor` ink as the rest of the chrome so both themes keep one
 * monochrome mark.
 *
 * The closed eye is a mask cut-out rather than a second fill, so the glyph
 * stays one colour on any band behind it.
 */
import { useId } from 'react'
import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'

/** Native viewBox of the sleeping-whale mark (width and height in user units). */
export const SLEEPING_WHALE_VIEWBOX = { width: 24, height: 20 }

/**
 * Render the sleeping-whale mark.
 * @param props.size - width in px (default 24; height keeps the 24:20 ratio).
 * @param props.className - extra class for layout placement.
 * @returns the mark svg (aria-hidden; pair with the wordmark for accessibility).
 */
export function SleepingWhale({ size = 24, className }: IconProps) {
  const lid = useId()
  return (
    <svg
      width={size}
      height={(size * SLEEPING_WHALE_VIEWBOX.height) / SLEEPING_WHALE_VIEWBOX.width}
      className={className}
      viewBox={`0 0 ${SLEEPING_WHALE_VIEWBOX.width} ${SLEEPING_WHALE_VIEWBOX.height}`}
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <mask id={`${lid}-eye`} maskUnits="userSpaceOnUse">
          <rect width={SLEEPING_WHALE_VIEWBOX.width} height={SLEEPING_WHALE_VIEWBOX.height} fill="white" />
          <path d="M5.6 10.3c.55-.75 1.55-.75 2.1 0" stroke="black" strokeWidth="1.05" strokeLinecap="round" fill="none" />
        </mask>
      </defs>
      <g fill="currentColor">
        <ellipse cx="9.2" cy="11.9" rx="7.4" ry="5.2" mask={`url(#${lid}-eye)`} />
        {/* Tail fluke sweeping up behind the back. */}
        <path d="M14.6 9.6C16.5 8.7 18.6 7.1 20.3 5.2c-.3 2-.7 4-1.5 5.9 1.3.2 2.5.6 3.5 1.2-2.1.9-4 1-5.9.5-.6-1.1-1.2-2.1-1.8-3.2z" />
        {/* Pectoral fin under the chin. */}
        <ellipse cx="8.4" cy="17.4" rx="2.5" ry="1.15" transform="rotate(32 8.4 17.4)" />
      </g>
      {/* Two drifting snores. */}
      <g stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M14.6 3.4h2.6l-2.6 2.5h2.6" />
        <path d="M18.4.7h1.9l-1.9 1.8h1.9" />
      </g>
    </svg>
  )
}
