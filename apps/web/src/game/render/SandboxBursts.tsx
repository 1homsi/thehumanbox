import type { CSSProperties } from 'react'
import type { Burst } from './sandbox-bursts'

/** Ash puffs that climb out of a volcano's vent, spreading as they rise. */
const ERUPTION_ASH = [0, 1, 2, 3, 4]
/** Lava bombs a volcano throws: how far each one lands from the vent, in pixels. */
const ERUPTION_BOMBS = [-34, -20, -8, 10, 24, 38]

/** Renders the short-lived god-tool effects from `useSandboxBursts`. */
export function SandboxBursts({ bursts, width, height }: { bursts: Burst[]; width: number; height: number }) {
  if (bursts.length === 0) return null
  return (
    <div className="sandbox-bursts" aria-hidden="true">
      {bursts.map((b) =>
        b.kind === 'meteor' ? (
          <div key={b.id}>
            <div className="burst-flash burst-flash-late" />
            <div className="burst-meteor" style={{ left: b.x, top: b.y }}>
              <span className="burst-meteor-rock" />
            </div>
            <div className="burst-impact burst-impact-late" style={{ left: b.x, top: b.y }} />
            <div
              className="burst-ring burst-shockwave"
              style={{ left: b.x, top: b.y, '--burst-r': `${Math.max(48, b.r * 1.5)}px` } as CSSProperties}
            />
          </div>
        ) : b.kind === 'eruption' ? (
          <div key={b.id}>
            <div
              className="burst-ring burst-quake"
              style={{ left: b.x, top: b.y, '--burst-r': `${Math.max(36, b.r * 1.2)}px` } as CSSProperties}
            />
            <div className="burst-vent" style={{ left: b.x, top: b.y }} />
            {ERUPTION_ASH.map((i) => (
              <span
                key={`a${i}`}
                className="burst-ash"
                style={{ left: b.x, top: b.y, '--i': i } as CSSProperties}
              />
            ))}
            {ERUPTION_BOMBS.map((dx, i) => (
              <span
                key={`l${i}`}
                className="burst-lava"
                style={{ left: b.x, top: b.y, '--dx': `${dx}px`, '--i': i } as CSSProperties}
              />
            ))}
          </div>
        ) : b.kind === 'bolt' ? (
          <div key={b.id}>
            <div className="burst-flash" />
            <svg className="burst-bolt" width={width} height={height} shapeRendering="crispEdges">
              <polyline points={b.path} className="burst-bolt-glow" />
              <polyline points={b.path} className="burst-bolt-core" />
            </svg>
            <div className="burst-impact" style={{ left: b.x, top: b.y }} />
          </div>
        ) : (
          <div
            key={b.id}
            className={`burst-ring burst-${b.kind}`}
            style={{ left: b.x, top: b.y, '--burst-r': `${Math.max(22, b.r)}px` } as CSSProperties}
          >
            {['heal', 'plague', 'bless', 'inspire', 'peace'].includes(b.kind) &&
              [0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="burst-spark" style={{ '--i': i } as CSSProperties} />
              ))}
          </div>
        ),
      )}
    </div>
  )
}
