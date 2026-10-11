// Script that runs in every page before the app starts (Page.addScriptToEvaluateOnNewDocument).
// It sets `window.__benchFirstFrame` to the time the map drew its first frame: the moment the startup
// cover (`.map2d-world > div`) fades to opacity 0. That is the one ready signal the capture tool waits
// for, so no capture relies on a fixed sleep.

export const PAGE_INIT = `(() => {
  const watch = () => {
    const mo = new MutationObserver(() => {
      const cover = document.querySelector('.map2d-world > div')
      if (cover && cover.style.opacity === '0' && window.__benchFirstFrame === undefined) {
        window.__benchFirstFrame = performance.now()
        mo.disconnect()
      }
    })
    mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] })
  }
  if (document.documentElement) watch()
  else document.addEventListener('DOMContentLoaded', watch)
})()`
