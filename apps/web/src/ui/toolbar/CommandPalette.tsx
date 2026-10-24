import { useEffect, useMemo, useState, useRef } from 'react'
import { useUIStore } from '../../state/store'
import { getDesktop } from '../../shared/desktop'
import { t } from '../../i18n'

interface Command {
  id: string
  label: string
  hint?: string
  run: () => void | Promise<void>
}

type DesktopFailure =
  | 'settings.desktop.screenshotFailed'
  | 'settings.desktop.openWorldsFailed'
  | 'settings.desktop.openLogsFailed'

/**
 * A desktop tool whose failure is named in the palette. The settings tab does the same; a bare
 * `void` call would turn a refused folder into an unhandled rejection the player never sees.
 */
function desktopTool(failure: DesktopFailure, action: () => Promise<unknown>): () => Promise<void> {
  return async () => {
    try {
      await action()
    } catch (error) {
      throw new Error(t(failure, { error: error instanceof Error ? error.message : String(error) }), {
        cause: error,
      })
    }
  }
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const [failure, setFailure] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const ranCommand = useRef(false)
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
      { id: 'stats', label: t('dock.commands.openStats'), run: () => openStats() },
      { id: 'civ', label: t('dock.commands.openCiv'), run: () => openCiv() },
      { id: 'chronicles', label: t('dock.commands.openChronicles'), run: () => openChronicles() },
      {
        id: 'search',
        label: t('dock.commands.findOrganism'),
        hint: t('dock.commands.findOrganismHint'),
        run: () => openOrgSearch(),
      },
      { id: 'left', label: t('dock.commands.toggleLeft'), run: () => toggleLeft() },
      {
        id: 'tour',
        label: viewFlags.randomTour ? t('dock.commands.stopTour') : t('dock.commands.startTour'),
        run: () => setViewFlag('randomTour', !viewFlags.randomTour),
      },
      {
        id: 'hide-ui',
        label: viewFlags.hideUI ? t('dock.commands.showUI') : t('dock.commands.hideUI'),
        hint: t('dock.commands.hideUIHint'),
        run: () => setViewFlag('hideUI', !viewFlags.hideUI),
      },
    ]
    if (desktop) {
      cmds.push(
        { id: 'desk-settings', label: t('dock.commands.desktopSettings'), run: () => openDesktopSettings() },
        {
          id: 'desk-screenshot',
          label: t('dock.commands.screenshot'),
          hint: t('dock.commands.screenshotHint'),
          // screenshot() resolves null when the capture or its file write fails.
          run: desktopTool('settings.desktop.screenshotFailed', async () => {
            if (!(await desktop.app.screenshot())) throw new Error(t('settings.desktop.captureFailed'))
          }),
        },
        {
          id: 'desk-open-worlds',
          label: t('dock.commands.openWorlds'),
          run: desktopTool('settings.desktop.openWorldsFailed', () => desktop.app.openWorlds()),
        },
        {
          id: 'desk-open-logs',
          label: t('dock.commands.openLogs'),
          run: desktopTool('settings.desktop.openLogsFailed', () => desktop.app.openLogs()),
        },
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

  const runCommand = (cmd: Command) => {
    ranCommand.current = true
    setFailure(null)
    const outcome = cmd.run()
    if (!(outcome instanceof Promise)) {
      setOpen(false)
      return
    }
    // A command that is still running keeps the palette open; a failure stays on screen here.
    outcome.then(
      () => setOpen(false),
      (error: unknown) => setFailure(error instanceof Error ? error.message : String(error)),
    )
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const isOpenShortcut = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'
      if (isOpenShortcut) {
        e.preventDefault()
        setOpen((prev) => !prev)
        setQuery('')
        setHighlight(0)
        setFailure(null)
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
        if (cmd) runCommand(cmd)
        return
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, filtered, highlight])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    ranCommand.current = false
    inputRef.current?.focus()
    // The focused input unmounts with the palette and focus falls to <body>, which silences the map's
    // keyboard controls: hand it back to what had it (or the map), unless a command moved it elsewhere.
    const restore = () => {
      const active = document.activeElement
      if (active && active !== document.body) return
      // A command may have opened a modal; the map's keys must stay dead behind it.
      if (document.querySelector('[role="dialog"]')) return
      const target =
        previous instanceof HTMLElement && previous.isConnected && previous !== document.body
          ? previous
          : document.querySelector<HTMLElement>('.map2d-world')
      target?.focus({ preventScroll: true })
    }
    return () => {
      // Give a command's modal a frame to mount before deciding.
      if (ranCommand.current) requestAnimationFrame(restore)
      else restore()
    }
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
          placeholder={t('dock.palette.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="cmd-list">
          {failure && (
            <div className="cmd-empty cmd-failure" role="alert">
              {failure}
            </div>
          )}
          {filtered.length === 0 && <div className="cmd-empty">{t('dock.palette.empty')}</div>}
          {filtered.map((cmd, i) => (
            <div
              key={cmd.id}
              className={`cmd-row ${i === highlight ? 'cmd-row-active' : ''}`}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => {
                runCommand(cmd)
              }}
            >
              <span className="cmd-label">{cmd.label}</span>
              {cmd.hint && <span className="cmd-hint">{cmd.hint}</span>}
            </div>
          ))}
        </div>
        <div className="cmd-footer">{t('dock.palette.footer')}</div>
      </div>
    </div>
  )
}
