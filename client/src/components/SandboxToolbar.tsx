import { useState } from 'react'
import clsx from 'clsx'
import { SANDBOX_CATEGORIES, type SandboxTool } from '../simulation/sandbox'

interface Props {
  armedToolId: string | null
  brush: number
  onBrush: (n: number) => void
  onPick: (tool: SandboxTool) => void
  onClearArmed: () => void
}

export function SandboxToolbar({ armedToolId, brush, onBrush, onPick, onClearArmed }: Props) {
  const [catId, setCatId] = useState(SANDBOX_CATEGORIES[0].id)
  const cat = SANDBOX_CATEGORIES.find((c) => c.id === catId) ?? SANDBOX_CATEGORIES[0]
  const hasPointTools = cat.tools.some((t) => t.mode === 'point')

  return (
    <div className="sandbox-bar">
      <div className="sandbox-tabs">
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
      </div>
      <div className="sandbox-tools">
        <button
          className={clsx('sandbox-tool', !armedToolId && 'active')}
          onClick={onClearArmed}
          title="Cursor — stop placing"
        >
          <span className="sandbox-tool-icon">🖱️</span>
        </button>
        {cat.tools.map((t) => (
          <button
            key={t.id}
            className={clsx('sandbox-tool', armedToolId === t.id && 'active')}
            onClick={() => onPick(t)}
            title={t.label}
          >
            <span className="sandbox-tool-icon">{t.icon}</span>
            <span className="sandbox-tool-label">{t.label}</span>
          </button>
        ))}
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
    </div>
  )
}
