import { SCENARIO_PRESETS, type ScenarioPreset } from '../../simulation/scenarios'
import { Modal, ModalHeader } from './Modal'
import { t } from '../../i18n'

interface Props {
  onStart: (preset: ScenarioPreset) => void
  onClose: () => void
}

/** Ready-made additions to the world you are watching. Each one places people or animals and then gets out of the way. */
export function ScenariosModal({ onStart, onClose }: Props) {
  return (
    <Modal open onClose={onClose} className="scenarios-modal" title={t('dialogs.scenarios.title')} hideTitle>
      <ModalHeader title={t('dialogs.scenarios.heading')} onClose={onClose} />
      <div className="thb-modal-body">
        <p className="tree-modal-sub scenario-intro">{t('dialogs.scenarios.intro')}</p>
        <ul className="scenario-list">
          {SCENARIO_PRESETS.map((preset) => (
            <li key={preset.id} className="scenario-row">
              <span className="scenario-text">
                <span className="scenario-title">{t(preset.title)}</span>
                <span className="tree-modal-sub">{t(preset.detail)}</span>
              </span>
              <button type="button" className="lang-btn" onClick={() => onStart(preset)}>
                {t('dialogs.scenarios.start')}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}
