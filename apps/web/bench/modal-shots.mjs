import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { launchChrome, sleep } from './cdp.mjs'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i < 0 || process.argv[i + 1] === undefined ? fallback : process.argv[i + 1]
}
const origin = new URL(arg('url', `http:localhost:${arg('port', '5205')}`)).origin
const out = path.resolve(arg('out', 'modal-shots'))
const only = arg('only', '').split(',').filter(Boolean)
const viewports = arg('viewports', '1920x1080,1280x720,768x1024,390x844')
  .split(',')
  .map((size) => {
    const match = /^(\d+)x(\d+)$/.exec(size)
    if (!match) throw new Error(`invalid viewport ${size}; expected WIDTHxHEIGHT`)
    return [Number(match[1]), Number(match[2])]
  })

const store = `(await import('/src/state/store.ts')).useUIStore`
const firstAlive = `(await import('/src/state/worldStore.ts')).useWorldStore.getState().world?.organisms.find((o) => o.alive)?.id`
const closeAll = `(async () => {
  const s = ${store}
  const state = s.getState()
  for (const key of Object.keys(state)) {
    if (/^close[A-Z]/.test(key) && typeof state[key] === 'function') state[key]()
  }
  s.setState({ showMore: false, selectedOrgId: null })
  const { settleConfirm } = await import('/src/shared/confirm.ts')
  settleConfirm(false)
})()`

const key = (k, mods = 0) => ({ kind: 'key', key: k, mods })

const SCREENS = [
  { id: 'about', open: `${store}.getState().openAbout()` },
  { id: 'achievements', open: `${store}.getState().openAchievements()` },
  { id: 'all-lineages', open: `${store}.getState().openAllLineages()` },
  { id: 'chronicles', open: `${store}.getState().openChronicles()` },
  { id: 'civ', open: `${store}.getState().openCiv()` },
  {
    id: 'confirm',
    open: `(await import('/src/shared/confirm.ts')).askConfirm({ title: 'Start a new world?', body: 'The world you are watching ends.', danger: true }); void 0`,
  },
  {
    id: 'conversations',
    open: `${store}.getState().openConvo(${firstAlive})`,
  },
  { id: 'family-tree', open: `${store}.getState().openFamilyTree(${firstAlive})` },
  { id: 'goals', open: `${store}.getState().openGoals()` },
  { id: 'languages', open: `${store}.getState().openLanguages()` },
  { id: 'notable', open: `${store}.getState().openNotable()` },
  { id: 'org-search', open: `${store}.getState().openOrgSearch()` },
  { id: 'scenarios', open: `${store}.getState().openScenarios()` },
  { id: 'settings', open: `${store}.getState().openDesktopSettings()` },
  { id: 'stats', open: `${store}.getState().openStats()` },
  { id: 'more-menu', desktop: true, open: `${store}.setState({ showMore: true })` },
  { id: 'phone-menu', phone: true, click: '.phone-menu-btn' },
  {
    id: 'world-drawer',
    open: `${store}.setState({ leftOpen: true })`,
    close: `${store}.setState({ leftOpen: false })`,
  },
  {
    id: 'people-drawer',
    open: `${store}.setState({ panelOpen: true })`,
    close: `${store}.setState({ panelOpen: false })`,
  },
  { id: 'person', open: `${store}.getState().selectOrg(${firstAlive})` },
  {
    id: 'life',
    open: `${store}.getState().selectOrg(${firstAlive})`,
    click: 'button[aria-label="Read their whole life"]',
  },
  { id: 'hotkeys', desktop: true, keys: [key('?')] },
  { id: 'command-palette', desktop: true, keys: [key('k', 2)] },
  { id: 'tool-search', desktop: true, keys: [key('/')] },
  {
    id: 'tour',
    open: `(await import('/src/ui/tour/tour.ts')).startTour('local')`,
    close: `document.querySelector('.shepherd-cancel-icon')?.click()`,
  },
]

async function evaluate(page, expression) {
  const res = await page.send('Runtime.evaluate', {
    expression: `(async () => { ${expression} })()`,
    awaitPromise: true,
    returnByValue: true,
  })
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? 'evaluate failed')
  return res.result?.value
}

async function waitFor(page, expression, what, ms = 90_000) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (await evaluate(page, `return !!(${expression})`).catch(() => false)) return
    await sleep(200)
  }
  throw new Error(`timed out waiting for ${what}`)
}

