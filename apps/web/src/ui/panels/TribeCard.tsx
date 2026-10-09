import clsx from 'clsx'
import { useState } from 'react'
import { useUIStore } from '../../state/store'
import { popHistory } from '../../state/worldStore'
import { sparklinePoints, trend } from '../../game/model/pop-history'
import type { PrayerInfo, WorldState } from '../../shared/types'
import { lineageColor } from '../../shared/constants'
import { PRAYER_KINDS } from '../../game/model/prayers'
import { lossLine, PERIL_HELP, perilOf, remainingLine } from '../../game/model/tribe-peril'
import { activeBattles, enemiesOf } from '../../game/render/battles'
import { relationsLine, relationsOf } from '../../game/model/diplomacy'
import { leadershipOf } from '../../game/model/leadership'
import { festivalLabel } from '../../game/render/festivals'
import { tribeStatus } from '../../game/model/tribe-status'
import { wealthGapOf } from '../../game/model/inequality'
import { crimeLineOf } from '../../game/model/crime'
import { generationLine, generationsOf } from '../../game/model/generations'
import { familyLineText, familyLines } from '../../game/model/family-lines'
import { eldestByLineage, eldestLine } from '../../game/model/tribe-eldest'
import { ToolSprite } from '../toolbar/ToolSprite'

interface Props {
  world: WorldState
  onAnswer: (prayer: PrayerInfo) => void
  /** Pick up a dock tool by id, looking at the tribe. */
  onTool: (toolId: string, at: { x: number; y: number }) => void
  /** Give the tribe a name of the player's choosing. */
  onRename: (lineage: string, name: string) => void
  /** Teach the tribe the next secret it lacks. */
  onTeach: (lineage: string) => void
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
export function TribeCard({ world, onAnswer, onTool, onRename, onTeach }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const focus = useUIStore((s) => s.focus)
  const setFocus = useUIStore((s) => s.setFocus)
  if (!focus.startsWith('lineage:')) return null
  const status = tribeStatus(world, focus.slice('lineage:'.length))
  if (!status) return null
  const gap = wealthGapOf(world.lineage_inequality, status.id)
  const gens = generationsOf(world.lineage_generations, status.id)
  const crime = crimeLineOf(world.lineage_crime, status.id)
  const prayer = status.prayer
  const enemies = enemiesOf(world.battles, status.id).map((l) => world.lineage_names?.[l] ?? l.slice(0, 6))
  const field = activeBattles(world.battles).find(
    (b) => b.attackers.includes(status.id) || b.defenders.includes(status.id),
  )
  const relations = relationsLine(relationsOf(world, status.id))
  const leadership = leadershipOf(world, status.id)
  const festival = festivalLabel(world.festivals, status.id)
  const peril = perilOf(world, status.id)
  const losses = lossLine(world.tribe_losses?.[status.id])
  const families = familyLines(world.organisms, status.id)
  const eldest = eldestByLineage(world.organisms)[status.id]
  const help = peril ? PERIL_HELP[peril.cause] : null
  const lookAtTribe = (tool: string) => {
    const home = world.settlements?.find((s) => s.lineage_id === status.id)
    if (home) onTool(tool, { x: home.center[0], y: home.center[1] })
  }

  return (
    <div className="tribe-card" role="region" aria-label={`${status.name} tribe`}>
      <div className="tribe-card-head">
        <span className="lineage-dot" style={{ background: lineageColor(status.id) }} />
        {editing === null ? (
          <button
            className="tribe-card-name tribe-card-rename"
            title="Rename this tribe"
            onClick={() => setEditing(status.name)}
          >
            {status.name} <span aria-hidden="true">✎</span>
          </button>
        ) : (
          <input
            className="tribe-card-name-input"
            autoFocus
            maxLength={24}
            value={editing}
            aria-label="Tribe name"
            onChange={(e) => setEditing(e.target.value)}
            onBlur={() => setEditing(null)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') {
                const name = editing.trim()
                if (name && name !== status.name) onRename(status.id, name)
                setEditing(null)
              } else if (e.key === 'Escape') setEditing(null)
            }}
          />
        )}
        <button className="tribe-card-close" aria-label="Close" onClick={() => setFocus('all')}>
          ×
        </button>
      </div>
      {leadership && (
        <div className="tribe-card-leader">
          {leadership.government}
          {leadership.leader && (
            <>
              {' · led by '}
              <button
                className="tribe-leader-link"
                title="Follow the leader"
                onClick={() => {
                  const ui = useUIStore.getState()
                  ui.selectOrg(leadership.leader!.id)
                  ui.followOrg(leadership.leader!.id)
                }}
              >
                {leadership.leader.name}
              </button>
            </>
          )}
        </div>
      )}
      {festival && <div className="tribe-card-festival">♫ {festival} is under way</div>}
      <div className="tribe-card-sub">
        {status.people} {status.people === 1 ? 'person' : 'people'}
        {status.era && ` · ${status.era} age`}
        {gap && ` · wealth ${gap}`}
        {gens && ` · ${generationLine(gens)}`}
        {crime && ` · ${crime}`}
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
      {status.stores > 0 && <p className="tribe-stores">granary: {status.stores} measures of grain</p>}
      <Need label="water" value={status.water} />
      <Need label="health" value={status.health} />
      {losses && <div className="tribe-card-losses">lost lately: {losses}</div>}
      {relations && <div className="tribe-card-relations">{relations}</div>}
      {eldest && (
        <div className="tribe-card-relations" title="The oldest living member of this tribe">
          oldest living: {eldestLine(eldest)}
        </div>
      )}
      {families.length > 0 && (
        <div className="tribe-card-relations" title="The families of this tribe's living people">
          families: {families.map(familyLineText).join(' · ')}
        </div>
      )}
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
            <span className="tribe-next-actions">
              <button
                className="tribe-inspire"
                title="Inspire them: speeds up their next discovery"
                onClick={() => lookAtTribe('inspire')}
              >
                ✦ inspire
              </button>
              {status.nextAge.missing.length > 0 && (
                <button
                  className="tribe-inspire"
                  title="Teach them the next secret they lack (once a season)"
                  onClick={() => onTeach(status.id)}
                >
                  ✎ teach
                </button>
              )}
            </span>
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
