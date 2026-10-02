import type { OrganismState, TribePeril } from '../types'
import { PERIL_HELP, remainingLine, visibleLineages } from '../world/tribe-peril'
import { lineageColor, lineageWord } from '../utils/constants'
import { Modal } from './Modal'

interface LineageInfo {
  count: number
  minGen: number
  maxGen: number
  orgs: OrganismState[]
}

interface Props {
  lineages: Record<string, LineageInfo>
  lineageNames?: Record<string, string>
  peril?: TribePeril[]
  onClose: () => void
}

export function AllLineagesModal({ lineages, lineageNames, peril, onClose }: Props) {
  const tribeName = (lid: string) => lineageNames?.[lid] ?? (lid ?? '').slice(0, 6)
  const brink = new Map((peril ?? []).map((p) => [p.lineage_id, p.cause]))
  const rows = visibleLineages(
    Object.entries(lineages).map(([lid, info]) => ({ lid, info, count: info.count, peril: brink.get(lid) })),
    Infinity,
  )

  return (
    <Modal open onClose={onClose} className="lang-modal" title="All lineages" hideTitle>
      <div className="lang-modal-header">
        <span className="lang-modal-title">ALL LINEAGES ({Object.keys(lineages).length})</span>
        <button aria-label="Close" className="close-btn" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="lang-modal-body">
        <div className="lineage-list">
          {rows.map(({ lid, info, peril: cause }) => (
            <div
              key={lid}
              className={'lineage-row' + (cause ? ' peril' : '')}
              title={
                cause ? `On the brink: ${remainingLine(info.count)}, ${PERIL_HELP[cause].reason}` : undefined
              }
            >
              <span className="lineage-dot" style={{ background: lineageColor(lid) }} />
              <span className="lineage-id">{tribeName(lid)}</span>
              <span className="lineage-count">
                {cause && <span className="lineage-peril">⚠</span>}
                {info.count}
              </span>
              <span className="lineage-gen">
                g{info.minGen}
                {info.maxGen > info.minGen ? `–${info.maxGen}` : ''}
              </span>
              <span className="lineage-strat">
                {lineageWord(info.orgs, 'home') || lineageWord(info.orgs, 'food') || ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
