// Touch and narrow viewport regression checks for a production build.
//
//   pnpm build
//   node bench/mobile.mjs --shots /path/to/shots/MOB-38
//   node bench/mobile.mjs --strict-targets

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchChrome, sleep } from './cdp.mjs'
import { startStaticServer } from './static-server.mjs'
import { generate } from './gen-world.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const web = path.resolve(here, '..')
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i < 0 ? fallback : (process.argv[i + 1] ?? true)
}
const value = (name, fallback) => {
  const result = arg(name, fallback)
  if (result === true) throw new Error(`--${name} requires a value`)
  return result
}
const dist = path.resolve(value('build', path.join(web, 'dist')))
const fixture = String(value('fixture', 'standard'))
const shotsDir = arg('shots', null)
if (shotsDir === true) throw new Error('--shots requires a directory')
const strictTargets = process.argv.includes('--strict-targets')
const skipInteractions = process.argv.includes('--skip-interactions')
const viewports = String(value('viewports', '360x740,390x844,844x390,768x1024,1280x800'))
  .split(',')
  .map((size) => {
    const match = /^(\d+)x(\d+)$/.exec(size)
    if (!match) throw new Error(`invalid viewport ${JSON.stringify(size)}; expected WIDTHxHEIGHT`)
    const [width, height] = match.slice(1).map(Number)
    if (width <= 0 || height <= 0) throw new Error(`invalid viewport ${JSON.stringify(size)}`)
    return [width, height]
  })
const dprFor = (width, height) => (width < 600 || height <= 500 ? 3 : width < 1100 ? 2 : 1)
const cache = path.join(here, '.cache')
const wasmDir = path.join(web, 'src/wasm/sim-core')
const failures = []
const targetViolations = []

async function waitFor(page, expression, description, timeoutMs = 90_000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (await page.evaluate(expression).catch(() => false)) return
    await sleep(100)
  }
  throw new Error(`timed out waiting for ${description}`)
}

async function touch(page, type, points) {
  await page.send('Input.dispatchTouchEvent', { type, touchPoints: points })
}

async function drag(page, x1, y1, x2, y2, steps = 8) {
  await touch(page, 'touchStart', [{ x: x1, y: y1 }])
  for (let i = 1; i <= steps; i++) {
    await touch(page, 'touchMove', [{ x: x1 + ((x2 - x1) * i) / steps, y: y1 + ((y2 - y1) * i) / steps }])
  }
  await touch(page, 'touchEnd', [])
}

async function pinch(page, cx, cy, from, to, steps = 8) {
  const points = (distance) => [
    { id: 1, x: cx - distance / 2, y: cy },
    { id: 2, x: cx + distance / 2, y: cy },
  ]
  await touch(page, 'touchStart', points(from))
  for (let i = 1; i <= steps; i++) {
    await touch(page, 'touchMove', points(from + ((to - from) * i) / steps))
  }
  await touch(page, 'touchEnd', [])
}

/** Real touch tap on the first element matching `selector` (optionally one whose text contains `text`). */
async function tapElement(page, selector, text) {
  const point = await page.evaluate(`(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(selector)})]
    const el = ${text ? `els.find((e) => (e.textContent || '').trim().toLowerCase().includes(${JSON.stringify(String(text).toLowerCase())}))` : 'els[0]'}
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`)
  if (!point) throw new Error(`no element for ${selector}${text ? ` matching ${JSON.stringify(text)}` : ''}`)
  await touch(page, 'touchStart', [{ id: 1, x: point.x, y: point.y }])
  await touch(page, 'touchEnd', [])
}

async function waitForStableCamera(page, timeoutMs = 10_000) {
  const until = Date.now() + timeoutMs
  let previous = null
  let stableSamples = 0
  while (Date.now() < until) {
    const camera = await page.evaluate('window.__thbBench.camera()')
    if (
      previous &&
      Math.abs(camera.x - previous.x) < 0.001 &&
      Math.abs(camera.y - previous.y) < 0.001 &&
      Math.abs(camera.zoom - previous.zoom) < 0.000001
    ) {
      stableSamples++
      if (stableSamples >= 3) return camera
    } else {
      stableSamples = 0
    }
    previous = camera
    await sleep(100)
  }
  throw new Error('camera did not settle')
}

