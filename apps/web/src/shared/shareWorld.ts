import { pictureName } from './mapPicture'
import { trackEvent } from './observability'
import { buildShareCard, shareBlurb, shareCopyText, SHARE_TITLE, SHARE_URL } from './shareCard'
import { showShareToast } from './shareToast'
import type { WorldState } from './types'

/** The way a share actually went out. */
export type ShareMethod = 'native_share' | 'copy' | 'download'

function canShareData(data: ShareData): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false
  try {
    // Web Share Level 2's file test, as every browser documents it.
    return navigator.canShare({ files: data.files })
  } catch {
    return false
  }
}

/** True when the browser can put an image on the clipboard, not just text. */
function canCopyImage(): boolean {
  return (
    typeof ClipboardItem !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.clipboard?.write === 'function'
  )
}

/** Native share first, then the clipboard, then a download. */
export function chooseShareMethod(canShareFiles: boolean, canCopy: boolean): ShareMethod {
  if (canShareFiles) return 'native_share'
  if (canCopy) return 'copy'
  return 'download'
}

/** Hooks tests use; every one falls back to the browser's own API. */
export interface ShareHooks {
  buildCard?: (world: WorldState) => Promise<Blob | null>
  canShare?: (data: ShareData) => boolean
  canCopy?: () => boolean
  share?: (data: ShareData) => Promise<void>
  copy?: (blob: Blob, text: string) => Promise<void>
  download?: (blob: Blob, filename: string) => void
  notify?: (text: string) => void
  track?: (name: string, props: Record<string, unknown>) => void
}

/**
 * Make a picture of the current world and share it (or copy it, or download it). Resolves the method
 * actually used, or null when there was no map to share. `share_card_clicked` goes out once, after the
 * method is settled, so a fallback is counted as what the player really got.
 */
export async function shareWorldCard(world: WorldState, hooks: ShareHooks = {}): Promise<ShareMethod | null> {
  const build = hooks.buildCard ?? buildShareCard
  const blob = await build(world)
  if (!blob) return null

  const file = new File([blob], pictureName(world.tick), { type: 'image/png' })
  const data: ShareData = {
    title: SHARE_TITLE,
    text: shareBlurb(world),
    url: SHARE_URL,
    files: [file],
  }

  const canShare = hooks.canShare ?? canShareData
  const canCopy = hooks.canCopy ?? canCopyImage
  let method: ShareMethod | null = null

  if (canShare(data)) {
    try {
      await (hooks.share ?? nativeShare)(data)
      method = 'native_share'
    } catch (error) {
      // Closing the system sheet is still a native share: the player chose that path, then changed their mind.
      if (isAbort(error)) method = 'native_share'
    }
  }

  if (!method && canCopy()) {
    try {
      await (hooks.copy ?? copyImage)(blob, shareCopyText(world))
      method = 'copy'
      // The picture is copied; the words and link are offered in the toast, and copied with the picture
      // wherever the browser accepts both.
      const notify = hooks.notify ?? showShareToast
      notify(shareBlurb(world))
    } catch {
      // The clipboard refused the image: the download below is the fallback.
    }
  }

  if (!method) {
    const download = hooks.download ?? downloadBlob
    download(blob, pictureName(world.tick))
    method = 'download'
  }

  const track = hooks.track ?? trackEvent
  track('share_card_clicked', { method })
  return method
}

function nativeShare(data: ShareData): Promise<void> {
  return navigator.share(data)
}

function isAbort(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { name?: string }).name === 'AbortError'
}

/**
 * Put the picture on the clipboard, and the words beside it where the browser takes both. A browser
 * that accepts only one clipboard item still gets the picture.
 */
async function copyImage(blob: Blob, text: string): Promise<void> {
  const image = new ClipboardItem({ 'image/png': blob })
  try {
    await navigator.clipboard.write([
      image,
      new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }) }),
    ])
  } catch {
    await navigator.clipboard.write([image])
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // The picture is what was asked for; the toast still offers the words and link.
    }
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}
