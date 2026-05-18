import { memo } from 'react'
import { useWorldStore } from '../stores/worldStore'
import { Tooltip } from './Tooltip'

function HistoryGridImpl() {
  const h = useWorldStore((s) => s.world?.history)
  if (!h) return null
  return (
    <>
      <div className="section-title">WORLD HISTORY</div>
      <div className="history-grid">
        <Tooltip tip="Total organisms ever born into this world">
          <span className="hist-label" style={{ cursor: 'default' }}>births</span>
        </Tooltip>
        <span className="hist-val">{h.births}</span>
        <Tooltip tip="Deaths from old age - organisms that lived a full life">
          <span className="hist-label" style={{ cursor: 'default' }}>old age</span>
        </Tooltip>
        <span className="hist-val">{h.deaths_old_age}</span>
        <Tooltip tip="Deaths from starvation or dehydration - not enough food or water">
          <span className="hist-label" style={{ cursor: 'default' }}>starvation</span>
        </Tooltip>
        <span className="hist-val">{h.deaths_starvation}</span>
        <Tooltip tip="Deaths from disease - infection spread between organisms">
          <span className="hist-label" style={{ cursor: 'default' }}>sickness</span>
        </Tooltip>
        <span className="hist-val">{h.deaths_sickness}</span>
        <Tooltip tip="Deaths from combat - organisms killed in territorial or resource disputes">
          <span className="hist-label" style={{ cursor: 'default' }}>combat</span>
        </Tooltip>
        <span className="hist-val">{h.deaths_combat}</span>
        <Tooltip tip="Lineage alliances formed - mutual cooperation agreements between tribes">
          <span className="hist-label" style={{ cursor: 'default' }}>alliances</span>
        </Tooltip>
        <span className="hist-val">{h.alliances_formed}</span>
        <Tooltip tip="Total territorial challenges issued - one organism confronting another">
          <span className="hist-label" style={{ cursor: 'default' }}>challenges</span>
        </Tooltip>
        <span className="hist-val">{h.challenges_total}</span>
        <Tooltip tip="Food gifted between organisms - social bonding and kin support behaviour">
          <span className="hist-label" style={{ cursor: 'default' }}>gifts</span>
        </Tooltip>
        <span className="hist-val">{h.gifts_total}</span>
        <Tooltip tip="Drought events - periods of water scarcity that forced migration and die-offs">
          <span className="hist-label" style={{ cursor: 'default' }}>droughts</span>
        </Tooltip>
        <span className="hist-val">{h.droughts}</span>
        <Tooltip tip="Disease outbreaks - epidemic events that swept through the population">
          <span className="hist-label" style={{ cursor: 'default' }}>outbreaks</span>
        </Tooltip>
        <span className="hist-val">{h.outbreaks}</span>
      </div>
    </>
  )
}

export const HistoryGrid = memo(HistoryGridImpl)