function collectTargetViolations(targets, viewport, state) {
  for (const target of targets) {
    if (target.width < 44 || target.height < 44) targetViolations.push({ viewport, state, ...target })
  }
}

async function inspectLayout(page) {
  return page.evaluate(`(() => {
    const intersect = (a, b) => {
      const left = Math.max(a.left, b.left)
      const top = Math.max(a.top, b.top)
      const right = Math.min(a.right, b.right)
      const bottom = Math.min(a.bottom, b.bottom)
      return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
    }
    const visibleRect = (el) => {
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return null
      let rect = el.getBoundingClientRect()
      rect = intersect(rect, { left: 0, top: 0, right: innerWidth, bottom: innerHeight })
      for (let parent = el.parentElement; parent && parent !== document.documentElement; parent = parent.parentElement) {
        const s = getComputedStyle(parent)
        if (Number(s.opacity) === 0) return null
        const box = parent.getBoundingClientRect()
        if (s.overflowX !== 'visible') {
          rect.left = Math.max(rect.left, box.left)
          rect.right = Math.min(rect.right, box.right)
          rect.width = Math.max(0, rect.right - rect.left)
        }
        if (s.overflowY !== 'visible') {
          rect.top = Math.max(rect.top, box.top)
          rect.bottom = Math.min(rect.bottom, box.bottom)
          rect.height = Math.max(0, rect.bottom - rect.top)
        }
      }
      return rect.width > 0 && rect.height > 0 ? rect : null
    }
    const targets = [...document.querySelectorAll('button,a,[role="button"],input,select,textarea')]
      .map((el) => ({ el, rect: visibleRect(el) }))
      .filter(({ rect }) => rect)
      .map(({ el, rect }) => {
        const label = el.getAttribute('aria-label') || el.textContent?.trim().replace(/\\s+/g, ' ').slice(0, 50) || el.tagName
        return { label, width: rect.width, height: rect.height }
      })
    const modals = [...document.querySelectorAll('[role="dialog"],.thb-modal')]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }))
    return {
      innerWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0),
      targets,
      modals,
    }
  })()`)
}

function checkModalBounds(modals, width, height, label, required = false) {
  if (required && !modals.length) throw new Error(`no visible modal at ${label}`)
  for (const modal of modals) {
    if (modal.left < 0 || modal.top < 0 || modal.right > width + 1 || modal.bottom > height + 1)
      throw new Error(`modal exceeds ${label} viewport: ${JSON.stringify(modal)}`)
  }
}

async function captureShot(page, label) {
  if (!shotsDir) return
  mkdirSync(shotsDir, { recursive: true })
  const shot = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  writeFileSync(path.join(shotsDir, `${label}.png`), Buffer.from(shot.data, 'base64'))
}

