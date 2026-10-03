import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Modal } from './Modal'
import { askConfirm } from '../../shared/confirm'
import { ToolSprite } from '../toolbar/ToolSprite'
import { useUIStore, useViewFlag } from '../../state/store'
import { startTour, isTourSupported } from '../tour/tour'
import { useIsMobile } from '../../shared/hooks/useIsMobile'
import { useSimulationData } from '../../simulation/simulationData'
import { LOW_PERF } from '../../shared/perf'
import { readLowPerf, toggleLowPerf } from '../../shared/perf-mode'
import { getDesktop } from '../../shared/desktop'
import type {
  DesktopBridge,
  DesktopSettings,
  ModelProvider,
  SimStatus,
  UpdateCheckResult,
} from '../../shared/desktop'
import {
  getWorldSource,
  OWN_WORLD_ID,
  requestOwnWorldCheckpoint,
  requestOwnWorldRecovery,
  requestOwnWorldReset,
} from '../../simulation/worldSource'
import { deleteWorld, listRecoveryWorlds, loadWorld, type RecoveryWorld } from '../../simulation/wasmDb'
import { DESKTOP_PAUSE_WHEN_HIDDEN_EVENT } from '../../shared/desktopVisibility'

interface Props {
  onClose: () => void
}

function WorldSourceSection() {
  const source = getWorldSource()
  const [recoveries, setRecoveries] = useState<RecoveryWorld[]>([])
  const [storageMessage, setStorageMessage] = useState<string | null>(null)
  const [storageBusy, setStorageBusy] = useState(false)

  useEffect(() => {
    if (source !== 'wasm') return
    void listRecoveryWorlds(OWN_WORLD_ID)
      .then(setRecoveries)
      .catch((error) => setStorageMessage(`could not list recovery saves: ${String(error)}`))
  }, [source])

  async function exportSavedWorld(id: string, label: string) {
    setStorageBusy(true)
    setStorageMessage(null)
    try {
      if (id === OWN_WORLD_ID && !(await requestOwnWorldCheckpoint())) {
        throw new Error('current world could not be checkpointed')
      }
      const saved = await loadWorld(id)
      if (!saved) throw new Error('save no longer exists')
      const bytes = new Uint8Array(saved.blob).buffer
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `thehumanbox-${label}-tick-${saved.tick}.world.save`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setStorageMessage(`exported tick ${saved.tick.toLocaleString()}`)
    } catch (error) {
      setStorageMessage(`export failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setStorageBusy(false)
    }
  }

  async function confirmReset() {
    const confirmed = await askConfirm({
      title: 'Start a new world?',
      body: 'Your current world is kept in recovery saves.\n\nUse “export save” first if you also want a file you can move.',
      confirmLabel: 'start new',
    })
    if (confirmed) requestOwnWorldReset()
  }

  return (
    <Section title="Play mode">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span className="lang-btn active">🎮 private browser world</span>
        {source === 'wasm' && (
          <>
            <button
              className="lang-btn"
              disabled={storageBusy}
              onClick={() => void exportSavedWorld(OWN_WORLD_ID, 'my-world')}
            >
              ↓ export save
            </button>
            <button className="lang-btn" disabled={storageBusy} onClick={confirmReset}>
              ↺ start new…
            </button>
          </>
        )}
      </div>
      <div style={{ fontSize: 12, color: 'var(--dialog-muted)', marginTop: 10, lineHeight: 1.6 }}>
        The web game runs and saves entirely in this browser. It never connects to a hosted simulation API.
        For the full native game and configurable local AI, download the desktop app.
      </div>
      {source === 'wasm' && recoveries.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, color: '#999', textTransform: 'uppercase', letterSpacing: 1 }}>
            Recovery saves
          </div>
          <div style={{ fontSize: 10, color: '#666', margin: '5px 0 7px', lineHeight: 1.45 }}>
            Reset and unreadable worlds are retained here. Restores are validated before replacing your active
            save.
          </div>
          {recoveries.slice(0, 8).map((recovery) => (
            <div
              key={recovery.id}
              style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 5, flexWrap: 'wrap' }}
            >
              <span style={{ flex: 1, minWidth: 160, fontSize: 10, color: '#bfae90' }}>
                tick {recovery.tick.toLocaleString()} · {new Date(recovery.savedAt).toLocaleString()} ·{' '}
                {(recovery.bytes / 1024 / 1024).toFixed(1)} MiB
              </span>
              <button
                className="lang-btn"
                disabled={storageBusy}
                onClick={() => void exportSavedWorld(recovery.id, 'recovery')}
              >
                export
              </button>
              <button
                className="lang-btn"
                disabled={storageBusy}
                onClick={async () => {
                  const confirmed = await askConfirm({
                    title: 'Restore this save?',
                    body: `Restore the recovery from tick ${recovery.tick.toLocaleString()}.\n\nIt is checked before it becomes active, and the recovery copy stays available.`,
                    confirmLabel: 'restore',
                  })
                  if (confirmed) requestOwnWorldRecovery(recovery.id)
                }}
              >
                restore…
              </button>
              <button
                className="lang-btn"
                disabled={storageBusy}
                onClick={async () => {
                  const confirmed = await askConfirm({
                    title: 'Delete this save?',
                    body: `The recovery from tick ${recovery.tick.toLocaleString()} is deleted for good.`,
                    confirmLabel: 'delete',
                    danger: true,
                  })
                  if (!confirmed) return
                  setStorageBusy(true)
                  try {
                    await deleteWorld(recovery.id)
                    setRecoveries((items) => items.filter((item) => item.id !== recovery.id))
                    setStorageMessage('recovery copy deleted')
                  } catch (error) {
                    setStorageMessage(
                      `could not delete recovery: ${error instanceof Error ? error.message : String(error)}`,
                    )
                  } finally {
                    setStorageBusy(false)
                  }
                }}
              >
                delete…
              </button>
            </div>
          ))}
        </div>
      )}
      {storageMessage && (
        <div style={{ marginTop: 8, fontSize: 10, color: '#bfae90', lineHeight: 1.45 }}>{storageMessage}</div>
      )}
    </Section>
  )
}

const PROVIDER_DEFAULTS: Record<ModelProvider, { url: string; model: string }> = {
  ollama: { url: 'http://localhost:11434/v1/chat/completions', model: 'llama3.2' },
  'llama-cpp': { url: 'http://localhost:8080/v1/chat/completions', model: 'default' },
  custom: { url: '', model: '' },
  none: { url: '', model: '' },
}

const POPULATION_CAP_PRESETS: ReadonlyArray<readonly [number, string]> = [
  [350, 'light'],
  [500, 'recommended'],
  [1000, 'ambitious'],
  [2000, 'experimental'],
]

type TabId = 'world' | 'display' | 'access' | 'performance' | 'help' | 'simulation' | 'ai' | 'app'

const WEB_TABS: ReadonlyArray<{ id: TabId; label: string; icon: string }> = [
  { id: 'world', label: 'world', icon: '🗺️' },
  { id: 'display', label: 'display', icon: '☀️' },
  { id: 'access', label: 'accessibility', icon: '✨' },
  { id: 'performance', label: 'performance', icon: '🐢' },
  { id: 'help', label: 'help', icon: '📖' },
]

const DESKTOP_TABS: ReadonlyArray<{ id: TabId; label: string; icon: string }> = [
  { id: 'simulation', label: 'simulation', icon: '⏱️' },
  { id: 'ai', label: 'ai model', icon: '💡' },
  { id: 'app', label: 'app', icon: '⚙️' },
]

/** Preferences that apply in both the web game and the desktop app. */
function DisplayTab() {
  const setViewFlag = useUIStore((s) => s.setViewFlag)
  const photoMode = useViewFlag('photoMode')
  const headlineTicker = useViewFlag('headlineTicker')
  const randomTour = useViewFlag('randomTour')
  return (
    <>
      <SettingRow
        title="Photo mode"
        desc="Hide every panel and the dock for clean screenshots. Press Esc or hover the top edge to get the header back."
      >
        <Switch checked={!!photoMode} onChange={(v) => setViewFlag('photoMode', v)} label="Photo mode" />
      </SettingRow>
      <SettingRow
        title="Headline ticker"
        desc="A scrolling strip of births, deaths and discoveries at the top."
      >
        <Switch
          checked={!!headlineTicker}
          onChange={(v) => setViewFlag('headlineTicker', v)}
          label="Headline ticker"
        />
      </SettingRow>
      <SettingRow
        title="Auto-follow"
        desc="Follow a different person every few seconds. Click anyone to stop."
      >
        <Switch checked={!!randomTour} onChange={(v) => setViewFlag('randomTour', v)} label="Auto-follow" />
      </SettingRow>
    </>
  )
}

function AccessibilityTab() {
  const setViewFlag = useUIStore((s) => s.setViewFlag)
  const colorBlind = useViewFlag('colorBlind')
  return (
    <SettingRow
      title="Colorblind palette"
      desc="Red-green safe colors for tribes, seasons and status markers."
    >
      <Switch
        checked={!!colorBlind}
        onChange={(v) => setViewFlag('colorBlind', v)}
        label="Colorblind palette"
      />
    </SettingRow>
  )
}

function PerformanceTab() {
  const chosen = readLowPerf()
  const automatic = LOW_PERF && !chosen
  return (
    <SettingRow
      title="Low-performance mode"
      desc={
        automatic
          ? 'On automatically for this device. Lower frame rate and resolution, fewer effects.'
          : 'Lower frame rate and resolution, fewer effects. Reloads the game (your world is saved first).'
      }
    >
      <Switch
        checked={LOW_PERF}
        onChange={() => toggleLowPerf()}
        label="Low-performance mode"
        disabled={automatic}
      />
    </SettingRow>
  )
}

function HelpTab({ onClose }: { onClose: () => void }) {
  const openAbout = useUIStore((s) => s.openAbout)
  const nerdStats = useUIStore((s) => s.nerdStats)
  const setNerdStats = useUIStore((s) => s.setNerdStats)
  const { playerWorldKind } = useSimulationData()
  const isMobile = useIsMobile()
  return (
    <>
      {!isMobile && isTourSupported() && (
        <SettingRow title="Guided tour" desc="A short walkthrough of the map, the dock and the panels.">
          <button
            className="lang-btn"
            onClick={() => {
              onClose()
              startTour(playerWorldKind)
            }}
          >
            start tour
          </button>
        </SettingRow>
      )}
      <SettingRow title="About" desc="Version, build and links.">
        <button
          className="lang-btn"
          onClick={() => {
            onClose()
            openAbout()
          }}
        >
          open
        </button>
      </SettingRow>
      <SettingRow
        title="Stats for nerds"
        desc="Tick counter, connection status and build details in the header."
      >
        <Switch checked={!!nerdStats} onChange={setNerdStats} label="Stats for nerds" />
      </SettingRow>
    </>
  )
}

export function DesktopSettingsModal({ onClose }: Props) {
  const desktop = getDesktop()
  const [tab, setTab] = useState<TabId>('world')
  const [settings, setSettings] = useState<DesktopSettings | null>(null)
  const [status, setStatus] = useState<SimStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [safetyMessage, setSafetyMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!desktop) return
    void desktop.settings.get().then(setSettings)
    void desktop.sim.status().then(setStatus)
  }, [desktop])

  const update = (patch: Partial<DesktopSettings>) => setSettings((s) => (s ? { ...s, ...patch } : s))
  const updateModel = (patch: Partial<DesktopSettings['model']>) =>
    setSettings((s) => (s ? { ...s, model: { ...s.model, ...patch } } : s))

  async function save() {
    if (!settings || !desktop) return
    setBusy(true)
    try {
      const saved = await desktop.settings.set(settings)
      setSettings(saved)
      window.dispatchEvent(
        new CustomEvent(DESKTOP_PAUSE_WHEN_HIDDEN_EVENT, { detail: saved.pauseWhenHidden }),
      )
      await desktop.app.applyAutoLaunch()
      setSavedAt(Date.now())
    } finally {
      setBusy(false)
    }
  }

  async function restart() {
    if (!settings || !desktop) return
    setBusy(true)
    setStatus(null)
    try {
      const saved = await desktop.settings.set(settings)
      window.dispatchEvent(
        new CustomEvent(DESKTOP_PAUSE_WHEN_HIDDEN_EVENT, { detail: saved.pauseWhenHidden }),
      )
      const next = await desktop.sim.restart()
      setStatus(next)
      setSavedAt(Date.now())
    } finally {
      setBusy(false)
    }
  }

  async function migrateSaveFolder(targetDir: string | null) {
    if (!desktop || !settings) return
    const label = targetDir ?? 'the default app data folder'
    const confirmed = await askConfirm({
      title: 'Move the save folder?',
      body: `Move active storage to ${label}.\n\nThe simulation saves and restarts. The current folder is kept as a backup, and the destination must not already contain a worlds folder.`,
      confirmLabel: 'move',
    })
    if (!confirmed) return
    setBusy(true)
    setSafetyMessage('checkpointing and copying worlds…')
    try {
      const result = await desktop.world.migrateDataRoot({ targetDir })
      setSettings(result.settings)
      setSafetyMessage(
        result.migrated
          ? `worlds migrated safely; previous folder kept at ${result.previousFolderKept ?? 'the old location'}`
          : 'this is already the active save folder',
      )
    } catch (error) {
      setSafetyMessage(`migration failed safely: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  async function exportDesktopWorld() {
    if (!desktop) return
    setSafetyMessage('checkpointing world for export…')
    try {
      const result = await desktop.world.exportActive()
      setSafetyMessage(result.exported ? `world exported to ${result.filePath}` : 'export cancelled')
    } catch (error) {
      setSafetyMessage(`export failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function resetDesktopWorld() {
    if (!desktop) return
    setSafetyMessage(null)
    setBusy(true)
    try {
      const result = await desktop.world.resetLocal()
      setSafetyMessage(result.reset ? 'new world started; previous world archived' : 'reset cancelled')
    } catch (error) {
      setSafetyMessage(`reset failed safely: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const tabs = desktop ? [...WEB_TABS.slice(0, 1), ...DESKTOP_TABS, ...WEB_TABS.slice(1)] : WEB_TABS
  const desktopTab = tab === 'simulation' || tab === 'ai' || tab === 'app'
  const justSaved = savedAt && Date.now() - savedAt < 2500

  return (
    <Modal open onClose={onClose} className="settings-modal" title="Settings" hideTitle>
      <div className="lang-modal-header">
        <span className="lang-modal-title">SETTINGS</span>
        {desktop && (
          <span className="tree-modal-sub">
            v{desktop.appVersion} · {desktop.platform}
          </span>
        )}
        <button aria-label="Close" className="close-btn" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="settings-layout">
        <nav className="settings-tabs" aria-label="Settings sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={clsx('settings-tab', tab === t.id && 'active')}
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              <ToolSprite icon={t.icon} size={16} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="settings-pane">
          {tab === 'world' &&
            (desktop ? (
              <Section title="Your world">
                <SettingRow title="Export world" desc="Save a portable copy of the current world.">
                  <button className="lang-btn" onClick={() => void exportDesktopWorld()} disabled={busy}>
                    export…
                  </button>
                </SettingRow>
                <SettingRow title="Start a new world" desc="The current world is archived first.">
                  <button
                    className="lang-btn danger"
                    onClick={() => void resetDesktopWorld()}
                    disabled={busy}
                  >
                    start new…
                  </button>
                </SettingRow>
                {safetyMessage && <div className="settings-note">{safetyMessage}</div>}
              </Section>
            ) : (
              <WorldSourceSection />
            ))}
          {tab === 'display' && (
            <Section title="Display">
              <DisplayTab />
            </Section>
          )}
          {tab === 'access' && (
            <Section title="Accessibility">
              <AccessibilityTab />
            </Section>
          )}
          {tab === 'performance' && (
            <Section title="Performance">
              <PerformanceTab />
            </Section>
          )}
          {tab === 'help' && (
            <Section title="Help">
              <HelpTab onClose={onClose} />
            </Section>
          )}

          {desktopTab && desktop && !settings && <div className="settings-note">loading…</div>}
          {desktopTab && desktop && settings && (
            <>
              {tab === 'simulation' && (
                <Section title="Local simulation">
                  <SettingRow
                    title="Simulation process"
                    desc={
                      status
                        ? status.running
                          ? `Running natively on this computer (port ${status.port}).`
                          : 'Not running.'
                        : 'Your world runs natively on this computer.'
                    }
                  >
                    <button className="lang-btn" onClick={restart} disabled={busy}>
                      {busy ? 'restarting…' : 'apply + restart'}
                    </button>
                  </SettingRow>
                  {status?.error && <div className="settings-note error">{status.error}</div>}
                  <Field label={`Tick interval: ${settings.tickMs} ms`}>
                    <input
                      type="range"
                      min={30}
                      max={2000}
                      step={10}
                      value={settings.tickMs}
                      onChange={(e) => update({ tickMs: parseInt(e.target.value, 10) })}
                      style={{ width: '100%' }}
                    />
                    <div className="settings-note">Lower is a faster world and more CPU. Default 100 ms.</div>
                  </Field>
                  <Field label={`World capacity: ${settings.populationCap.toLocaleString()} people`}>
                    <input
                      type="range"
                      min={120}
                      max={5000}
                      step={20}
                      value={settings.populationCap}
                      onChange={(e) => update({ populationCap: parseInt(e.target.value, 10) })}
                      style={{ width: '100%' }}
                    />
                    <div className="desktop-cap-presets" role="group" aria-label="World capacity presets">
                      {POPULATION_CAP_PRESETS.map(([cap, label]) => (
                        <button
                          key={cap}
                          type="button"
                          className={settings.populationCap === cap ? 'active' : ''}
                          onClick={() => update({ populationCap: cap })}
                        >
                          {cap.toLocaleString()} · {label}
                        </button>
                      ))}
                    </div>
                    <div className="settings-note">
                      Natural births stop at this size; you can still add people yourself. 500 suits the
                      default speed, 1,000+ needs a fast machine. Applies after restart.
                    </div>
                  </Field>
                </Section>
              )}
              {tab === 'ai' && (
                <Section title="AI model (optional)">
                  <Field label="Provider">
                    <select
                      value={settings.model.provider}
                      onChange={(e) => {
                        const provider = e.target.value as ModelProvider
                        const defaults = PROVIDER_DEFAULTS[provider]
                        updateModel({ provider, apiUrl: defaults.url, modelName: defaults.model })
                      }}
                      style={inputStyle}
                    >
                      <option value="none">none (the world still runs, just no narration)</option>
                      <option value="ollama">Ollama (local)</option>
                      <option value="llama-cpp">llama.cpp (local)</option>
                      <option value="custom">Custom OpenAI-compatible endpoint</option>
                    </select>
                  </Field>
                  {settings.model.provider !== 'none' && (
                    <>
                      <Field label="API URL">
                        <input
                          type="text"
                          value={settings.model.apiUrl}
                          onChange={(e) => updateModel({ apiUrl: e.target.value })}
                          style={inputStyle}
                        />
                      </Field>
                      <Field label="API key">
                        <input
                          type="password"
                          value={settings.model.apiKey}
                          onChange={(e) => updateModel({ apiKey: e.target.value })}
                          placeholder={
                            settings.model.provider === 'ollama' || settings.model.provider === 'llama-cpp'
                              ? '(not needed for local)'
                              : 'sk-...'
                          }
                          style={inputStyle}
                        />
                      </Field>
                      <Field label="Model name">
                        <input
                          type="text"
                          value={settings.model.modelName}
                          onChange={(e) => updateModel({ modelName: e.target.value })}
                          style={inputStyle}
                        />
                      </Field>
                    </>
                  )}
                  <div className="settings-note">
                    The simulation runs without AI. To add narration, point it at a model server on your
                    computer.
                  </div>
                </Section>
              )}
              {tab === 'app' && (
                <>
                  <Section title="Updates">
                    <SettingRow
                      title="Automatic updates"
                      desc="Check for new versions and offer to install them."
                    >
                      <Switch
                        checked={settings.autoUpdate}
                        onChange={(v) => update({ autoUpdate: v })}
                        label="Automatic updates"
                      />
                    </SettingRow>
                    <UpdateCheckButton desktop={desktop} />
                  </Section>
                  <Section title="Startup and background">
                    <SettingRow title="Launch at sign-in" desc="Open The Human Box when you log in.">
                      <Switch
                        checked={settings.autoLaunch}
                        onChange={(v) => update({ autoLaunch: v })}
                        label="Launch at sign-in"
                      />
                    </SettingRow>
                    <SettingRow title="Start hidden" desc="Start in the tray without opening a window.">
                      <Switch
                        checked={settings.startMinimized}
                        onChange={(v) => update({ startMinimized: v })}
                        label="Start hidden"
                      />
                    </SettingRow>
                    <SettingRow
                      title="Pause when hidden"
                      desc="Stop drawing while the window is minimized. Saves CPU."
                    >
                      <Switch
                        checked={settings.pauseWhenHidden}
                        onChange={(v) => update({ pauseWhenHidden: v })}
                        label="Pause when hidden"
                      />
                    </SettingRow>
                  </Section>
                  <Section title="Save folder">
                    <code className="settings-path">
                      {settings.saveLocationOverride ?? 'default (app data folder)'}
                    </code>
                    <div className="settings-actions">
                      <button
                        className="lang-btn"
                        onClick={async () => {
                          const dir = await desktop?.app.pickSaveDir()
                          if (dir) await migrateSaveFolder(dir)
                        }}
                        disabled={busy}
                      >
                        move…
                      </button>
                      {settings.saveLocationOverride && (
                        <button
                          className="lang-btn"
                          onClick={() => void migrateSaveFolder(null)}
                          disabled={busy}
                        >
                          move back to default
                        </button>
                      )}
                    </div>
                    <div className="settings-note">
                      Moving checkpoints and copies the whole worlds folder first. The old folder stays as a
                      backup.
                    </div>
                    {safetyMessage && <div className="settings-note">{safetyMessage}</div>}
                  </Section>
                  <Section title="Tools">
                    <div className="settings-actions">
                      <button className="lang-btn" onClick={() => void desktop?.app.screenshot()}>
                        take screenshot
                      </button>
                      <button className="lang-btn" onClick={() => void desktop?.app.openWorlds()}>
                        open worlds folder
                      </button>
                      <button className="lang-btn" onClick={() => void desktop?.app.openLogs()}>
                        open logs folder
                      </button>
                    </div>
                  </Section>
                </>
              )}
              <div className="settings-footer">
                <button className="lang-btn active" onClick={save} disabled={busy}>
                  {busy ? 'saving…' : 'save settings'}
                </button>
                {justSaved && <span className="settings-saved">saved</span>}
                <span className="settings-note">Tick and model changes apply after a restart.</span>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

function updateCheckMessage(result: UpdateCheckResult | null): string {
  if (!result) return ''
  if (result.status === 'checking') return 'checking...'
  if (result.status === 'available')
    return result.version ? `v${result.version} available` : 'update available'
  if (result.status === 'downloaded') return result.version ? `v${result.version} ready` : 'update ready'
  if (result.status === 'up-to-date') return 'up to date'
  if (result.status === 'unsupported') return result.message ?? 'only available in packaged builds'
  return result.message ?? 'update check failed'
}

function UpdateCheckButton({ desktop }: { desktop: DesktopBridge }) {
  const [result, setResult] = useState<UpdateCheckResult | null>(null)
  const [checking, setChecking] = useState(false)

  async function check() {
    setChecking(true)
    setResult({ status: 'checking' })
    try {
      setResult(await desktop.app.checkForUpdates())
    } finally {
      setChecking(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
      <button className="lang-btn" onClick={check} disabled={checking}>
        {checking ? 'checking...' : 'check for updates'}
      </button>
      {result && (
        <span
          style={{
            color: result.status === 'error' ? '#e85040' : '#888',
            fontSize: 11,
          }}
        >
          {updateCheckMessage(result)}
        </span>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="settings-section">
      <h3 className="settings-section-title">{title}</h3>
      {children}
    </section>
  )
}

function SettingRow({
  title,
  desc,
  beta,
  children,
}: {
  title: string
  desc: string
  beta?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <div className="settings-row-title">
          {title}
          {beta && <span className="settings-beta">beta</span>}
        </div>
        <div className="settings-row-desc">{desc}</div>
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  )
}

function Switch({
  checked,
  onChange,
  label,
  disabled,
  onHover,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
  onHover?: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={clsx('px-switch', checked && 'on')}
      onClick={() => onChange(!checked)}
      onMouseEnter={onHover}
      onFocus={onHover}
    >
      <span className="px-switch-knob" />
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="settings-field">
      <div className="settings-field-label">{label}</div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#1c1612',
  border: '1px solid #3a3028',
  color: '#d0c8c0',
  padding: '6px 8px',
  borderRadius: 3,
  fontSize: 12,
  fontFamily: 'inherit',
}
