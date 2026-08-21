import { useEffect, useMemo, useState, useRef } from 'react'
import { useUIStore } from '../stores/store'
import { getDesktop } from '../lib/desktop'

interface Command {
  id: string
  label: string
  hint?: string
  run: () => void
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const openStats = useUIStore((s) => s.openStats)
  const openCiv = useUIStore((s) => s.openCiv)
  const openChronicles = useUIStore((s) => s.openChronicles)
  const openOrgSearch = useUIStore((s) => s.openOrgSearch)
  const openDesktopSettings = useUIStore((s) => s.openDesktopSettings)
  const toggleLeft = useUIStore((s) => s.toggleLeft)
  const setViewFlag = useUIStore((s) => s.setViewFlag)
  const viewFlags = useUIStore((s) => s.viewFlags)

  const desktop = getDesktop()

  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [
      { id: 'stats', label: 'Open Stats', run: () => openStats() },
      { id: 'civ', label: 'Open Civilization', run: () => openCiv() },
      { id: 'chronicles', label: 'Open Chronicles', run: () => openChronicles() },
      {
        id: 'search',
        label: 'Find Organism',
        hint: 'search by name / thought / lineage',
        run: () => openOrgSearch(),
      },
      { id: 'left', label: 'Toggle Left Panel', run: () => toggleLeft() },
      {
        id: 'tour',
        label: viewFlags.randomTour ? 'Stop Random Tour' : 'Start Random Tour',
        run: () => setViewFlag('randomTour', !viewFlags.randomTour),
      },
      {
        id: 'three-d',
        label: viewFlags.threeD ? 'Switch to 2D' : 'Switch to 3D',
        run: () => setViewFlag('threeD', !viewFlags.threeD),
      },
      {
        id: 'hide-ui',
        label: viewFlags.hideUI ? 'Show UI' : 'Hide UI',
        hint: 'immersive mode · H',
        run: () => setViewFlag('hideUI', !viewFlags.hideUI),
      },
    ]
    if (desktop) {
      cmds.push(
        { id: 'desk-settings', label: 'Desktop Settings', run: () => openDesktopSettings() },
        {
          id: 'desk-screenshot',
          label: 'Take Screenshot',
          hint: 'save to ~/Pictures/TheHumanBox',
          run: () => void desktop.app.screenshot(),
        },
        { id: 'desk-open-worlds', label: 'Open Worlds Folder', run: () => void desktop.app.openWorlds() },
        { id: 'desk-open-logs', label: 'Open Logs Folder', run: () => void desktop.app.openLogs() },
      )
    }
    return cmds
  }, [
    openStats,
    openCiv,
    openChronicles,
    openOrgSearch,
    openDesktopSettings,
    toggleLeft,
    setViewFlag,
    viewFlags,
    desktop,
  ])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || (c.hint?.toLowerCase().includes(q) ?? false),
    )
  }, [commands, query])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const isOpenShortcut = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'
      if (isOpenShortcut) {
        e.preventDefault()
        setOpen((prev) => !prev)
        setQuery('')
        setHighlight(0)
        return
      }
      if (!open) return
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlight((h) => Math.min(filtered.length - 1, h + 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight((h) => Math.max(0, h - 1))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const cmd = filtered[highlight]
        if (cmd) {
          cmd.run()
          setOpen(false)
        }
        return
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, filtered, highlight])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    setHighlight(0)
  }, [query])

  if (!open) return null

  return (
    <div className="cmd-backdrop" onClick={() => setOpen(false)}>
      <div className="cmd-panel" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmd-input"
          placeholder="type a command..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="cmd-list">
          {filtered.length === 0 && <div className="cmd-empty">no matches</div>}
          {filtered.map((cmd, i) => (
            <div
              key={cmd.id}
              className={`cmd-row ${i === highlight ? 'cmd-row-active' : ''}`}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => {
                cmd.run()
                setOpen(false)
              }}
            >
              <span className="cmd-label">{cmd.label}</span>
              {cmd.hint && <span className="cmd-hint">{cmd.hint}</span>}
            </div>
          ))}
        </div>
        <div className="cmd-footer">↑↓ navigate · ↵ run · esc close</div>
      </div>
    </div>
  )
}
