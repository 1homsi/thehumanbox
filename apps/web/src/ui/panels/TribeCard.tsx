import clsx from 'clsx'
import { useState } from 'react'
import { useUIStore } from '../../state/store'
import { popHistory } from '../../state/worldStore'
import { sparklinePoints, trend } from '../../game/model/pop-history'
import type { PrayerInfo, WorldState } from '../../shared/types'
import { lineageColor } from '../../shared/constants'
import { PRAYER_KINDS, prayerPleaText } from '../../game/model/prayers'
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
import { formatNumber, t, type MessageKey } from '../../i18n'

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
      title={t('panels.tribe.sparkTitle', { from: samples[0]!, to: samples[samples.length - 1]! })}
    >
      <svg width="72" height="14" viewBox="0 0 72 14" aria-hidden="true">
        <polyline points={sparklinePoints(samples, 72, 14)} fill="none" strokeWidth="1.5" />
      </svg>
      <span>
        {direction === 'up'
          ? t('panels.tribe.growing')
          : direction === 'down'
            ? t('panels.tribe.shrinking')
            : t('panels.tribe.steady')}
      </span>
    </div>
  )
}

/**
 * The tribe's name, with its rename field. The draft lives here, keyed by tribe, so it is dropped when the
 * card moves to another tribe or hides (the card unmounts this with it).
 */
function TribeName({
  lineage,
  name,
  onRename,
}: {
  lineage: string
  name: string
  onRename: Props['onRename']
}) {
  const [editing, setEditing] = useState<string | null>(null)
  if (editing === null) {
    return (
      <button
        className="tribe-card-name tribe-card-rename"
        title={t('panels.tribe.rename')}
        onClick={() => setEditing(name)}
      >
        {name} <span aria-hidden="true">✎</span>
      </button>
    )
  }
  return (
    <input
      className="tribe-card-name-input"
      autoFocus
      maxLength={24}
      value={editing}
      aria-label={t('panels.tribe.nameLabel')}
      onChange={(e) => setEditing(e.target.value)}
      onBlur={() => setEditing(null)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') {
          const next = editing.trim()
          if (next && next !== name) onRename(lineage, next)
          setEditing(null)
        } else if (e.key === 'Escape') setEditing(null)
      }}
    />
  )
}

/** What a tribe known for each craft is said to be known for. */
const CRAFT_KEYS: Record<string, MessageKey> = {
  woodcutting: 'panels.tribe.lore.craft.woodcutting',
  quarrying: 'panels.tribe.lore.craft.quarrying',
  foraging: 'panels.tribe.lore.craft.foraging',
  fishing: 'panels.tribe.lore.craft.fishing',
  hunting: 'panels.tribe.lore.craft.hunting',
  farming: 'panels.tribe.lore.craft.farming',
  building: 'panels.tribe.lore.craft.building',
  crafting: 'panels.tribe.lore.craft.crafting',
  healing: 'panels.tribe.lore.craft.healing',
}

/**
 * The focused tribe at a glance: what they need, how they feel about the
 * gods, and what they are praying for. Appears when a tribe is focused from
 * the tribe list or the territory map.
 */
