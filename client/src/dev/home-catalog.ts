import { drawBuilding } from '../2d/world/buildings2d'
import { ERA_HOMES } from '../2d/world/era-home-catalog'
import { getBuildingSprite } from '../2d/world/building-sprites'

const eraSelect = document.querySelector<HTMLSelectElement>('#era')!
const night = document.querySelector<HTMLInputElement>('#night')!
const damaged = document.querySelector<HTMLInputElement>('#damaged')!
const container = document.querySelector<HTMLElement>('#homes')!
for (const era of new Set(ERA_HOMES.map((home) => home.era))) {
  const option = document.createElement('option')
  option.value = era
  option.textContent = era
  eraSelect.append(option)
}
function render() {
  container.replaceChildren()
  for (const home of ERA_HOMES.filter((entry) => entry.era === eraSelect.value)) {
    const sprite = getBuildingSprite(
      home.kind,
      ...home.footprint,
      12,
      0,
      night.checked ? 1 : 0,
      damaged.checked ? 0 : 1,
    )
    const figure = document.createElement('figure')
    const canvas = document.createElement('canvas')
    canvas.width = 88
    canvas.height = 78
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = night.checked ? '#263c3e' : '#607f52'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = night.checked ? '#34423b' : '#748658'
    ctx.fillRect(0, 60, canvas.width, 18)
    if (sprite) ctx.drawImage(sprite, Math.floor((88 - sprite.width) / 2), 64 - sprite.height)
    const caption = document.createElement('figcaption')
    caption.textContent = home.label
    const meta = document.createElement('small')
    meta.textContent = `${home.footprint.join(' × ')} tiles · ${home.capacity} residents`
    caption.append(meta)
    figure.append(canvas, caption)
    container.append(figure)
  }
}
eraSelect.addEventListener('change', render)
night.addEventListener('change', render)
damaged.addEventListener('change', render)
render()

/** Checks actual browser pixels, not a canvas mock. Exported for repeatable browser verification. */
export function verifyAllSprites() {
  const failures: string[] = []
  let renders = 0
  let worldMapDraws = 0
  const eraHashes = new Map<string, Set<string>>()
  const globalHashes = new Set<string>()
  for (const home of ERA_HOMES) {
    const mapPixels = [home.kind, home.wire].map((kind) => {
      const canvas = document.createElement('canvas')
      canvas.width = 128
      canvas.height = 128
      const ctx = canvas.getContext('2d')!
      drawBuilding(ctx, { id: 1, kind, x: 3, y: 3, footprint: home.footprint, condition: 1 }, 0, 0, 12)
      worldMapDraws++
      return ctx.getImageData(0, 0, 128, 128).data
    })
    if (!mapPixels[0].every((value, index) => value === mapPixels[1][index]))
      failures.push(`${home.kind}: wire and canonical world-map sprites differ`)
    for (const tile of [8, 12, 16]) {
      for (const [night, condition] of [
        [0, 1],
        [1, 1],
        [0, 0],
        [1, 0],
      ]) {
        const sprite = getBuildingSprite(home.kind, ...home.footprint, tile, 0, night, condition)
        renders++
        if (!sprite) {
          failures.push(`${home.kind}: missing canvas`)
          continue
        }
        const ctx = sprite.getContext('2d')!
        const pixels = ctx.getImageData(0, 0, sprite.width, sprite.height).data
        let opaque = 0
        let hash = 2166136261
        let clipped = false
        for (let y = 0; y < sprite.height; y++) {
          for (let x = 0; x < sprite.width; x++) {
            const offset = (y * sprite.width + x) * 4
            if (pixels[offset + 3] > 0) {
              opaque++
              if (x === 0 || y === 0 || x === sprite.width - 1 || y === sprite.height - 1) clipped = true
            }
            for (let channel = 0; channel < 4; channel++)
              hash = Math.imul(hash ^ pixels[offset + channel], 16777619)
          }
        }
        if (opaque < 20) failures.push(`${home.kind}: empty sprite at tile ${tile}`)
        if (clipped)
          failures.push(`${home.kind}: clipped at tile ${tile}, night ${night}, condition ${condition}`)
        if (tile === 12 && night === 0 && condition === 1) {
          const hashes = eraHashes.get(home.era) ?? new Set<string>()
          const identity = `${sprite.width}x${sprite.height}:${hash >>> 0}`
          hashes.add(identity)
          eraHashes.set(home.era, hashes)
          globalHashes.add(identity)
        }
      }
    }
  }
  for (const [era, hashes] of eraHashes)
    if (hashes.size !== 30) failures.push(`${era}: only ${hashes.size} distinct sprites`)
  const result = {
    homes: ERA_HOMES.length,
    eras: eraHashes.size,
    renders,
    worldMapDraws,
    distinctDaySprites: globalHashes.size,
    failures,
  }
  document.querySelector<HTMLElement>('#report')!.textContent = JSON.stringify(result, null, 2)
  return result
}
document.querySelector('#verify')!.addEventListener('click', verifyAllSprites)
