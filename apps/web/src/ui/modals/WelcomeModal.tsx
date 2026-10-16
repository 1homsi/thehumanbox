import { useCallback, useEffect, useRef, useState } from 'react'
import { startTour, isTourSupported, preloadTour } from '../tour/tour'
import { useIsMobile } from '../../shared/hooks/useIsMobile'
import { useSimulationData } from '../../simulation/simulationData'
import { welcomeStepsFor } from '../../simulation/playerWorldCopy'

const STORAGE_KEY = 'thb-welcome-seen-v1'

export function WelcomeModal() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const isMobile = useIsMobile()
  const tourAvailable = !isMobile && isTourSupported()
  const { playerWorldKind } = useSimulationData()
  const steps = welcomeStepsFor(playerWorldKind)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let seen = true
    try {
      seen = window.localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      /* ignore */
    }
    if (!seen) setOpen(true)
  }, [])

  // Fetch the tour code while the welcome steps are being read.
  useEffect(() => {
    if (open && tourAvailable) preloadTour()
  }, [open, tourAvailable])

  const finish = useCallback(
    (withTour: boolean) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, '1')
      } catch {
        /* ignore */
      }
      setOpen(false)
      if (withTour) {
        window.setTimeout(() => startTour(playerWorldKind), 350)
      }
    },
    [playerWorldKind],
  )

  // The card is a modal: Escape skips it, and Tab cycles between its buttons instead of
  // leaving for the page behind the backdrop. The keys listen on the document because a
  // click on the card's text leaves focus on the body, outside the card.
  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        finish(false)
        return
      }
      if (e.key !== 'Tab' || !cardRef.current) return
      const buttons = cardRef.current.querySelectorAll<HTMLButtonElement>('button')
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (!cardRef.current.contains(document.activeElement)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, finish])

  if (!open) return null

  const isLast = step >= steps.length - 1
  const current = steps[step]

  const next = () => {
    if (isLast) finish(tourAvailable)
    else setStep((s) => s + 1)
  }

  const back = () => {
    if (step > 0) setStep((s) => s - 1)
  }

  return (
    <div className="welcome-backdrop" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="welcome-modal" ref={cardRef}>
        <div className="welcome-step-indicator">
          {steps.map((_, i) => (
            <span key={i} className={'welcome-dot' + (i === step ? ' active' : i < step ? ' done' : '')} />
          ))}
        </div>
        <h2 id="welcome-title" className="welcome-title">
          {current.title}
        </h2>
        <p className="welcome-body">{current.body}</p>
        <div className="welcome-actions">
          <button
            type="button"
            className="welcome-btn welcome-btn--ghost"
            onClick={step === 0 ? () => finish(false) : back}
          >
            {step === 0 ? 'Skip' : 'Back'}
          </button>
          <button type="button" className="welcome-btn welcome-btn--primary" onClick={next} autoFocus>
            {isLast ? (tourAvailable ? 'Take the tour' : 'Got it') : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
