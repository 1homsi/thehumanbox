import { useState, useEffect } from 'react'
import type { OrgLife, LifeEvent } from '../types'
import { Modal } from './Modal'
import { API_BASE } from '../lib/config'

const DAY_LENGTH = 600

const CATEGORY_ICON: Record<string, string> = {
  love:        '❤️',
  loss:        '💔',
  birth:       '🌱',
  friendship:  '🤝',
  discovery:   '🔍',
  achievement: '⭐',
  trauma:      '⚡',
  event:       '•',
}

const CATEGORY_COLOR: Record<string, string> = {
  love:        '#ff88aa',
  loss:        '#9966cc',
  birth:       '#55dd88',
  friendship:  '#ffcc44',
  discovery:   '#88ccff',
  achievement: '#ffaa33',
  trauma:      '#ff6644',
  event:       '#888',
}

function EventRow({ ev }: { ev: LifeEvent }) {
  const icon  = CATEGORY_ICON[ev.category]  ?? '•'
  const color = CATEGORY_COLOR[ev.category] ?? '#888'
  const day = ev.tick > 0 ? `day ${Math.floor(ev.tick / DAY_LENGTH)}` : ''
  return (
    <div className="life-event-row" style={{ borderLeft: `2px solid ${color}`, paddingLeft: 8, marginBottom: 6 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
        <span style={{ color, fontSize: 8, textTransform: 'uppercase', letterSpacing: 1 }}>{ev.category}</span>
        {day && <span style={{ color: '#555', fontSize: 8, marginLeft: 'auto' }}>{day}</span>}
      </div>
      <div style={{ color: '#ccc', fontSize: 10, marginTop: 2, lineHeight: 1.4 }}>{ev.text}</div>
      {ev.related_name && ev.category !== 'event' && (
        <div style={{ color: '#666', fontSize: 9, marginTop: 1 }}>↳ {ev.related_name}</div>
      )}
    </div>
  )
}

interface Props {
  orgId:   string
  orgName: string
  onClose: () => void
}

export function LifeModal({ orgId, orgName, onClose }: Props) {
  const [life, setLife]       = useState<OrgLife | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    // Abort the in-flight fetch when the modal unmounts or orgId
    // changes, so the late .then doesn't flip stale state onto the
    // next-opened modal.
    const ctrl = new AbortController()
    fetch(`${API_BASE}/org/${orgId}/life`, { signal: ctrl.signal })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then((d: OrgLife) => { setLife(d); setLoading(false) })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setError(true); setLoading(false)
      })
    return () => ctrl.abort()
  }, [orgId])

  const ageInDays = life ? Math.floor(life.age_ticks / DAY_LENGTH) : 0

  const categories = life
    ? [...new Set(life.events.map(e => e.category))].filter(c => c !== 'event')
    : []

  const recent = life ? life.events.slice(-10) : []
  const stuckCount = recent.length >= 6 && recent.every(e => e.text === recent[0].text)
    ? recent.length
    : 0

  return (
    <Modal open onClose={onClose} className="lang-modal life-modal" title={`${orgName}'s Life`} hideTitle>
      <div className="lang-modal-header">
        <span className="lang-modal-title">{orgName.toUpperCase()}'S LIFE</span>
        <button aria-label="Close" className="close-btn" onClick={onClose}>✕</button>
      </div>
      <div className="lang-modal-body">
        {loading && (
          <div className="life-skeleton">
            <div className="life-skel-meta" />
            <div className="life-skel-row" />
            <div className="life-skel-row short" />
            <div className="life-skel-section" />
            <div className="life-skel-event" />
            <div className="life-skel-event" />
            <div className="life-skel-event" />
            <div className="life-skel-event" />
          </div>
        )}
        {error && <div style={{ color: '#ff6644', textAlign: 'center', padding: 20 }}>failed to load</div>}
        {life && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, fontSize: 9, color: '#888' }}>
              <span>gen {life.generation}</span>
              <span>·</span>
              <span>{ageInDays} day{ageInDays !== 1 ? 's' : ''} old</span>
              <span>·</span>
              <span>{life.sex}</span>
              {life.is_elder && <><span>·</span><span style={{ color: '#ffcc44' }}>elder</span></>}
              {life.partner_id && <><span>·</span><span style={{ color: '#ff88aa' }}>partnered</span></>}
              {life.children_count > 0 && <><span>·</span><span>{life.children_count} child{life.children_count !== 1 ? 'ren' : ''}</span></>}
            </div>

            <div className="life-emotional-state" style={{
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: 4,
              padding: '6px 10px',
              marginBottom: 12,
              fontSize: 10,
              color: '#aaa',
            }}>
              <span style={{ color: '#888', fontSize: 8, textTransform: 'uppercase', letterSpacing: 1 }}>feeling</span>
              <span style={{ marginLeft: 8, color: '#ddd' }}>{life.emotional_state}</span>
            </div>

            {life.friends.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>friends</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {life.friends.map(f => (
                    <span key={f} style={{ background: '#2a2200', border: '1px solid #ffcc44', borderRadius: 3, padding: '2px 6px', fontSize: 9, color: '#ffcc44' }}>
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {life.discoveries.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>discoveries</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {life.discoveries.map(d => (
                    <span key={d} style={{ background: '#001a2a', border: '1px solid #88ccff', borderRadius: 3, padding: '2px 6px', fontSize: 9, color: '#88ccff' }}>
                      {d.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {categories.length > 0 && (
              <div style={{ marginBottom: 12, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {categories.map(c => (
                  <span key={c} style={{ fontSize: 8, color: CATEGORY_COLOR[c] ?? '#888', border: `1px solid ${CATEGORY_COLOR[c] ?? '#888'}`, borderRadius: 3, padding: '1px 5px' }}>
                    {CATEGORY_ICON[c]} {c}
                  </span>
                ))}
              </div>
            )}

            <div style={{ fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              life events ({life.events.length})
            </div>

            {stuckCount > 0 && (
              <div className="life-stuck-banner">
                ⚠ this organism is stuck: same action {stuckCount} times in a row
              </div>
            )}

            {life.events.length === 0 ? (
              <div style={{ color: '#555', fontSize: 10, textAlign: 'center', padding: 12 }}>
                no recorded events yet
              </div>
            ) : (
              <div className={life.events.length > 8 ? 'life-events-grid' : ''}>
                {[...life.events].reverse().map((ev, i) => (
                  <EventRow key={i} ev={ev} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
