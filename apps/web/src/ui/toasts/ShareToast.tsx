import { useEffect, useState } from 'react'
import { t } from '../../i18n'
import { SHARE_URL } from '../../shared/shareCard'
import { SHARE_TOAST_EVENT } from '../../shared/shareToast'

/** How long the copy toast stays if the player does not close it. */
const HIDE_AFTER_MS = 12_000

/**
 * Shown after a share card goes to the clipboard. The picture is already there; the words and the
 * link are offered beside it, and copied together by the button.
 */
export function ShareToast() {
  const [text, setText] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const onShow = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string }>).detail
      if (!detail?.text) return
      setText(detail.text)
      setCopied(false)
    }
    window.addEventListener(SHARE_TOAST_EVENT, onShow)
    return () => window.removeEventListener(SHARE_TOAST_EVENT, onShow)
  }, [])

  useEffect(() => {
    if (text === null) return
    const timer = window.setTimeout(() => setText(null), HIDE_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [text])

  if (text === null) return null

  const copyText = () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    navigator.clipboard
      .writeText(`${text}\n${SHARE_URL}`)
      .then(() => setCopied(true))
      .catch(() => undefined)
  }

  return (
    <div className="desktop-toast share-toast" role="status" aria-live="polite">
      <button
        className="desktop-toast-close"
        aria-label={t('dialogs.toast.dismiss')}
        onClick={() => setText(null)}
      >
        ×
      </button>
      <div className="desktop-toast-title">{t('share.toastTitle')}</div>
      <div className="desktop-toast-sub">{t('share.toastSub')}</div>
      <div className="share-toast-text">{text}</div>
      <a className="share-toast-link" href={SHARE_URL} target="_blank" rel="noreferrer">
        {SHARE_URL}
      </a>
      <div className="desktop-toast-actions">
        <button className="desktop-toast-primary" onClick={copyText}>
          {copied ? t('share.copied') : t('share.copyText')}
        </button>
      </div>
    </div>
  )
}
