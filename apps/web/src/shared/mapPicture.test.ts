// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { findMapCanvas, pictureName } from './mapPicture'

describe('map pictures', () => {
  it('names the file after the tick', () => {
    expect(pictureName(12000.7)).toBe('the-human-box-tick-12000.png')
    expect(pictureName(undefined)).toBe('the-human-box-tick-0.png')
    expect(pictureName(-5)).toBe('the-human-box-tick-0.png')
  })

  it('finds the biggest canvas inside the map', () => {
    document.body.innerHTML = `
      <canvas width="900" height="900"></canvas>
      <div class="map2d-world"><canvas id="small" width="10" height="10"></canvas><canvas id="big" width="400" height="300"></canvas></div>`
    expect(findMapCanvas()?.id).toBe('big')
    document.body.innerHTML = ''
    expect(findMapCanvas()).toBeNull()
  })
})
