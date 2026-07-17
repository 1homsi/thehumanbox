import { useEffect, useState } from 'react'
import { startTour, isTourSupported } from '../tour/tour'
import { useIsMobile } from '../hooks/useIsMobile'
import { getWorldSource } from '../simulation/worldSource'

const STORAGE_KEY = 'thb-welcome-seen-v1'

interface Step {
  title: string
  body: string
}

const SHARED_STEPS: Step[] = [
  {
    title: 'Welcome to The Human Box',
    body:
      'A living planetary simulation. Tiny humans are born, learn, build, fight, pray, ' +
      'die, and pass their stories on. You are just watching.',
  },
  {
    title: 'A world that evolves',
    body:
      'Lineages climb through eras — stone, bronze, iron, classical, all the way up to ' +
      'the information age. They discover tools, found religions, write books, and ' +
      'build cities on real terrain.',
  },
  {
    title: 'Real, persistent organisms',
    body:
      'Every human has a name, family, traits, friends, beliefs, and memories. Tap one ' +
      'to read their life story, ancestry, and last thoughts.',
  },
  {
    title: 'Let it run',
    body:
      'The simulation runs continuously on the server. Come back anytime — civilisations ' +
      'will have risen, fallen, and rewritten history while you were gone.',
  },
]

const LOCAL_STEPS: Step[] = [
  {
    title: 'This is your Human Box',
    body:
      'A private living world running on your device. Tiny humans are born, learn, build, ' +
      'fight, pray, die, and pass their stories on.',
  },
  {
    title: 'Watch it evolve — or shape it',
    body:
      'Follow any human, explore their family and memories, or use the game controls to change ' +
      'time, place buildings, and create disasters.',
  },
  {
    title: 'Private and local by default',
    body:
      'This world runs in your browser and saves on this device. It does not connect to The Human ' +
      'Box server. You can choose the persistent Shared World later in Settings.',
  },
]

export function WelcomeModal() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const isMobile = useIsMobile()
  const tourAvailable = !isMobile && isTourSupported()
  const steps = getWorldSource() === 'wasm' ? LOCAL_STEPS : SHARED_STEPS

  useEffect(() => {
    let seen = true
    try {
      seen = window.localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      /* ignore */
    }
    if (!seen) setOpen(true)
  }, [])

  if (!open) return null

  const isLast = step >= steps.length - 1
  const current = steps[step]

  const finish = (withTour: boolean) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      /* ignore */
    }
    setOpen(false)
    if (withTour) {
      window.setTimeout(() => startTour(), 350)
    }
  }

  const next = () => {
    if (isLast) finish(tourAvailable)
    else setStep((s) => s + 1)
  }

  const back = () => {
    if (step > 0) setStep((s) => s - 1)
  }

  return (
    <div className="welcome-backdrop" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="welcome-modal">
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