export function TribeCard({ world, onAnswer, onTool, onRename, onTeach }: Props) {
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
  const lore = world.lineage_lore?.[status.id]
  const craftKey = lore?.craft ? CRAFT_KEYS[lore.craft] : undefined
  const help = peril ? PERIL_HELP[peril.cause] : null
  const lookAtTribe = (tool: string) => {
    const home = world.settlements?.find((s) => s.lineage_id === status.id)
    if (home) onTool(tool, { x: home.center[0], y: home.center[1] })
  }

  return (
    <div
      className="tribe-card"
      role="region"
      aria-label={t('panels.tribe.regionLabel', { name: status.name })}
    >
      <div className="tribe-card-head">
        <span className="lineage-dot" style={{ background: lineageColor(status.id) }} />
        <TribeName key={status.id} lineage={status.id} name={status.name} onRename={onRename} />
        <button
          className="tribe-card-close"
          aria-label={t('panels.tribe.close')}
          onClick={() => setFocus('all')}
        >
          ×
        </button>
      </div>
      {leadership && (
        <div className="tribe-card-leader">
          {leadership.government}
          {leadership.leader && (
            <>
              {` · ${t('panels.tribe.ledBy')} `}
              <button
                className="tribe-leader-link"
                title={t('panels.tribe.followLeader')}
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
      {festival && (
        <div className="tribe-card-festival">♫ {t('panels.tribe.festival', { name: festival })}</div>
      )}
      <div className="tribe-card-sub">
        {t('panels.tribe.people', { count: status.people })}
        {status.era && ` · ${t('panels.tribe.eraAge', { era: status.era })}`}
        {gap && ` · ${t('panels.tribe.wealth', { gap })}`}
        {gens && ` · ${generationLine(gens)}`}
        {crime && ` · ${crime}`}
      </div>
      {peril && help && (
        <div className="tribe-peril" role="alert">
          <span>
            ⚠{' '}
            {t('panels.tribe.onBrink', {
              line: remainingLine(peril.population),
              peak: formatNumber(peril.peak),
              reason: t(help.reason),
            })}
          </span>
          <button className="tribe-peril-help" onClick={() => lookAtTribe(help.tool)}>
            {t(help.action)}
          </button>
        </div>
      )}
      {enemies.length > 0 && field && (
        <div className="tribe-peril tribe-war" role="status">
          <span>⚔ {t('panels.tribe.atWar', { enemies: enemies.join(', ') })}</span>
          <button
            className="tribe-peril-help"
            onClick={() => onTool('peace', { x: field.location[0], y: field.location[1] })}
          >
            {t('panels.tribe.makePeace')}
          </button>
        </div>
      )}
      <Sparkline lineage={status.id} />
      <Need label={t('panels.tribe.food')} value={status.food} />
      {status.stores > 0 && (
        <p className="tribe-stores">{t('panels.tribe.granary', { count: formatNumber(status.stores) })}</p>
      )}
      {status.bread > 0 && (
        <p className="tribe-stores">{t('panels.tribe.bakery', { count: formatNumber(status.bread) })}</p>
      )}
      {status.livestock > 0 && (
        <p className="tribe-stores">{t('panels.tribe.pen', { count: formatNumber(status.livestock) })}</p>
      )}
      <Need label={t('panels.tribe.water')} value={status.water} />
      <Need label={t('panels.tribe.health')} value={status.health} />
      {losses && <div className="tribe-card-losses">{t('panels.tribe.lostLately', { losses })}</div>}
      {relations && <div className="tribe-card-relations">{relations}</div>}
      {craftKey && (
        <div className="tribe-card-relations" title={t('panels.tribe.lore.craftTitle')}>
          {t(craftKey)}
        </div>
      )}
      {lore?.hungry_winter && (
        <div className="tribe-card-relations" title={t('panels.tribe.lore.winterTitle')}>
          {t('panels.tribe.lore.winter', { year: lore.hungry_winter })}
        </div>
      )}
      {!!lore?.war_weary && (
        <div className="tribe-card-relations" title={t('panels.tribe.lore.warWearyTitle')}>
          {t('panels.tribe.lore.warWeary', { count: lore.war_weary })}
        </div>
      )}
      {eldest && (
        <div className="tribe-card-relations" title={t('panels.tribe.oldestTitle')}>
          {t('panels.tribe.oldest', { line: eldestLine(eldest) })}
        </div>
      )}
      {families.length > 0 && (
        <div className="tribe-card-relations" title={t('panels.tribe.familiesTitle')}>
          {t('panels.tribe.families', { list: families.map(familyLineText).join(' · ') })}
        </div>
      )}
      <div className="tribe-card-row">
        <span
          className={clsx('tribe-faith', status.blessed && 'blessed', status.despairing && 'despair')}
          title={status.lostFaith ? t('panels.tribe.faithLostTitle') : t('panels.tribe.faithTitle')}
        >
          ✧ {t('panels.tribe.faith', { faith: status.faith })}
          {status.blessed
            ? ` · ${t('panels.tribe.blessed')}`
            : status.lostFaith
              ? ` · ${t('panels.tribe.lostFaith')}`
              : status.despairing
                ? ` · ${t('panels.tribe.despairing')}`
                : ''}
        </span>
        {status.sick > 0 && (
          <span className="tribe-sick">{t('panels.tribe.sick', { count: status.sick })}</span>
        )}
      </div>
      {status.nextAge && (
        <div className="tribe-next">
          <div className="tribe-next-head">
            <span>{t('panels.tribe.nextAge', { era: status.nextAge.era })}</span>
            <span className="tribe-next-actions">
              <button
                className="tribe-inspire"
                title={t('panels.tribe.inspireTitle')}
                onClick={() => lookAtTribe('inspire')}
              >
                ✦ {t('panels.tribe.inspire')}
              </button>
              {status.nextAge.missing.length > 0 && (
                <button
                  className="tribe-inspire"
                  title={t('panels.tribe.teachTitle')}
                  onClick={() => onTeach(status.id)}
                >
                  ✎ {t('panels.tribe.teach')}
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
              {t('panels.tribe.stillToLearn', { list: status.nextAge.missing.slice(0, 3).join(', ') })}
            </div>
          )}
          {status.nextAge.peopleNeeded > 0 && (
            <div className="tribe-next-missing">
              {t('panels.tribe.needsPeople', { count: status.nextAge.peopleNeeded })}
            </div>
          )}
        </div>
      )}
      {prayer && (
        <button className="tribe-card-prayer" onClick={() => onAnswer(prayer)}>
          <ToolSprite icon={PRAYER_KINDS[prayer.kind]?.icon ?? '🙏'} size={16} />
          <span>{prayerPleaText(prayer.kind) ?? t('panels.tribe.praying')}</span>
          <span className="tribe-card-help">{t('panels.tribe.help')}</span>
        </button>
      )}
    </div>
  )
}
