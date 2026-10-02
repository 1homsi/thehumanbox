import { memo } from 'react'
import clsx from 'clsx'
import { useShallow } from 'zustand/react/shallow'
import { useWorldStore } from '../stores/worldStore'
import { wildlifeCounts } from '../world/wildlife'
import { Tooltip } from './Tooltip'

/** What lives on the land: game to hunt, herds, and what hunts people. */
function WildlifePanelImpl() {
  // A flat string keeps the panel from re-rendering every tick.
  const stamp = useWorldStore(
    useShallow((s) =>
      wildlifeCounts(s.world?.animals).map((c) => `${c.label}:${c.count}:${c.away ?? 0}:${c.danger ? 1 : 0}`),
    ),
  )
  if (stamp.length === 0) return null
  return (
    <>
      <div className="section-title">WILDLIFE</div>
      <div className="history-grid">
        {stamp.map((row) => {
          const [label, count, away, danger] = row.split(':')
          return (
            <span key={label} style={{ display: 'contents' }}>
              <Tooltip
                tip={
                  danger === '1'
                    ? 'Hunts people when hungry'
                    : label === 'herds'
                      ? 'Sheep, cows, horses and chickens'
                      : 'Wild game, hunted for food: overhunting thins it'
                }
              >
                <span
                  className={clsx('hist-label', danger === '1' && 'wildlife-danger')}
                  style={{ cursor: 'default' }}
                >
                  {label}
                </span>
              </Tooltip>
              <span className="hist-val">
                {count}
                {Number(away) > 0 && <span className="wildlife-away"> +{away} away</span>}
              </span>
            </span>
          )
        })}
      </div>
    </>
  )
}

export const WildlifePanel = memo(WildlifePanelImpl)
