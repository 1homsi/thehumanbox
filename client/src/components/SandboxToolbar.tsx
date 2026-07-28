import { useState } from 'react'
import clsx from 'clsx'
import { SANDBOX_CATEGORIES, type SandboxTool } from '../simulation/sandbox'
import { isRuntimeControlActive } from '../simulation/runtimeControls'

interface Props {
  armedToolId: string | null
  armedToolLabel?: string | null
  brush: number
  status?: string | null
  runtimePaused?: boolean
  runtimeSpeed?: number
  onBrush: (n: number) => void
  onPick: (tool: SandboxTool) => void
  onClearArmed: () => void
  onSave?: () => void
  saveStatus?: string
  saveBusy?: boolean
  saveError?: boolean
  saveRetryable?: boolean
}

function formatSpeed(speed: number): string {
  return `${Number.isInteger(speed) ? speed.toFixed(0) : speed}×`
}

export function SandboxToolbar({
  armedToolId,
  armedToolLabel,
  brush,
  status,
  runtimePaused = false,
  runtimeSpeed = 1,
  onBrush,
  onPick,
  onClearArmed,
  onSave,
  saveStatus,
  saveBusy = false,
  saveError = false,
  saveRetryable = false,
}: Props) {
  const [catId, setCatId] = useState(SANDBOX_CATEGORIES[0].id)
  const cat = SANDBOX_CATEGORIES.find((c) => c.id === catId) ?? SANDBOX_CATEGORIES[0]
  const hasPointTools = cat.tools.some((t) => t.mode === 'point')
  const runtimeStatus =
    cat.id === 'time' ? `${runtimePaused ? 'paused' : 'running'} · ${formatSpeed(runtimeSpeed)}` : null

  return (
    <div className="sandbox-bar">
      <div className="sandbox-dock">
        <nav className="sandbox-tabs" aria-label="World tools">
          {SANDBOX_CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={clsx('sandbox-tab', c.id === catId && 'active')}
              onClick={() => setCatId(c.id)}
              title={c.label}
            >
              <span className="sandbox-tab-icon">{c.icon}</span>
              <span className="sandbox-tab-label">{c.label}</span>
            </button>
          ))}
        </nav>
        <span className="sandbox-divider" aria-hidden="true" />
        <div className="sandbox-tools" aria-label={`${cat.label} tools`}>
          <button
            className={clsx('sandbox-tool', !armedToolId && 'active')}
            onClick={onClearArmed}
            title="Cursor — stop placing"
          >
            <span className="sandbox-tool-icon">🖱️</span>
          </button>
          {cat.tools.map((t) => {
            const active = armedToolId === t.id || isRuntimeControlActive(t.time, runtimePaused, runtimeSpeed)
            return (
              <button
                key={t.id}
                className={clsx('sandbox-tool', active && 'active')}
                aria-pressed={
                  t.time ? isRuntimeControlActive(t.time, runtimePaused, runtimeSpeed) : armedToolId === t.id
                }
                onClick={() => onPick(t)}
                title={t.label}
              >
                <span className="sandbox-tool-icon">{t.icon}</span>
                <span className="sandbox-tool-label">{t.label}</span>
              </button>
            )
          })}
          {hasPointTools && (
            <label className="sandbox-brush" title="Brush size">
              <span>brush</span>
              <input
                type="range"
                min={0}
                max={8}
                step={1}
                value={brush}
                onChange={(e) => onBrush(parseInt(e.target.value, 10))}
              />
              <span className="sandbox-brush-val">{brush}</span>
            </label>
          )}
        </div>
        <div className="sandbox-utility">
          {(armedToolId || status || runtimeStatus) && (
            <div className="sandbox-status" role="status" aria-live="polite">
              {status ??
                (armedToolId
                  ? `${armedToolLabel ?? 'tool'} armed - click the world to apply`
                  : runtimeStatus)}
            </div>
          )}
          {onSave && (
            <div className={clsx('sandbox-save', saveError && 'error')}>
              <button
                type="button"
                onClick={onSave}
                disabled={saveBusy || (saveError && !saveRetryable)}
                aria-label={
                  saveBusy ? 'saving' : saveError && saveRetryable ? '↻ retry save' : '💾 save world'
                }
                title={
                  saveError && saveRetryable
                    ? 'Retry saving this world on this device'
                    : 'Save this world on this device now'
                }
              >
                <span className="sandbox-save-icon">
                  {saveError && saveRetryable ? '↻' : saveBusy ? '…' : '💾'}
                </span>
                <span className="sandbox-save-label">
                  {saveBusy ? 'saving' : saveError && saveRetryable ? 'retry save' : 'save world'}
                </span>
              </button>
              {saveStatus && <span role="status">{saveStatus}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
