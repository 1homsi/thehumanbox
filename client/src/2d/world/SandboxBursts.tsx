import type { CSSProperties } from 'react'
import type { Burst } from './sandbox-bursts'

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
            {(b.kind === 'heal' || b.kind === 'plague') &&
              [0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="burst-spark" style={{ '--i': i } as CSSProperties} />
              ))}
          </div>
        ),
      )}
    </div>
  )
}
