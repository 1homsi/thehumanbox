import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TribeUrgency, UrgencyTip } from './TribeUrgency'
import { tribeUrgency } from '../../game/model/tribe-urgency'
import { t } from '../../i18n'

const famine = tribeUrgency({ peril: null, losses: { starvation: 7 }, alive: 24, food: 0.2 })!

function html(urgency: ReturnType<typeof tribeUrgency>) {
  return renderToStaticMarkup(<TribeUrgency tick={100} urgency={urgency} />)
}

describe('TribeUrgency', () => {
  it('renders nothing for a calm tribe', () => {
    expect(html(tribeUrgency({ peril: null, losses: { old_age: 2 }, alive: 24, food: 0.8 }))).toBe('')
  })

  it('shows the body count and a shrinking gauge', () => {
    const out = html(famine)
    expect(out).toContain('tribe-urgency')
    expect(out).toContain(t('panels.tribe.urgency.famine'))
    expect(out).toContain(t('panels.tribe.urgency.lost', { count: '7', total: '31' }))
    expect(out).toContain('width:77%')
    expect(out).toContain('tribe-urgency-trend flat')
    expect(out).toContain(t('panels.tribe.steady'))
  })

  it('reads amber before anyone has died', () => {
    const out = html(tribeUrgency({ peril: null, losses: undefined, alive: 24, food: 0.2 }))
    expect(out).toContain(t('panels.tribe.urgency.noneLost'))
    expect(out).toContain('width:100%')
    expect(out).toContain('--urgency:rgb(224, 160, 48)')
    expect(out).not.toContain('grave')
  })

  it('turns red and marks heavy losses as grave', () => {
    const out = html(tribeUrgency({ peril: null, losses: { war: 12 }, alive: 18, food: 0.8 }))
    expect(out).toContain(t('panels.tribe.urgency.war'))
    expect(out).toContain('--urgency:rgb(208, 48, 42)')
    expect(out).toContain('tribe-urgency grave')
  })

  it('has a tooltip that explains the gauge', () => {
    const tip = renderToStaticMarkup(<UrgencyTip kind="plague" />)
    expect(tip).toContain(t('panels.tribe.urgency.plague'))
    expect(tip).toContain(t('panels.tribe.urgency.tip', { days: '5' }))
  })
})
