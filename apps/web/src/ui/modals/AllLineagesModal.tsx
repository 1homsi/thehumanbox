import type { OrganismState, TribePeril } from '../../shared/types'
import { useUIStore } from '../../state/store'
import { factsLine, type LineageFacts } from '../../game/model/lineage-facts'
import { PERIL_HELP, remainingLine, visibleLineages } from '../../game/model/tribe-peril'
import { lineageColor, lineageWord } from '../../shared/constants'
import { Modal } from './Modal'
import { formatNumber, t } from '../../i18n'

interface LineageInfo {
  count: number
  minGen: number
  maxGen: number
  orgs: OrganismState[]
}

interface Props {
  lineages: Record<string, LineageInfo>
  lineageWords?: Record<string, Record<string, string>>
  lineageNames?: Record<string, string>
  peril?: TribePeril[]
  facts?: Record<string, LineageFacts>
  onClose: () => void
}

export function AllLineagesModal({ lineages, lineageWords, lineageNames, peril, facts, onClose }: Props) {
  const setFocus = useUIStore((s) => s.setFocus)
  const tribeName = (lid: string) => lineageNames?.[lid] ?? (lid ?? '').slice(0, 6)
  const brink = new Map((peril ?? []).map((p) => [p.lineage_id, p.cause]))
  const rows = visibleLineages(
    Object.entries(lineages).map(([lid, info]) => ({ lid, info, count: info.count, peril: brink.get(lid) })),
    Infinity,
  )

  return (
    <Modal open onClose={onClose} className="lang-modal" title={t('dialogs.lineages.title')} hideTitle>
      <div className="lang-modal-header">
        <span className="lang-modal-title">
          {t('dialogs.lineages.heading', { count: formatNumber(Object.keys(lineages).length) })}
        </span>
        <button aria-label={t('dialogs.lineages.close')} className="close-btn" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="lang-modal-body">
        <div className="lineage-list">
          {rows.map(({ lid, info, peril: cause }) => (
            <div
              key={lid}
              role="button"
              tabIndex={0}
              onClick={() => {
                setFocus(`lineage:${lid}`)
                onClose()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setFocus(`lineage:${lid}`)
                  onClose()
                }
              }}
              className={'lineage-row all-lineages-row' + (cause ? ' peril' : '')}
              title={
                cause
                  ? t('dialogs.lineages.onBrink', {
                      remaining: remainingLine(info.count),
                      reason: t(PERIL_HELP[cause].reason),
                    })
                  : undefined
              }
            >
              <span className="lineage-dot" style={{ background: lineageColor(lid) }} />
              <span className="lineage-id">{tribeName(lid)}</span>
              <span className="lineage-count">
                {cause && <span className="lineage-peril">⚠</span>}
                {info.count}
              </span>
              <span className="lineage-gen">
                {t('dialogs.lineages.generation', { gen: info.minGen })}
                {info.maxGen > info.minGen ? t('dialogs.lineages.generationRange', { gen: info.maxGen }) : ''}
              </span>
              <span className="lineage-strat">
                {lineageWords?.[lid]?.home ||
                  lineageWords?.[lid]?.food ||
                  lineageWord(info.orgs, 'home') ||
                  lineageWord(info.orgs, 'food') ||
                  ''}
              </span>
              <span className="lineage-facts">{factsLine(facts?.[lid])}</span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