async function press(page, { key: k, mods }) {
  const printable = k.length === 1 && !mods
  const base = {
    key: k,
    modifiers: mods,
    ...(printable ? { text: k } : {}),
    ...(k === 'Escape' ? { code: 'Escape', windowsVirtualKeyCode: 27 } : {}),
  }
  await page.send('Input.dispatchKeyEvent', { type: printable ? 'keyDown' : 'rawKeyDown', ...base })
  await page.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: k,
    modifiers: mods,
    ...(k === 'Escape' ? { code: 'Escape', windowsVirtualKeyCode: 27 } : {}),
  })
}

const inspect = `
  const dialog = ['.thb-modal', '[role="dialog"]', '.more-dropdown', '.shepherd-element', '.panel-right.open', '.panel-left.open']
    .map((selector) => document.querySelector(selector))
    .find(Boolean)
  const small = []
  if (dialog && matchMedia('(pointer: coarse)').matches) {
    for (const el of dialog.querySelectorAll('button, [role="button"], a[href], input[type="checkbox"], select')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (Math.min(r.width, r.height) < 40) small.push((el.getAttribute('aria-label') || el.textContent || el.className).trim().slice(0, 40) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height))
    }
  }
  const r = dialog?.getBoundingClientRect()
  return {
    overflowX: document.documentElement.scrollWidth > innerWidth + 1,
    dialogOverflowX: dialog ? dialog.scrollWidth > dialog.clientWidth + 1 : false,
    dialogBox: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] : null,
    small: small.slice(0, 12),
  }
`

async function runViewport([width, height], index, report) {
  const phone = width < 600
  const touch = width < 1100
  const label = `${width}x${height}`
  const dir = path.join(out, label)
  mkdirSync(dir, { recursive: true })
  const chrome = await launchChrome({
    port: 21_000 + Math.floor(Math.random() * 20_000) + index,
    width,
    height,
    dpr: phone ? 2 : 1,
    mobile: touch,
  })
  try {
    const { page } = chrome
    await page.send('Page.enable')
    await page.send('Runtime.enable')
    await page.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try { localStorage.setItem('thb-welcome-seen-v1', '1'); localStorage.setItem('thb-opening-done-v1', '1') } catch {}`,
    })
    await page.send('Page.navigate', { url: `${origin}/` })
    await waitFor(page, `document.querySelector('.sandbox-bar .dock-tile')`, 'the world dock')
    await sleep(8000)
    for (const screen of SCREENS) {
      if (only.length && !only.includes(screen.id)) continue
      if (screen.desktop && touch) continue
      if (screen.phone && !phone) continue
      try {
        if (screen.open) await evaluate(page, screen.open)
        if (screen.click) {
          await waitFor(page, `document.querySelector('${screen.click}')`, screen.click, 8000)
          await evaluate(page, `document.querySelector('${screen.click}').click()`)
        }
        for (const k of screen.keys ?? []) await press(page, k)
        await sleep(1200)
        const found = await evaluate(page, inspect)
        const shot = await page.send('Page.captureScreenshot', { format: 'png' })
        writeFileSync(path.join(dir, `${screen.id}.png`), Buffer.from(shot.data, 'base64'))
        report.push({ viewport: label, screen: screen.id, ...found })
        const issues = [
          found.overflowX && 'page scrolls sideways',
          found.dialogOverflowX && 'dialog scrolls sideways',
          found.small.length && `small targets: ${found.small.join(', ')}`,
        ].filter(Boolean)
        console.log(`${label} ${screen.id}${issues.length ? ' -- ' + issues.join('; ') : ''}`)
      } catch (err) {
        report.push({ viewport: label, screen: screen.id, error: String(err.message ?? err) })
        console.log(`${label} ${screen.id} FAILED ${err.message ?? err}`)
      }
      await press(page, key('Escape')).catch(() => undefined)
      if (screen.close) await evaluate(page, screen.close).catch(() => undefined)
      await evaluate(page, closeAll).catch(() => undefined)
      await sleep(400)
    }
  } finally {
    chrome.kill()
  }
}

const report = []
for (const [i, viewport] of viewports.entries()) await runViewport(viewport, i, report)
mkdirSync(out, { recursive: true })
writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2))
console.log(`wrote ${report.length} shots to ${out}`)