async function checkViewport(origin, width, height, index) {
  const touchDevice = width < 1100
  const dpr = dprFor(width, height)
  const label = `${width}x${height}`
  let chrome
  const viewportFailures = []
  try {
    const port = 20_000 + Math.floor(Math.random() * 30_000) + index
    chrome = await launchChrome({ port, width, height, dpr })
    const { page } = chrome
    await page.send('Page.enable')
    await page.send('Runtime.enable')
    await page.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: dpr,
      mobile: touchDevice,
      screenWidth: width,
      screenHeight: height,
      screenOrientation: {
        type: width > height ? 'landscapePrimary' : 'portraitPrimary',
        angle: width > height ? 90 : 0,
      },
    })
    if (touchDevice) {
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 })
    }
    await page.send('Page.navigate', { url: `${origin}/__bench/seed.html?world=${fixture}` })
    await waitFor(page, 'window.__seeded === true', 'seeded world')
    await page.send('Page.navigate', { url: `${origin}/?bench=1` })
    await waitFor(
      page,
      '!!window.__thbBench && !!document.querySelector("[aria-label=\\"Interactive world map\\"]")',
      'world map',
    )
    await sleep(1500)

    const layout = await inspectLayout(page)
    await captureShot(page, label)
    if (layout.scrollWidth > layout.innerWidth + 1)
      viewportFailures.push(`horizontal overflow at load: ${layout.scrollWidth}px > ${layout.innerWidth}px`)
    if (touchDevice) collectTargetViolations(layout.targets, label, 'page')
    checkModalBounds(layout.modals, width, height, label)

    // MOB-07: the dock publishes its measured height, and toasts sit above the dock and the folder
    // tabs that stick up from it.
    const dock = await page.evaluate(`(() => {
      const el = document.querySelector('.sandbox-bar')
      const tabs = document.querySelector('.dock-tabs')
      const probe = document.createElement('div')
      probe.style.cssText =
        'position:fixed;left:0;bottom:var(--toast-clearance);width:1px;height:1px;visibility:hidden'
      document.body.append(probe)
      const bottomGap = innerHeight - probe.getBoundingClientRect().bottom
      probe.remove()
      return {
        measured: el ? el.offsetHeight : null,
        published: getComputedStyle(document.documentElement).getPropertyValue('--dock-h').trim(),
        bottomGap,
        tabsTop: tabs ? tabs.getBoundingClientRect().top : null,
      }
    })()`)
    if (!(dock.measured > 0)) viewportFailures.push('no measurable .sandbox-bar')
    else if (dock.published !== `${dock.measured}px`)
      viewportFailures.push(`--dock-h is ${dock.published}, expected ${dock.measured}px`)
    if (dock.tabsTop === null) viewportFailures.push('no .dock-tabs found for the toast-clearance check')
    else if (dock.bottomGap < height - dock.tabsTop - 1)
      viewportFailures.push(
        `a toast at --toast-clearance would cover the dock tabs (${dock.bottomGap}px up, tabs start ${height - dock.tabsTop}px up)`,
      )

    if (touchDevice) {
      // MOB-08 touch hygiene: no page rubber-band, and buttons react on the touch.
      // (-webkit-touch-callout is iOS-only and not exposed in Chrome, so it is not checked here.)
      const hygiene = await page.evaluate(`(() => {
        const tile = document.querySelector('.dock-tile')
        return {
          overflow: getComputedStyle(document.documentElement).overscrollBehavior,
          touchAction: tile ? getComputedStyle(tile).touchAction : null,
        }
      })()`)
      if (hygiene.overflow !== 'none')
        viewportFailures.push(`html overscroll-behavior is ${hygiene.overflow}, expected none`)
      if (hygiene.touchAction === null) viewportFailures.push('no .dock-tile found for the touch-action check')
      else if (hygiene.touchAction !== 'manipulation')
        viewportFailures.push(`dock tile touch-action is ${hygiene.touchAction}, expected manipulation`)
    }

    if (width === 390 && height === 844 && !skipInteractions) {
      try {
        const cx = width / 2
        const cy = Math.round(height * 0.45)
        // MOB-14: the on-screen zoom control must zoom the map on a touch tap.
        const zoomBefore = (await page.evaluate('window.__thbBench.camera()')).zoom
        const zoomBtn = await page.evaluate(`(() => {
          const el = document.querySelector('.map-controls [aria-label="Zoom in"]')
          if (!el) return null
          const r = el.getBoundingClientRect()
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
        })()`)
        if (!zoomBtn) throw new Error('the on-screen zoom-in control is missing on a phone')
        await touch(page, 'touchStart', [{ id: 1, x: zoomBtn.x, y: zoomBtn.y }])
        await touch(page, 'touchEnd', [])
        let zoomAfter = zoomBefore
        const zoomUntil = Date.now() + 3000
        while (Date.now() < zoomUntil && !(zoomAfter > zoomBefore + 0.001)) {
          await sleep(100)
          zoomAfter = (await page.evaluate('window.__thbBench.camera()')).zoom
        }
        if (!(zoomAfter > zoomBefore + 0.001))
          throw new Error(`the zoom-in control did not zoom (${zoomBefore} -> ${zoomAfter})`)
        // A fit camera has no pan range on the compact standard fixture. Zoom in first.
        await page.evaluate('window.__thbBench.command({kind:"zoom", factor:3})')
        await sleep(300)
        const beforePan = await page.evaluate('window.__thbBench.camera()')
        await drag(page, cx, cy, cx + 45, cy + 22)
        await sleep(300)
        const afterPan = await page.evaluate('window.__thbBench.camera()')
        if (Math.abs(afterPan.x - beforePan.x) + Math.abs(afterPan.y - beforePan.y) < 1)
          throw new Error(
            `one-finger touch pan did not move the camera (${JSON.stringify({ beforePan, afterPan })})`,
          )

        await pinch(page, cx, cy, 60, 110)
        await sleep(300)
        const afterPinch = await page.evaluate('window.__thbBench.camera()')
        if (Math.abs(afterPinch.zoom - afterPan.zoom) < 0.01)
          throw new Error('two-finger touch pinch did not change zoom')

        const selectedBefore = await page.evaluate(
          '!!document.querySelector(".panel-right.open .org-detail")',
        )
        if (selectedBefore) throw new Error('a person was selected before the tap-selection check')
        const meta = await (await fetch(`${origin}/__bench/${fixture}.json`)).json()
        const focus = meta.focus
        const tile = await page.evaluate('window.__thbBench.tile')
        const rect = await page.evaluate(`(() => {
          const r = document.querySelector('[aria-label="Interactive world map"]').getBoundingClientRect()
          return { left: r.left, top: r.top, width: r.width, height: r.height }
        })()`)
        await page.evaluate('window.__thbBench.command({kind:"fit"})')
        const camera = await waitForStableCamera(page)
        // Negative control: a tap on open sea far from every person must not select anyone.
        await touch(page, 'touchStart', [
          { id: 1, x: Math.round(rect.left + 6), y: Math.round(rect.top + 6) },
        ])
        await touch(page, 'touchEnd', [])
        await sleep(200)
        if (await page.evaluate('!!document.querySelector(".panel-right.open .org-detail")'))
          throw new Error('a tap on empty sea selected a person')
        const info = await page.evaluate('window.__thbBench.info()')
        const targets = info.peoplePositions
          .map((person) => ({
            ...person,
            distance: (person.x - focus.x) ** 2 + (person.y - focus.y) ** 2,
          }))
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 30)
        let selected = false
        for (const person of targets) {
          const px = Math.round(
            rect.left +
              rect.width / 2 +
              ((person.x - info.originX) * tile + tile / 2 - camera.x) * camera.zoom,
          )
          const py = Math.round(
            rect.top +
              rect.height / 2 +
              ((person.y - info.originY) * tile + tile / 2 - camera.y) * camera.zoom,
          )
          if (px < rect.left || px > rect.left + rect.width || py < rect.top || py > rect.top + rect.height)
            continue
          await touch(page, 'touchStart', [{ id: 1, x: px, y: py }])
          await touch(page, 'touchEnd', [])
          selected = await page
            .evaluate('!!document.querySelector(".panel-right.open .org-detail")')
            .catch(() => false)
          if (selected) break
        }
        if (!selected)
          throw new Error('touches at the 30 people nearest the seeded focus did not select anyone')
      } catch (error) {
        viewportFailures.push(`touch interaction: ${error?.message ?? error}`)
      }
    }

    if (touchDevice) {
      try {
        // Phones (<=767px) hide the header action row; the phone menu is their route to Stats.
        const menuVisible = await page.evaluate(
          `(() => {
            const btn = document.querySelector('.phone-menu-btn')
            return !!btn && getComputedStyle(btn).display !== 'none'
          })()`,
        )
        if (menuVisible) {
          await tapElement(page, '.phone-menu-btn')
          await waitFor(page, '!!document.querySelector(".phone-menu-modal")', 'phone menu')
          await captureShot(page, `${label}-phone-menu`)
          const menuLayout = await inspectLayout(page)
          if (menuLayout.scrollWidth > menuLayout.innerWidth + 1)
            viewportFailures.push(
              `horizontal overflow with the phone menu open: ${menuLayout.scrollWidth}px > ${menuLayout.innerWidth}px`,
            )
          checkModalBounds(menuLayout.modals, width, height, `${label} phone menu`, true)
          collectTargetViolations(menuLayout.targets, label, 'phone menu')
          for (const row of ['stats', 'civilization', 'chronicles', 'settings'])
            if (!menuLayout.targets.some((target) => target.label.toLowerCase().includes(row)))
              viewportFailures.push(`phone menu is missing the ${row} row`)
          await tapElement(page, '.phone-menu-row', 'stats')
          await waitFor(page, '!document.querySelector(".phone-menu-modal")', 'phone menu closed')
        } else {
          await page.evaluate('document.querySelector("[data-tour=stats-btn]")?.click()')
        }
        await waitFor(page, '!!document.querySelector(".thb-modal")', 'stats modal')
        const modalLayout = await inspectLayout(page)
        if (modalLayout.scrollWidth > modalLayout.innerWidth + 1)
          viewportFailures.push(
            `horizontal overflow with Stats modal open: ${modalLayout.scrollWidth}px > ${modalLayout.innerWidth}px`,
          )
        checkModalBounds(modalLayout.modals, width, height, label, true)
        collectTargetViolations(modalLayout.targets, label, 'stats modal')
        await page.evaluate('document.querySelector(".thb-modal [aria-label=Close]")?.click()')
      } catch (error) {
        viewportFailures.push(`Stats modal: ${error?.message ?? error}`)
      }
    }
  } catch (error) {
    viewportFailures.push(error?.message ?? String(error))
  } finally {
    if (chrome) await chrome.kill()
  }
  for (const failure of viewportFailures) failures.push(`${label}: ${failure}`)
  if (viewportFailures.length) console.error(`FAIL ${label}: ${viewportFailures.join('; ')}`)
  else console.log(`PASS ${label}: no horizontal overflow${touchDevice ? '; Stats modal fits' : ''}`)
}

