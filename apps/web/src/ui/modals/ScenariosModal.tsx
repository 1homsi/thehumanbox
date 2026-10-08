import { SCENARIO_PRESETS, type ScenarioPreset } from '../../simulation/scenarios'
import { Modal } from './Modal'

interface Props {
  onStart: (preset: ScenarioPreset) => void
  onClose: () => void
}

/** Ready-made additions to the world you are watching. Each one places people or animals and then gets out of the way. */
export function ScenariosModal({ onStart, onClose }: Props) {
  return (
    <Modal open onClose={onClose} className="scenarios-modal" title="Scenarios" hideTitle>
      <div className="lang-modal-header">
        <span className="lang-modal-title">SCENARIOS</span>
      </div>
      <p className="tree-modal-sub">
        Each scenario adds to the world you are watching. It does not start a new world.
      </p>
      <ul className="scenario-list" style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
        {SCENARIO_PRESETS.map((preset) => (
          <li
            key={preset.id}
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              padding: '8px 0',
              borderBottom: '1px solid #3a3020',
            }}
          >
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
              <span style={{ color: '#f4e6c0' }}>{preset.title}</span>
              <span className="tree-modal-sub">{preset.detail}</span>
            </span>
            <button type="button" className="tree-zoom-btn" onClick={() => onStart(preset)}>
              start
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
