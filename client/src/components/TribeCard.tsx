import clsx from 'clsx'
import { useUIStore } from '../stores/store'
import { popHistory } from '../stores/worldStore'
import { sparklinePoints, trend } from '../world/pop-history'
import type { PrayerInfo, WorldState } from '../types'
import { lineageColor } from '../utils/constants'
import { PRAYER_KINDS } from '../world/prayers'
import { lossLine, PERIL_HELP, perilOf, remainingLine } from '../world/tribe-peril'
import { activeBattles, enemiesOf } from '../2d/world/battles'
import { tribeStatus } from '../world/tribe-status'
import { ToolSprite } from './ToolSprite'

interface Props {
  world: WorldState
  onAnswer: (prayer: PrayerInfo) => void
  /** Pick up a dock tool by id, looking at the tribe. */
  onTool: (toolId: string, at: { x: number; y: number }) => void
}

function Need({ label, value }: { label: string; value: number }) {
  const low = value < 0.45
  return (
    <div className={clsx('tribe-need', low && 'low')}>
      <span>{label}</span>
      <span className="tribe-need-bar">
        <span style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
    </div>
  )
}

/** How a tribe's numbers have moved over the last few seasons. */
function Sparkline({ lineage }: { lineage: string }) {
  const samples = popHistory.get(lineage) ?? []
  if (samples.length < 3) return null
  const direction = trend(samples)
  return (
    <div
      className={clsx('tribe-spark', direction)}
      title={`${samples[0]} → ${samples[samples.length - 1]} people lately`}
    >
      <svg width="72" height="14" viewBox="0 0 72 14" aria-hidden="true">
        <polyline points={sparklinePoints(samples, 72, 14)} fill="none" strokeWidth="1.5" />
      </svg>
      <span>{direction === 'up' ? 'growing' : direction === 'down' ? 'shrinking' : 'steady'}</span>
    </div>
  )
}

/**
 * The focused tribe at a glance: what they need, how they feel about the
 * gods, and what they are praying for. Appears when a tribe is focused from
 * the tribe list or the territory map.
 */
export function TribeCard({ world, onAnswer, onTool }: Props) {
  const focus = useUIStore((s) => s.focus)
  const setFocus = useUIStore((s) => s.setFocus)
  if (!focus.startsWith('lineage:')) return null
  const status = tribeStatus(world, focus.slice('lineage:'.length))
  if (!status) return null
  const prayer = status.prayer
  const enemies = enemiesOf(world.battles, status.id).map((l) => world.lineage_names?.[l] ?? l.slice(0, 6))
  const field = activeBattles(world.battles).find(
    (b) => b.attackers.includes(status.id) || b.defenders.includes(status.id),
  )
  const peril = perilOf(world, status.id)
  const losses = lossLine(world.tribe_losses?.[status.id])
  const help = peril ? PERIL_HELP[peril.cause] : null
  const lookAtTribe = (tool: string) => {
    const home = world.settlements?.find((s) => s.lineage_id === status.id)
    if (home) onTool(tool, { x: home.center[0], y: home.center[1] })
  }

  return (
    <div className="tribe-card" role="region" aria-label={`${status.name} tribe`}>
      <div className="tribe-card-head">
        <span className="lineage-dot" style={{ background: lineageColor(status.id) }} />
        <span className="tribe-card-name">{status.name}</span>
        <button className="tribe-card-close" aria-label="Close" onClick={() => setFocus('all')}>
          ×
        </button>
      </div>
      <div className="tribe-card-sub">
        {status.people} {status.people === 1 ? 'person' : 'people'}
        {status.era && ` · ${status.era} age`}
      </div>
      {peril && help && (
        <div className="tribe-peril" role="alert">
          <span>
            ⚠ on the brink: {remainingLine(peril.population)} of {peril.peak}, {help.reason}
          </span>
          <button className="tribe-peril-help" onClick={() => lookAtTribe(help.tool)}>
            {help.action}
          </button>
        </div>
      )}
      {enemies.length > 0 && field && (
        <div className="tribe-peril tribe-war" role="status">
          <span>⚔ at war with {enemies.join(', ')}</span>
          <button
            className="tribe-peril-help"
            onClick={() => onTool('peace', { x: field.location[0], y: field.location[1] })}
          >
            make peace
          </button>
        </div>
      )}
      <Sparkline lineage={status.id} />
      <Need label="food" value={status.food} />
      <Need label="water" value={status.water} />
      <Need label="health" value={status.health} />
      {losses && <div className="tribe-card-losses">lost lately: {losses}</div>}
      <div className="tribe-card-row">
        <span
          className={clsx('tribe-faith', status.blessed && 'blessed', status.despairing && 'despair')}
          title={
            status.lostFaith
              ? 'They have given up on the gods and rarely pray. Help them unasked to win them back.'
              : 'Answered prayers minus forsaken ones'
          }
        >
          ✧ faith {status.faith}
          {status.blessed
            ? ' · blessed'
            : status.lostFaith
              ? ' · lost faith'
              : status.despairing
                ? ' · despairing'
                : ''}
        </span>
        {status.sick > 0 && <span className="tribe-sick">{status.sick} sick</span>}
      </div>
      {status.nextAge && (
        <div className="tribe-next">
          <div className="tribe-next-head">
            <span>next: {status.nextAge.era} age</span>
            <button
              className="tribe-inspire"
              title="Inspire them: speeds up their next discovery"
              onClick={() => lookAtTribe('inspire')}
            >
              ✦ inspire
            </button>
          </div>
          <span className="tribe-need-bar">
            <span
              style={{
                width: `${Math.round((status.nextAge.known / Math.max(1, status.nextAge.required)) * 100)}%`,
              }}
            />
          </span>
          {status.nextAge.missing.length > 0 && (
            <div className="tribe-next-missing">
              still to learn: {status.nextAge.missing.slice(0, 3).join(', ')}
            </div>
          )}
          {status.nextAge.peopleNeeded > 0 && (
            <div className="tribe-next-missing">needs {status.nextAge.peopleNeeded} more people</div>
          )}
        </div>
      )}
      {prayer && (
        <button className="tribe-card-prayer" onClick={() => onAnswer(prayer)}>
          <ToolSprite icon={PRAYER_KINDS[prayer.kind]?.icon ?? '🙏'} size={16} />
          <span>{PRAYER_KINDS[prayer.kind]?.plea ?? 'praying'}</span>
          <span className="tribe-card-help">help</span>
        </button>
      )}
    </div>
  )
}
