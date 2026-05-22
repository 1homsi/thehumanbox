import { useEffect, useState } from 'react'

const STORAGE_KEY = 'thb-welcome-seen-v1'

interface Step {
  title: string
  body: string
}

const STEPS: Step[] = [
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

export function WelcomeModal() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    let seen = true
    try { seen = window.localStorage.getItem(STORAGE_KEY) === '1' }
    catch { /* ignore */ }
    if (!seen) setOpen(true)
  }, [])

  if (!open) return null

  const isLast = step >= STEPS.length - 1
  const current = STEPS[step]

  const finish = () => {
    try { window.localStorage.setItem(STORAGE_KEY, '1') } catch { /* ignore */ }
    setOpen(false)
  }

  const next = () => {
    if (isLast) finish()
    else setStep(s => s + 1)
  }

  const back = () => {
    if (step > 0) setStep(s => s - 1)
  }

  return (
    <div className="welcome-backdrop" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="welcome-modal">
        <div className="welcome-step-indicator">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={'welcome-dot' + (i === step ? ' active' : i < step ? ' done' : '')}
            />
          ))}
        </div>
        <h2 id="welcome-title" className="welcome-title">{current.title}</h2>
        <p className="welcome-body">{current.body}</p>
        <div className="welcome-actions">
          <button
            type="button"
            className="welcome-btn welcome-btn--ghost"
            onClick={step === 0 ? finish : back}
          >
            {step === 0 ? 'Skip' : 'Back'}
          </button>
          <button
            type="button"
            className="welcome-btn welcome-btn--primary"
            onClick={next}
            autoFocus
          >
            {isLast ? 'Enter the world' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
