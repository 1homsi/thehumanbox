import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ToolSprite } from './ToolSprite'
import type { SandboxTool } from '../../simulation/sandbox'
import { searchWorldTools } from './tool-search'
import './world-tool-search.css'

type ToolResult = ReturnType<typeof searchWorldTools>[number]

// The dialog body holds a button and sprite for every world tool. It is mounted
// even while the dialog is closed, and the app re-renders with every world
// frame, so the list only re-renders when the results or the handler change.
const ToolResults = memo(function ToolResults({
  results,
  onPick,
}: {
  results: ToolResult[]
  onPick: (tool: SandboxTool) => void
}) {
  return (
    <div className="tool-search-results">
      {results.map(({ category, tool }) => (
        <button key={tool.id} onClick={() => onPick(tool)}>
          <span className="tool-search-icon" aria-hidden="true">
            <ToolSprite icon={tool.icon} />
          </span>
          <span>
            <strong>{tool.label}</strong>
            <small>
              {category} · {tool.mode === 'point' ? 'place on the map' : 'apply immediately'}
            </small>
          </span>
          <span aria-hidden="true">→</span>
        </button>
      ))}
    </div>
  )
})

/**
 * The tool search dialog. It opens from "Find a tool" in the ⋯ menu or the phone menu, and from
 * the `/` key; closing it hands focus back to whatever had it, or to the map.
 */
export function WorldToolSearch({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (tool: SandboxTool) => void
}) {
  const [query, setQuery] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const results = useMemo(() => searchWorldTools(query), [query])
  const onPickRef = useRef(onPick)
  useEffect(() => {
    onPickRef.current = onPick
  })
  useEffect(() => {
    if (open) {
      const active = document.activeElement
      returnFocus.current = active instanceof HTMLElement && active !== document.body ? active : null
      setQuery('')
      if (!dialog.current?.open) dialog.current?.showModal()
      input.current?.focus()
    } else if (dialog.current?.open) dialog.current.close()
  }, [open])
  const close = useCallback(() => {
    onClose()
    const target = returnFocus.current?.isConnected
      ? returnFocus.current
      : document.querySelector<HTMLElement>('.map2d-world')
    target?.focus({ preventScroll: true })
  }, [onClose])
  const pick = useCallback(
    (tool: SandboxTool) => {
      onPickRef.current(tool)
      close()
    },
    [close],
  )
  if (typeof document === 'undefined') return null
  return createPortal(
    <dialog
      ref={dialog}
      className="world-tool-search"
      aria-labelledby="tool-search-title"
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
      onClose={() => open && onClose()}
    >
      <header>
        <div>
          <span>WORLD CONTROLS</span>
          <h2 id="tool-search-title">What would you like to do?</h2>
        </div>
        <button onClick={close} aria-label="Close tool search">
          ×
        </button>
      </header>
      <input
        ref={input}
        type="search"
        placeholder="Try water, heal, grass, pause…"
        aria-label="Find a world tool"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && query.trim() && results.length === 1) {
            e.preventDefault()
            pick(results[0].tool)
          }
        }}
      />
      <p className="tool-search-count" role="status">
        {results.length} tools{query ? ' found' : ' available'} · choose a tool to continue
      </p>
      <ToolResults results={results} onPick={pick} />
      {!results.length && (
        <p className="tool-search-empty">
          No matching tools. Try a terrain type, animal, map layer, or time control.
        </p>
      )}
    </dialog>,
    document.body,
  )
}
