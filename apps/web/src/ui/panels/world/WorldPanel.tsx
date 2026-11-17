import type { WorldState } from '../../../shared/types'
import { useNerdStats } from '../../../state/store'
import { t } from '../../../i18n'
import { HistoryGrid } from '../HistoryGrid'
import { LineagesList } from '../LineagesList'
import { EventLog } from '../EventLog'
import { WorldFooter } from '../WorldFooter'
import { WorldNow } from './WorldNow'
import { WorldFeed } from './WorldFeed'
import { TribeList } from './TribeList'
import { WildlifeStrip } from './WildlifeStrip'
import { SectionHead } from './InfoTip'
import './world-panel.css'

export function WorldPanel({ world }: { world: WorldState }) {
  const nerdStats = useNerdStats()
  return (
    <div className="world-panel">
      <WorldNow world={world} />
      <WorldFeed world={world} />
      <TribeList />
      <WildlifeStrip />
      {nerdStats ? (
        <div className="wp-nerd">
          <SectionHead title={t('panels.world.nerd.title')} tip={t('panels.world.nerd.tip')} />
          <HistoryGrid />
          <LineagesList />
          <EventLog />
          <WorldFooter world={world} />
        </div>
      ) : (
        <p className="wp-nerd-hint">{t('panels.world.nerd.hint')}</p>
      )}
    </div>
  )
}
