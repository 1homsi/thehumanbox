import { calendarAt } from '../game/model/calendar'
import { captureCanvas } from '../game/render/cf/capture'
import { formatNumber, t } from '../i18n'
import { findMapCanvas } from './mapPicture'
import type { WorldState } from './types'

/** Where a shared world sends the people who tap the link. */
export const SHARE_URL =
  'https://thehumanbox.com/?utm_source=share&utm_medium=share_card&utm_campaign=share_world'

/** The name over the picture. The game's name is the same in every language. */
export const SHARE_TITLE = 'The Human Box'

const SHARE_CARD_WIDTH = 1200
const SHARE_CARD_HEIGHT = 630

/** The card's visible address: the play link without the campaign marks. */
export const SHARE_CARD_URL = 'thehumanbox.com'

const PAD = 64
const MAX_HEADLINE = 104

/** The shortest wording of what was shared: title, one line of this world's history. */
export function shareBlurb(world: WorldState): string {
  return t('share.shareText', { line: chronicleLine(world) })
}

/** The same words plus the link, for a clipboard or a message that has no URL field. */
export function shareCopyText(world: WorldState): string {
  return `${shareBlurb(world)}\n${SHARE_URL}`
}

/**
 * One line from the world's real history. The newest headline is the most telling when there is one; a
 * new world still gets the year, its people and its tribes, all read from the frame rather than invented.
 */
export function chronicleLine(world: WorldState): string {
  const year = t('share.card.year', { year: formatNumber(calendarAt(world.tick).year) })
  const headline = newestHeadline(world)
  if (headline) {
    // A headline that already names the year would otherwise say it twice.
    const line = /(?:^|\s)Year\s+\d+/i.test(headline) ? headline : `${year} — ${headline}`
    return shorten(line, MAX_HEADLINE)
  }
  return [
    year,
    t('share.card.people', { count: formatNumber(population(world)) }),
    t('share.card.tribes', { count: formatNumber(tribes(world)) }),
  ].join(' · ')
}

function newestHeadline(world: WorldState): string | null {
  for (const headline of world.headlines ?? []) {
    const text = cleanHeadline(headline.text)
    // The calendar's own year marker repeats what the stats line already says, and is not much of a story.
    if (!text || /^Year\s+\d+\s+begins\.?$/i.test(text)) continue
    return text
  }
  return null
}

/** Drop the emoji and spacing the simulation puts in front of a headline, and fold its whitespace. */
function cleanHeadline(text: string | undefined): string {
  return (text ?? '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function shorten(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

function population(world: WorldState): number {
  if (world.lineage_sizes) {
    return world.lineage_sizes.reduce((total, lineage) => total + (lineage.count ?? 0), 0)
  }
  return world.organisms?.filter((organism) => organism.alive).length ?? 0
}

function tribes(world: WorldState): number {
  if (world.lineage_sizes) {
    return world.lineage_sizes.filter((lineage) => (lineage.count ?? 0) > 0).length
  }
  return new Set(world.organisms?.filter((organism) => organism.alive).map((organism) => organism.lineage_id))
    .size
}

/**
 * The shareable picture: the map as it looks now, with the game's name, one line of this world's
 * history and the play address over it. Null when there is no map to read or the browser refuses to
 * encode the PNG.
 */
export async function buildShareCard(world: WorldState): Promise<Blob | null> {
  const map = findMapCanvas()
  if (!map) return null
  // A WebGL canvas is only readable in the frame that drew it (see captureCanvas).
  const mapBlob = await captureCanvas(map)
  if (!mapBlob) return null
  const image = await decode(mapBlob)
  if (!image) return null

  const canvas = document.createElement('canvas')
  canvas.width = SHARE_CARD_WIDTH
  canvas.height = SHARE_CARD_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    image.close?.()
    return null
  }

  try {
    drawCover(ctx, image, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT)
    drawWords(ctx, world)
  } catch {
    image.close?.()
    return null
  }
  image.close?.()
  return await canvasBlob(canvas)
}

interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  close?: () => void
}

async function decode(blob: Blob): Promise<DecodedImage | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob)
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
    } catch {
      // Some engines ship createImageBitmap without PNG support; the <img> path below still works.
    }
  }
  return await new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () =>
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        close: () => URL.revokeObjectURL(url),
      })
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    image.src = url
  })
}

/** Fill the card with the map, cropping the middle of whatever shape the map is. */
function drawCover(ctx: CanvasRenderingContext2D, image: DecodedImage, width: number, height: number): void {
  const scale = Math.max(width / image.width, height / image.height)
  const drawWidth = image.width * scale
  const drawHeight = image.height * scale
  ctx.drawImage(image.source, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
}

function drawWords(ctx: CanvasRenderingContext2D, world: WorldState): void {
  const width = SHARE_CARD_WIDTH
  const height = SHARE_CARD_HEIGHT

  // Darken the bottom for the words, and the left where the title sits. The map still shows through.
  const bottom = ctx.createLinearGradient(0, height * 0.36, 0, height)
  bottom.addColorStop(0, 'rgba(10, 8, 6, 0)')
  bottom.addColorStop(1, 'rgba(10, 8, 6, 0.94)')
  ctx.fillStyle = bottom
  ctx.fillRect(0, 0, width, height)

  const left = ctx.createLinearGradient(0, 0, width * 0.66, 0)
  left.addColorStop(0, 'rgba(10, 8, 6, 0.62)')
  left.addColorStop(1, 'rgba(10, 8, 6, 0)')
  ctx.fillStyle = left
  ctx.fillRect(0, 0, width, height)

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  // A small brass rule, as on the game's own panels.
  ctx.fillStyle = '#e8b64c'
  ctx.fillRect(PAD, 84, 54, 5)

  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)'
  ctx.shadowBlur = 14
  ctx.shadowOffsetY = 3
  ctx.fillStyle = '#f7ecd7'
  ctx.font = '700 68px ui-monospace, Menlo, monospace'
  ctx.fillText(SHARE_TITLE, PAD, 174)

  ctx.font = '500 32px ui-monospace, Menlo, monospace'
  ctx.fillStyle = '#f0e2c8'
  const lines = wrapLines(ctx, chronicleLine(world), width - PAD * 2, 2)
  lines.forEach((line, index) => {
    ctx.fillText(line, PAD, 474 + index * 44)
  })
  ctx.restore()

  ctx.fillStyle = '#e8b64c'
  ctx.font = '600 26px ui-monospace, Menlo, monospace'
  ctx.fillText(t('share.card.play', { url: SHARE_CARD_URL }), PAD, height - 52)
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (!line || ctx.measureText(next).width <= maxWidth) {
      line = next
      continue
    }
    lines.push(line)
    line = word
    if (lines.length === maxLines) break
  }
  if (lines.length < maxLines && line) lines.push(line)

  if (lines.join(' ').length < text.length) {
    const last = lines[maxLines - 1] ?? ''
    let clipped = last
    while (clipped && ctx.measureText(`${clipped}…`).width > maxWidth) clipped = clipped.slice(0, -1)
    lines[maxLines - 1] = `${clipped.trimEnd()}…`
  }
  return lines.slice(0, maxLines)
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png')
    } catch {
      resolve(null)
    }
  })
}
