import type { OrganismState } from '../types'
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
  onClose: () => void
}

export function AllLineagesModal({ lineages, lineageNames, onClose }: Props) {
  const tribeName = (lid: string) =>
    lineageNames?.[lid] ?? (lid ?? '').slice(0, 6)

  return (
    <Modal open onClose={onClose} className="lang-modal" title="All lineages" hideTitle>
      <div className="lang-modal-header">
        <span className="lang-modal-title">ALL LINEAGES ({Object.keys(lineages).length})</span>
        <button aria-label="Close" className="close-btn" onClick={onClose}>✕</button>
      </div>
      <div className="lang-modal-body">
        <div className="lineage-list">
          {Object.entries(lineages)
            .sort((a, b) => b[1].count - a[1].count)
            .map(([lid, info]) => (
              <div key={lid} className="lineage-row">
                <span className="lineage-dot" style={{ background: lineageColor(lid) }} />
                <span className="lineage-id">{tribeName(lid)}</span>
                <span className="lineage-count">{info.count}</span>
                <span className="lineage-gen">
                  g{info.minGen}{info.maxGen > info.minGen ? `–${info.maxGen}` : ''}
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
