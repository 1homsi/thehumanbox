import { eraHome, type EraHome } from './era-home-catalog'
import { shade } from './sprite-colors'

interface HomePaint {
  ctx: CanvasRenderingContext2D
  x0: number
  y1: number
  w: number
  h: number
  night: number
  cond: number
  kind: string
}

/** Integer geometry keeps the generated homes sharp at the world's native tile size. */
export function paintCatalogHome(p: HomePaint): void {
  const home = eraHome(p.kind)
  if (!home) return
  const { ctx, x0, y1, w, h } = p
  const rect = (x: number, y: number, width: number, height: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(
      Math.round(x),
      Math.round(y),
      Math.max(1, Math.round(width)),
      Math.max(1, Math.round(height)),
    )
  }
  const polygon = (points: [number, number][], color: string) => {
    // Rasterize roofs a scanline at a time rather than antialiasing canvas paths.
    const top = Math.ceil(Math.min(...points.map(([, y]) => y)))
    const bottom = Math.floor(Math.max(...points.map(([, y]) => y)))
    for (let y = top; y <= bottom; y++) {
      const cuts: number[] = []
      for (let i = 0; i < points.length; i++) {
        const [ax, ay] = points[i]
        const [bx, by] = points[(i + 1) % points.length]
        if ((ay <= y && by > y) || (by <= y && ay > y)) cuts.push(ax + ((y - ay) * (bx - ax)) / (by - ay))
      }
      cuts.sort((a, b) => a - b)
      for (let i = 0; i + 1 < cuts.length; i += 2) rect(cuts[i], y, cuts[i + 1] - cuts[i], 1, color)
    }
  }
  const dome = (x: number, y: number, width: number, height: number, color: string) => {
    for (let row = 0; row < height; row++) {
      const span = Math.sqrt(1 - ((height - row - 1) / height) ** 2) * width
      rect(x + (width - span) / 2, y + row, span, 1, color)
    }
  }
  function dwelling(x: number, ground: number, width: number, height: number, mirror = false) {
    const { family, form, wall, roof, accent } = home as EraHome
    const roofH = Math.max(3, Math.round(height * (form === 1 || form === 5 ? 0.42 : 0.3)))
    const wallH = Math.max(4, height - roofH)
    const top = ground - wallH
    const dark = '#28282d'
    rect(x, top, width, wallH, dark)
    rect(x + 1, top + 1, width - 2, wallH - 2, wall)
    rect(x + width - 3, top + 1, 2, wallH - 2, shade(wall, 0.72))
    rect(x + 1, ground - 2, width - 2, 1, shade(wall, 0.63))
    // Era-specific structural materials: woven ribs, masonry, brick courses,
    // sealed alloy panels and luminous seams respectively.
    if (family === 0) {
      for (let column = x + 3; column < x + width - 2; column += 4)
        rect(column, top + 1, 1, wallH - 2, shade(wall, 0.7))
    } else if (family <= 2) {
      for (let row = top + 4; row < ground - 2; row += 4) {
        rect(x + 1, row, width - 3, 1, shade(wall, 0.86))
        for (let column = x + 3 + (row % 2) * 2; column < x + width - 2; column += 7)
          rect(column, row - 3, 1, 3, shade(wall, 0.9))
      }
    } else {
      rect(x + 2, top + 2, width - 5, 1, accent)
      for (let column = x + 5; column < x + width - 3; column += 6)
        rect(column, top + 3, 1, wallH - 5, shade(wall, 0.83))
    }
    // Ten genuinely different roof silhouettes, retained by the named type
    // even after its lineage advances. Each is composed into three floor plans.
    switch (form) {
      case 0: // asymmetric lean-to / wedge
        polygon(
          [
            [x - 1, top + 1],
            [x + width + 1, top + 1],
            [x + (mirror ? width : 0), top - roofH],
          ],
          dark,
        )
        polygon(
          [
            [x, top],
            [x + width, top],
            [x + (mirror ? width - 1 : 1), top - roofH + 1],
          ],
          roof,
        )
        break
      case 1: // steep A-frame
      case 5: // offset saltbox
        polygon(
          [
            [x - 2, top + 1],
            [x + width + 2, top + 1],
            [x + width * (form === 1 ? 0.5 : 0.3), top - roofH],
          ],
          dark,
        )
        polygon(
          [
            [x - 1, top],
            [x + width + 1, top],
            [x + width * (form === 1 ? 0.5 : 0.3), top - roofH + 1],
          ],
          roof,
        )
        rect(x + width * 0.2, top - 1, width * 0.6, 1, shade(roof, 1.25))
        break
      case 2: // roundhouse / geodesic dome
        dome(x - 1, top - roofH, width + 2, roofH + 1, dark)
        dome(x, top - roofH + 1, width, roofH - 1, roof)
        rect(x + width / 2, top - roofH + 2, 1, roofH - 2, shade(roof, 1.3))
        break
      case 3: // broad hip roof
        polygon(
          [
            [x - 2, top + 1],
            [x + width + 2, top + 1],
            [x + width * 0.75, top - roofH],
            [x + width * 0.25, top - roofH],
          ],
          dark,
        )
        polygon(
          [
            [x - 1, top],
            [x + width + 1, top],
            [x + width * 0.75, top - roofH + 1],
            [x + width * 0.25, top - roofH + 1],
          ],
          roof,
        )
        break
      case 4: // flat terrace with parapet
        rect(x - 1, top - roofH / 2, width + 2, roofH / 2 + 2, dark)
        rect(x, top - roofH / 2 + 1, width, roofH / 2, roof)
        rect(x + 2, top - roofH / 2 + 2, width - 4, 1, shade(roof, 0.62))
        break
      case 6: // vaulted barrel
        dome(x - 2, top - roofH, width + 4, roofH + 2, dark)
        dome(x - 1, top - roofH + 1, width + 2, roofH, roof)
        for (let column = x + 3; column < x + width; column += 5)
          rect(column, top - roofH / 2, 1, roofH / 2, shade(roof, 0.7))
        break
      case 7: // stepped terraces
        for (let step = 0; step < 3; step++) {
          const inset = step * width * 0.12
          rect(x + inset - 1, top - (step * roofH) / 3 - 2, width - inset * 2 + 2, 3, dark)
          rect(x + inset, top - (step * roofH) / 3 - 1, width - inset * 2, 1, roof)
        }
        break
      case 8: // inverted butterfly / folded roof
        polygon(
          [
            [x - 2, top - roofH],
            [x + width / 2, top - 2],
            [x + width + 2, top - roofH],
            [x + width + 2, top + 1],
            [x - 2, top + 1],
          ],
          dark,
        )
        polygon(
          [
            [x - 1, top - roofH + 2],
            [x + width / 2, top - 1],
            [x + width + 1, top - roofH + 2],
            [x + width + 1, top],
            [x - 1, top],
          ],
          roof,
        )
        break
      case 9: // layered canopy
        for (let level = 0; level < 2; level++) {
          const inset = level * width * 0.15
          polygon(
            [
              [x + inset - 2, top - (level * roofH) / 2],
              [x + width - inset + 2, top - (level * roofH) / 2],
              [x + width / 2, top - ((level + 1) * roofH) / 2 - 2],
            ],
            dark,
          )
          polygon(
            [
              [x + inset - 1, top - (level * roofH) / 2 - 1],
              [x + width - inset + 1, top - (level * roofH) / 2 - 1],
              [x + width / 2, top - ((level + 1) * roofH) / 2 - 1],
            ],
            roof,
          )
        }
        break
    }
    const entryX = x + width * (mirror ? 0.68 : 0.32)
    const entryH = Math.max(3, wallH * 0.55)
    rect(entryX - 2, ground - entryH, 4, entryH, dark)
    if (family > 0) rect(entryX - 1, ground - entryH + 1, 2, entryH - 2, shade(roof, 0.7))
    if (family === 0) {
      rect(x + width * 0.68, top + 2, 2, 2, dark)
      // Hearth stone and bundles on the doorstep.
      rect(x + width - 5, ground - 3, 2, 2, accent)
    } else {
      const windowY = top + Math.max(2, wallH * 0.25)
      const windowX = x + width * (mirror ? 0.2 : 0.66)
      rect(windowX - 1, windowY - 1, 5, 5, dark)
      rect(windowX, windowY, 3, 3, p.night > 0 && p.cond > 0.45 ? accent : '#648da3')
      rect(windowX + 1, windowY, 1, 3, shade(wall, 0.65))
      if (wallH > 18) {
        rect(windowX - 1, windowY + 7, 5, 5, dark)
        rect(windowX, windowY + 8, 3, 3, p.night > 0 ? accent : '#648da3')
      }
    }
    if (family === 1) {
      rect(x + width * 0.75, top - roofH * 0.6 - 3, 3, roofH * 0.6, shade(wall, 0.7))
      rect(x + width * 0.75 - 1, top - roofH * 0.6 - 4, 5, 1, dark)
    } else if (family === 2) {
      rect(x + width * 0.7, top - roofH / 2 - 4, 3, 5, '#595763')
      rect(x + 1, top + wallH * 0.6, width - 2, 1, accent)
    } else if (family >= 3) {
      // Distinct technology details for later eras: collectors, living roofs,
      // airlocks, antennae, field rings and impossible floating crowns.
      const crown = top - roofH - 2
      const center = x + width / 2
      switch (home?.motif) {
        case 14:
        case 26:
        case 27:
          rect(center - 4, crown, 8, 3, '#386f98')
          for (let i = -3; i < 4; i += 2) rect(center + i, crown, 1, 3, accent)
          break
        case 16:
        case 22:
        case 30:
          rect(x + 2, top - 2, width - 4, 2, '#4d9465')
          for (let i = 3; i < width - 2; i += 4) rect(x + i, top - 4, 2, 3, accent)
          break
        case 17:
        case 18:
        case 19:
        case 23:
          rect(center - 4, crown - 1, 8, 1, accent)
          rect(center - 5, crown, 1, 4, accent)
          rect(center + 4, crown, 1, 4, accent)
          rect(entryX - 3, ground - entryH - 1, 6, 1, accent)
          break
        default: {
          rect(center, crown - 2, 1, 5, accent)
          const arms = 1 + ((home?.motif ?? 0) % 4)
          for (let i = 0; i < arms; i++) rect(center - 2 - i, crown + i, 5 + i * 2, 1, accent)
        }
      }
      if ((home?.motif ?? 0) >= 24) {
        rect(center - 3, crown - 5, 6, 1, accent)
        rect(center - 4, crown - 4, 1, 2, accent)
        rect(center + 3, crown - 4, 1, 2, accent)
      }
    }
    if (p.cond < 0.45) {
      rect(x + width * 0.55, top + wallH * 0.4, 1, wallH * 0.4, '#514638')
      rect(x + width * 0.55 - 1, top + wallH * 0.6, 2, 1, '#514638')
    }
  }
  const height = Math.min(h * (home.family === 0 ? 0.68 : 0.86), y1 - 11)
  if (home.layout === 0) dwelling(x0 + 1, y1, w - 2, height)
  else if (home.layout === 1) {
    dwelling(x0 + w * 0.43, y1 - 3, w * 0.54, height * 0.88, true)
    dwelling(x0 + 1, y1, w * 0.52, height)
    rect(x0 + w * 0.48, y1 - 3, w * 0.06, 3, shade(home.wall, 0.7))
  } else {
    // A rear hall and two forward wings enclose an open, visible courtyard.
    dwelling(x0 + w * 0.2, y1 - h * 0.24, w * 0.6, height * 0.7)
    rect(x0 + w * 0.27, y1 - h * 0.2, w * 0.46, h * 0.2, shade(home.wall, 0.62))
    dwelling(x0 + 1, y1, w * 0.3, height * 0.78)
    dwelling(x0 + w * 0.69, y1, w * 0.3 - 1, height * 0.78, true)
    rect(x0 + w * 0.42, y1 - 3, w * 0.16, 2, home.accent)
  }
}
