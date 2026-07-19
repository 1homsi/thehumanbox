import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { getDesktop } from '../lib/desktop'
import type {
  DesktopBridge,
  DesktopSettings,
  ModelProvider,
  SimMode,
  SimStatus,
  UpdateCheckResult,
} from '../lib/desktop'
import {
  getWorldSource,
  OWN_WORLD_ID,
  requestOwnWorldCheckpoint,
  requestOwnWorldRecovery,
  requestOwnWorldReset,
  setWorldSourceAndReload,
} from '../simulation/worldSource'
import { deleteWorld, listRecoveryWorlds, loadWorld, type RecoveryWorld } from '../simulation/wasmDb'
import { DESKTOP_PAUSE_WHEN_HIDDEN_EVENT } from '../lib/desktopVisibility'

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

  function confirmReset() {
    const confirmed = window.confirm(
      'Start a new private world?\n\nThe current save will be kept in Recovery saves. Use “export save” first if you also want a portable file.',
    )
    if (confirmed) requestOwnWorldReset()
  }

  return (
    <Section title="Play mode">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          className={'lang-btn' + (source === 'wasm' ? ' active' : '')}
          aria-pressed={source === 'wasm'}
          onClick={() => source !== 'wasm' && setWorldSourceAndReload('wasm')}
        >
          🎮 my world · local
        </button>
        <button
          className={'lang-btn' + (source === 'remote' ? ' active' : '')}
          aria-pressed={source === 'remote'}
          onClick={() => source !== 'remote' && setWorldSourceAndReload('remote')}
        >
          📡 shared world · online
        </button>
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
      <div style={{ fontSize: 10, color: '#666', marginTop: 8, lineHeight: 1.5 }}>
        <strong style={{ color: '#bfae90' }}>My World</strong> is the default: a private game that runs and
        saves entirely in this browser, without connecting to The Human Box server. Switch to the{' '}
        <strong style={{ color: '#bfae90' }}>Shared World</strong> to watch the persistent online simulation.
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
                onClick={() => {
                  if (
                    window.confirm(
                      `Restore the recovery from tick ${recovery.tick.toLocaleString()}?\n\nIt will be validated before becoming active, and the recovery copy remains available.`,
                    )
                  ) {
                    requestOwnWorldRecovery(recovery.id)
                  }
                }}
              >
                restore…
              </button>
              <button
                className="lang-btn"
                disabled={storageBusy}
                onClick={async () => {
                  if (!window.confirm(`Permanently delete the recovery from tick ${recovery.tick}?`)) return
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
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.1-8b-instant' },
  openai: { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
  anthropic: { url: 'https://api.anthropic.com/v1/messages', model: 'claude-haiku-4-5' },
  ollama: { url: 'http://localhost:11434/v1/chat/completions', model: 'llama3.2' },
  'llama-cpp': { url: 'http://localhost:8080/v1/chat/completions', model: 'default' },
  none: { url: '', model: '' },
}

const POPULATION_CAP_PRESETS: ReadonlyArray<readonly [number, string]> = [
  [350, 'light'],
  [500, 'recommended'],
  [1000, 'ambitious'],
  [2000, 'experimental'],
]

export function DesktopSettingsModal({ onClose }: Props) {
  const desktop = getDesktop()
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

  if (!desktop) {
    return (
      <Modal open onClose={onClose} className="settings-modal" title="Settings" hideTitle>
        <div className="lang-modal-header">
          <span className="lang-modal-title">SETTINGS</span>
          <button aria-label="Close" className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div style={{ padding: 16, overflowY: 'auto', maxHeight: '70vh' }}>
          <WorldSourceSection />
        </div>
      </Modal>
    )
  }

  if (!settings) {
    return (
      <Modal open onClose={onClose} className="settings-modal" title="Desktop Settings" hideTitle>
        <div style={{ padding: 24, color: '#999', fontSize: 12 }}>loading…</div>
      </Modal>
    )
  }

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
    if (
      !window.confirm(
        `Move active storage to ${label}?\n\nThe simulation will checkpoint and restart. The current folder is kept as a backup. The destination must not already contain a worlds folder.`,
      )
    ) {
      return
    }
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

  const justSaved = savedAt && Date.now() - savedAt < 2500

  return (
    <Modal open onClose={onClose} className="settings-modal" title="Desktop Settings" hideTitle>
      <div className="lang-modal-header">
        <span className="lang-modal-title">DESKTOP SETTINGS</span>
        <span className="tree-modal-sub">
          v{desktop.appVersion} · {desktop.platform}
        </span>
        <button aria-label="Close" className="close-btn" onClick={onClose}>
          ✕
        </button>
      </div>

      <div style={{ padding: 16, overflowY: 'auto', maxHeight: '70vh' }}>
        <Section title="Mode">
          <Radio
            name="mode"
            value="local"
            current={settings.mode}
            onChange={(v) => update({ mode: v as SimMode })}
            label="Local — run a private simulation on this machine"
          />
          <Radio
            name="mode"
            value="remote"
            current={settings.mode}
            onChange={(v) => update({ mode: v as SimMode })}
            label="Remote — connect to the live shared world"
          />
          {settings.mode === 'remote' && (
            <Field label="Remote URL">
              <input
                type="text"
                value={settings.remoteUrl}
                onChange={(e) => update({ remoteUrl: e.target.value })}
                style={inputStyle}
              />
            </Field>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <button onClick={restart} disabled={busy} style={btnPrimary}>
              {busy ? 'restarting…' : 'apply mode + restart'}
            </button>
            {status && (
              <span style={{ fontSize: 11, color: '#888' }}>
                {status.mode === 'remote'
                  ? `remote: ${status.remoteUrl ?? settings.remoteUrl}`
                  : status.running
                    ? `local sim @ :${status.port}`
                    : 'no local sim running'}
                {status.error && <span style={{ color: '#e85040', marginLeft: 6 }}>{status.error}</span>}
              </span>
            )}
          </div>
        </Section>

        <Section title="Simulation">
          <Field label={`Tick interval — ${settings.tickMs} ms`}>
            <input
              type="range"
              min={30}
              max={2000}
              step={10}
              value={settings.tickMs}
              onChange={(e) => update({ tickMs: parseInt(e.target.value, 10) })}
              style={{ width: '100%' }}
            />
            <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
              Lower = faster world (more CPU). Default 100 ms.
            </div>
          </Field>
          <Field label={`World capacity — ${settings.populationCap.toLocaleString()} people`}>
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
            <div style={{ fontSize: 10, color: '#777', marginTop: 6, lineHeight: 1.5 }}>
              Every size can reach the full era ladder. Larger worlds spread the late-era population gates
              across a bigger civilization. 500 is tuned for the default speed; 1,000+ needs a fast machine
              and 5,000 is unproven. Applies after restart.
            </div>
          </Field>
        </Section>

        <Section title="AI model (local mode only)">
          <Field label="Provider">
            <select
              value={settings.model.provider}
              onChange={(e) => {
                const provider = e.target.value as ModelProvider
                const defaults = PROVIDER_DEFAULTS[provider]
                updateModel({
                  provider,
                  apiUrl: defaults.url,
                  modelName: defaults.model,
                })
              }}
              style={inputStyle}
            >
              <option value="none">none (sim still runs, just no LLM narration)</option>
              <option value="groq">Groq</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="ollama">Ollama (local)</option>
              <option value="llama-cpp">llama.cpp (local)</option>
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
        </Section>

        <Section title="Updates">
          <Toggle
            checked={settings.autoUpdate}
            onChange={(v) => update({ autoUpdate: v })}
            label="Auto-check for updates and prompt when ready"
          />
          <UpdateCheckButton desktop={desktop} />
        </Section>

        <Section title="Desktop behaviour">
          <Toggle
            checked={settings.autoLaunch}
            onChange={(v) => update({ autoLaunch: v })}
            label="Launch automatically when I sign in"
          />
          <Toggle
            checked={settings.startMinimized}
            onChange={(v) => update({ startMinimized: v })}
            label="Start hidden in the tray (no window on launch)"
          />
          <Toggle
            checked={settings.pauseWhenHidden}
            onChange={(v) => update({ pauseWhenHidden: v })}
            label="Pause renderer when window is minimized or hidden (saves CPU)"
          />
        </Section>

        <Section title="Save location">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <code
              style={{
                flex: 1,
                minWidth: 180,
                fontSize: 10,
                color: '#bfae90',
                background: '#1a1612',
                border: '1px solid #3a2e25',
                borderRadius: 4,
                padding: '6px 8px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {settings.saveLocationOverride ?? 'default (app data folder)'}
            </code>
            <button
              onClick={async () => {
                const dir = await desktop?.app.pickSaveDir()
                if (dir) await migrateSaveFolder(dir)
              }}
              disabled={busy}
              style={btnSecondary}
            >
              migrate…
            </button>
            {settings.saveLocationOverride && (
              <button onClick={() => void migrateSaveFolder(null)} disabled={busy} style={btnSecondary}>
                migrate to default
              </button>
            )}
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 6 }}>
            Migration checkpoints and copies the complete worlds folder before switching. The previous folder
            stays untouched as a rollback backup.
          </div>
          {safetyMessage && (
            <div style={{ fontSize: 10, color: '#bfae90', marginTop: 6, lineHeight: 1.45 }}>
              {safetyMessage}
            </div>
          )}
        </Section>

        <Section title="Tools">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => void desktop?.app.screenshot()} style={btnSecondary}>
              take screenshot
            </button>
            <button onClick={() => void desktop?.app.openWorlds()} style={btnSecondary}>
              open worlds folder
            </button>
            <button onClick={() => void desktop?.app.openLogs()} style={btnSecondary}>
              open logs folder
            </button>
            <button
              onClick={async () => {
                setSafetyMessage('checkpointing world for export…')
                try {
                  const result = await desktop.world.exportActive()
                  setSafetyMessage(
                    result.exported ? `world exported to ${result.filePath}` : 'export cancelled',
                  )
                } catch (error) {
                  setSafetyMessage(`export failed: ${error instanceof Error ? error.message : String(error)}`)
                }
              }}
              disabled={busy || settings.mode !== 'local'}
              style={btnSecondary}
            >
              export world save…
            </button>
            <button
              onClick={async () => {
                setSafetyMessage(null)
                setBusy(true)
                try {
                  const result = await desktop.world.resetLocal()
                  setSafetyMessage(
                    result.reset ? 'new world started; previous world archived' : 'reset cancelled',
                  )
                } catch (error) {
                  setSafetyMessage(
                    `reset failed safely: ${error instanceof Error ? error.message : String(error)}`,
                  )
                } finally {
                  setBusy(false)
                }
              }}
              disabled={busy || settings.mode !== 'local'}
              style={{ ...btnSecondary, color: '#ff9b6b', borderColor: '#7a3f32' }}
            >
              start a new world…
            </button>
          </div>
        </Section>

        <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
          <button onClick={save} disabled={busy} style={btnPrimary}>
            {busy ? 'saving…' : 'save settings'}
          </button>
          {justSaved && <span style={{ fontSize: 11, color: '#7ed957' }}>saved</span>}
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: '#666' }}>
            Restart for mode/tick/model changes to take full effect.
          </span>
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
      <button onClick={check} disabled={checking} style={btnSecondary}>
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
    <div style={{ marginBottom: 18 }}>
      <div
        style={{ fontSize: 10, color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: '#777', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

function Radio({
  name,
  value,
  current,
  onChange,
  label,
}: {
  name: string
  value: string
  current: string
  onChange: (v: string) => void
  label: string
}) {
  return (
    <label
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        padding: '4px 0',
        cursor: 'pointer',
        fontSize: 12,
      }}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={current === value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span>{label}</span>
    </label>
  )
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label className="desktop-toggle-row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
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

const btnPrimary: React.CSSProperties = {
  background: '#3a2d22',
  border: '1px solid #5e5648',
  color: '#f0d088',
  padding: '6px 14px',
  borderRadius: 4,
  fontSize: 11,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
}

const btnSecondary: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #443329',
  color: '#bfae90',
  padding: '5px 12px',
  borderRadius: 4,
  fontSize: 10,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  cursor: 'pointer',
}