async function main() {
  await generate({ cache, wasmDir })
  const server = await startStaticServer({ dist, cache })
  try {
    for (const [index, [width, height]] of viewports.entries())
      await checkViewport(server.origin, width, height, index)
  } finally {
    server.close()
  }
  const interactionViewportIncluded = viewports.some(([width, height]) => width === 390 && height === 844)
  if (!interactionViewportIncluded && !skipInteractions)
    failures.push(
      '390x844 is required for touch interactions; use --skip-interactions to omit them explicitly',
    )
  if (skipInteractions) console.warn('SKIP touch interactions: --skip-interactions was set')
  const violationsByState = new Map()
  for (const target of targetViolations) {
    const key = `${target.viewport} ${target.state}`
    violationsByState.set(key, (violationsByState.get(key) ?? 0) + 1)
  }
  const violationSummary = [...violationsByState].map(([key, count]) => `${key}: ${count}`).join(', ')
  if (strictTargets && targetViolations.length)
    failures.push(`interactive targets below 44x44: ${violationSummary}`)
  if (targetViolations.length)
    console.warn(
      `TARGETS below 44x44 by viewport/state: ${violationSummary}${strictTargets ? ' (strict failure)' : ' (informational; pass --strict-targets to fail)'}`,
    )
  if (failures.length) {
    console.error(failures.map((failure) => `- ${failure}`).join('\n'))
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
