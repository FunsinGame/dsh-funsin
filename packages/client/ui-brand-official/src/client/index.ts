/** Official DeepSeek Harness occupants: the profile-gated frame brand slots and the home whale frame layer. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { PixelWhale } from './home-whale/PixelWhale.tsx'
import { OfficialBrandMark, OfficialBrandName } from './Brand.tsx'

/** Required service: the UI slot registry. */
export const inject = ['slots']

/**
 * Fill the frame brand slots as one declaration-aware registration set, and
 * frame the blank home with the whale decoration. The conversation hero stays
 * on its declaring package's animated fish fallback, so the official build
 * registers nothing there.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.hero.frame', () => ctx.slots.register({
    name: 'conversation.hero.frame',
    id: 'pixel-whale',
  }, PixelWhale))
  if (process.env.DSH_CLIENT_BUILD_PROFILE !== 'official') return
  ctx.slots.inject('shell.header.brand.mark', () =>
    ctx.slots.inject('shell.header.brand.name', function* () {
      yield ctx.slots.register({ name: 'shell.header.brand.mark' }, OfficialBrandMark)
      yield ctx.slots.register({ name: 'shell.header.brand.name' }, OfficialBrandName)
    }))
}
