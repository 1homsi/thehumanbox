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
import { readRunInBackground, setRunInBackground } from '../../shared/run-in-background'
import { getDesktop } from '../../shared/desktop'
import type { DesktopBridge, DesktopSettings, SimStatus, UpdateCheckResult } from '../../shared/desktop'
import {
  getWorldSource,
  OWN_WORLD_ID,
  requestOwnWorldCheckpoint,
  requestOwnWorldRecovery,
  requestOwnWorldReset,
} from '../../simulation/worldSource'
import { deleteWorld, listRecoveryWorlds, loadWorld, type RecoveryWorld } from '../../simulation/wasmDb'
import { DESKTOP_PAUSE_WHEN_HIDDEN_EVENT } from '../../shared/desktopVisibility'
import { formatDateTime, formatNumber, t } from '../../i18n'
import { LanguageTab } from './LanguageTab'
import { updateCheckMessage } from './updateCheckMessage'

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
      .catch((error) => setStorageMessage(t('settings.web.listFailed', { error: String(error) })))
  }, [source])

  async function exportSavedWorld(id: string, label: string) {
    setStorageBusy(true)
    setStorageMessage(null)
    try {
      if (id === OWN_WORLD_ID && !(await requestOwnWorldCheckpoint())) {
        throw new Error(t('settings.web.checkpointFailed'))
      }
      const saved = await loadWorld(id)
      if (!saved) throw new Error(t('settings.web.saveGone'))
      const bytes = new Uint8Array(saved.blob).buffer
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `thehumanbox-${label}-tick-${saved.tick}.world.save`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setStorageMessage(t('settings.web.exported', { tick: formatNumber(saved.tick) }))
    } catch (error) {
      setStorageMessage(
        t('settings.web.exportFailed', { error: error instanceof Error ? error.message : String(error) }),
      )
    } finally {
      setStorageBusy(false)
    }
  }

  async function confirmReset() {
    const confirmed = await askConfirm({
      title: t('settings.web.resetTitle'),
      body: t('settings.web.resetBody'),
      confirmLabel: t('settings.web.resetConfirm'),
    })
    if (confirmed) requestOwnWorldReset()
  }

  return (
    <Section title={t('settings.web.playMode')}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span className="lang-btn active">🎮 {t('settings.web.privateWorld')}</span>
        {source === 'wasm' && (
          <>
            <button
              className="lang-btn"
              disabled={storageBusy}
              onClick={() => void exportSavedWorld(OWN_WORLD_ID, 'my-world')}
            >
              ↓ {t('settings.web.exportSave')}
            </button>
            <button className="lang-btn" disabled={storageBusy} onClick={confirmReset}>
              ↺ {t('settings.web.startNew')}
            </button>
          </>
        )}
      </div>
      <div style={{ fontSize: 12, color: 'var(--dialog-muted)', marginTop: 10, lineHeight: 1.6 }}>
        {t('settings.web.note')}
      </div>
      {source === 'wasm' && recoveries.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, color: '#999', textTransform: 'uppercase', letterSpacing: 1 }}>
            {t('settings.web.recoverySaves')}
          </div>
          <div style={{ fontSize: 10, color: '#666', margin: '5px 0 7px', lineHeight: 1.45 }}>
            {t('settings.web.recoveryNote')}
          </div>
          {recoveries.slice(0, 8).map((recovery) => (
            <div
              key={recovery.id}
              style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 5, flexWrap: 'wrap' }}
            >
              <span style={{ flex: 1, minWidth: 160, fontSize: 10, color: '#bfae90' }}>
                {t('settings.web.recoveryLine', {
                  tick: formatNumber(recovery.tick),
                  date: formatDateTime(recovery.savedAt),
                  size: formatNumber(recovery.bytes / 1024 / 1024, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  }),
                })}
              </span>
              <button
                className="lang-btn"
                disabled={storageBusy}
                onClick={() => void exportSavedWorld(recovery.id, 'recovery')}
              >
                {t('common.export')}
              </button>
              <button
                className="lang-btn"
                disabled={storageBusy}
                onClick={async () => {
                  const confirmed = await askConfirm({
                    title: t('settings.web.restoreTitle'),
                    body: t('settings.web.restoreBody', { tick: formatNumber(recovery.tick) }),
                    confirmLabel: t('settings.web.restoreConfirm'),
                  })
                  if (confirmed) requestOwnWorldRecovery(recovery.id)
                }}
              >
                {t('common.restore')}
              </button>
              <button
                className="lang-btn"
                disabled={storageBusy}
                onClick={async () => {
                  const confirmed = await askConfirm({
                    title: t('settings.web.deleteTitle'),
                    body: t('settings.web.deleteBody', { tick: formatNumber(recovery.tick) }),
                    confirmLabel: t('settings.web.deleteConfirm'),
                    danger: true,
                  })
                  if (!confirmed) return
                  setStorageBusy(true)
                  try {
                    await deleteWorld(recovery.id)
                    setRecoveries((items) => items.filter((item) => item.id !== recovery.id))
                    setStorageMessage(t('settings.web.recoveryDeleted'))
                  } catch (error) {
                    setStorageMessage(
                      t('settings.web.deleteFailed', {
                        error: error instanceof Error ? error.message : String(error),
                      }),
                    )
                  } finally {
                    setStorageBusy(false)
                  }
                }}
              >
                {t('common.delete')}
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

const POPULATION_CAP_PRESETS = [
  [350, 'settings.desktop.presetLight'],
  [500, 'settings.desktop.presetRecommended'],
  [1000, 'settings.desktop.presetAmbitious'],
  [2000, 'settings.desktop.presetExperimental'],
] as const

type TabId = 'world' | 'language' | 'display' | 'access' | 'performance' | 'help' | 'simulation' | 'app'

type TabLabel =
  `settings.tabs.${'world' | 'language' | 'display' | 'accessibility' | 'performance' | 'help' | 'simulation' | 'app'}`

const WEB_TABS: ReadonlyArray<{ id: TabId; label: TabLabel; icon: string }> = [
  { id: 'world', label: 'settings.tabs.world', icon: '🗺️' },
  { id: 'language', label: 'settings.tabs.language', icon: '📜' },
  { id: 'display', label: 'settings.tabs.display', icon: '☀️' },
  { id: 'access', label: 'settings.tabs.accessibility', icon: '✨' },
  { id: 'performance', label: 'settings.tabs.performance', icon: '🐢' },
  { id: 'help', label: 'settings.tabs.help', icon: '📖' },
]

const DESKTOP_TABS: ReadonlyArray<{ id: TabId; label: TabLabel; icon: string }> = [
  { id: 'simulation', label: 'settings.tabs.simulation', icon: '⏱️' },
  { id: 'app', label: 'settings.tabs.app', icon: '⚙️' },
]

/** Preferences that apply in both the web game and the desktop app. */
function DisplayTab() {
  const setViewFlag = useUIStore((s) => s.setViewFlag)
  const photoMode = useViewFlag('photoMode')
  const headlineTicker = useViewFlag('headlineTicker')
  const randomTour = useViewFlag('randomTour')
  return (
    <>
      <SettingRow title={t('settings.display.photoMode')} desc={t('settings.display.photoModeDesc')}>
        <Switch
          checked={!!photoMode}
          onChange={(v) => setViewFlag('photoMode', v)}
          label={t('settings.display.photoMode')}
        />
      </SettingRow>
      <SettingRow
        title={t('settings.display.headlineTicker')}
        desc={t('settings.display.headlineTickerDesc')}
      >
        <Switch
          checked={!!headlineTicker}
          onChange={(v) => setViewFlag('headlineTicker', v)}
          label={t('settings.display.headlineTicker')}
        />
      </SettingRow>
      <SettingRow title={t('settings.display.autoFollow')} desc={t('settings.display.autoFollowDesc')}>
        <Switch
          checked={!!randomTour}
          onChange={(v) => setViewFlag('randomTour', v)}
          label={t('settings.display.autoFollow')}
        />
      </SettingRow>
    </>
  )
}

function AccessibilityTab() {
  const setViewFlag = useUIStore((s) => s.setViewFlag)
  const colorBlind = useViewFlag('colorBlind')
  return (
    <SettingRow
      title={t('settings.accessibility.colorBlind')}
      desc={t('settings.accessibility.colorBlindDesc')}
    >
      <Switch
        checked={!!colorBlind}
        onChange={(v) => setViewFlag('colorBlind', v)}
        label={t('settings.accessibility.colorBlind')}
      />
    </SettingRow>
  )
}

function PerformanceTab() {
  const chosen = readLowPerf()
  const automatic = LOW_PERF && !chosen
  return (
    <>
      <SettingRow
        title={t('settings.performance.lowPerf')}
        desc={automatic ? t('settings.performance.lowPerfAuto') : t('settings.performance.lowPerfDesc')}
      >
        <Switch
          checked={LOW_PERF}
          onChange={() => toggleLowPerf()}
          label={t('settings.performance.lowPerf')}
          disabled={automatic}
        />
      </SettingRow>
      {getWorldSource() === 'wasm' && <RunInBackgroundRow />}
    </>
  )
}

function RunInBackgroundRow() {
  const [enabled, setEnabled] = useState(readRunInBackground)
  return (
    <SettingRow title={t('settings.performance.background')} desc={t('settings.performance.backgroundDesc')}>
      <Switch
        checked={enabled}
        onChange={(v) => {
          setRunInBackground(v)
          setEnabled(v)
        }}
        label={t('settings.performance.background')}
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
        <SettingRow title={t('settings.help.tour')} desc={t('settings.help.tourDesc')}>
          <button
            className="lang-btn"
            onClick={() => {
              onClose()
              startTour(playerWorldKind)
            }}
          >
            {t('settings.help.startTour')}
          </button>
        </SettingRow>
      )}
      <SettingRow title={t('settings.help.about')} desc={t('settings.help.aboutDesc')}>
        <button
          className="lang-btn"
          onClick={() => {
            onClose()
            openAbout()
          }}
        >
          {t('common.open')}
        </button>
      </SettingRow>
      <SettingRow title={t('settings.help.nerdStats')} desc={t('settings.help.nerdStatsDesc')}>
        <Switch checked={!!nerdStats} onChange={setNerdStats} label={t('settings.help.nerdStats')} />
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
  const [actionError, setActionError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    if (!desktop) return
    let cancelled = false
    setLoadError(null)
    desktop.settings
      .get()
      .then((loaded) => {
        if (!cancelled) setSettings(loaded)
      })
      .catch((error) => {
        if (!cancelled) setLoadError(t('settings.desktop.loadFailed', { error: errorText(error) }))
      })
    // The status line is informational; failing to read it must not block the tab.
    desktop.sim
      .status()
      .then((next) => {
        if (!cancelled) setStatus(next)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [desktop, loadAttempt])

  const update = (patch: Partial<DesktopSettings>) => setSettings((s) => (s ? { ...s, ...patch } : s))

  async function save() {
    if (!settings || !desktop) return
    setBusy(true)
    setActionError(null)
    try {
      const saved = await desktop.settings.set(settings)
      setSettings(saved)
      window.dispatchEvent(
        new CustomEvent(DESKTOP_PAUSE_WHEN_HIDDEN_EVENT, { detail: saved.pauseWhenHidden }),
      )
      setSavedAt(Date.now())
      // Persisted already; only the OS login-item update can still fail.
      try {
        await desktop.app.applyAutoLaunch()
      } catch (error) {
        setActionError(t('settings.desktop.launchFailed', { error: errorText(error) }))
      }
    } catch (error) {
      setSavedAt(null)
      setActionError(t('settings.desktop.saveFailed', { error: errorText(error) }))
    } finally {
      setBusy(false)
    }
  }

  async function restart() {
    if (!settings || !desktop) return
    setBusy(true)
    setStatus(null)
    setActionError(null)
    try {
      let saved: DesktopSettings
      try {
        saved = await desktop.settings.set(settings)
      } catch (error) {
        setActionError(t('settings.desktop.saveFailed', { error: errorText(error) }))
        return
      }
      window.dispatchEvent(
        new CustomEvent(DESKTOP_PAUSE_WHEN_HIDDEN_EVENT, { detail: saved.pauseWhenHidden }),
      )
      const next = await desktop.sim.restart()
      setStatus(next)
      setSavedAt(Date.now())
    } catch (error) {
      setSavedAt(null)
      setActionError(t('settings.desktop.restartFailed', { error: errorText(error) }))
      // The restart may have left the sim stopped or still running; show the truth.
      desktop.sim
        .status()
        .then(setStatus)
        .catch(() => {})
    } finally {
      setBusy(false)
    }
  }

  async function migrateSaveFolder(targetDir: string | null) {
    if (!desktop || !settings) return
    setActionError(null)
    const label = targetDir ?? t('settings.desktop.defaultFolderLabel')
    const confirmed = await askConfirm({
      title: t('settings.desktop.moveTitle'),
      body: t('settings.desktop.moveBody', { target: label }),
      confirmLabel: t('common.move'),
    })
    if (!confirmed) return
    setBusy(true)
    setSafetyMessage(t('settings.desktop.moving'))
    try {
      const result = await desktop.world.migrateDataRoot({ targetDir })
      setSettings(result.settings)
      setSafetyMessage(
        result.migrated
          ? t('settings.desktop.moved', {
              path: result.previousFolderKept ?? t('settings.desktop.oldLocation'),
            })
          : t('settings.desktop.alreadyActive'),
      )
    } catch (error) {
      setSafetyMessage(t('settings.desktop.moveFailed', { error: errorText(error) }))
    } finally {
      setBusy(false)
    }
  }

  // Fire-and-forget desktop tools. Their rejections used to escape as
  // unhandled promises and vanish; surface the failure instead.
  function runDesktopTool(
    failure:
      | 'settings.desktop.screenshotFailed'
      | 'settings.desktop.openWorldsFailed'
      | 'settings.desktop.openLogsFailed',
    action: () => Promise<unknown>,
  ): void {
    setActionError(null)
    action().catch((error) => setActionError(t(failure, { error: errorText(error) })))
  }

  async function exportDesktopWorld() {
    if (!desktop) return
    setActionError(null)
    setSafetyMessage(t('settings.desktop.exporting'))
    try {
      const result = await desktop.world.exportActive()
      setSafetyMessage(
        result.exported
          ? t('settings.desktop.exportedTo', { path: result.filePath ?? '' })
          : t('settings.desktop.exportCancelled'),
      )
    } catch (error) {
      setSafetyMessage(t('settings.web.exportFailed', { error: errorText(error) }))
    }
  }

  async function resetDesktopWorld() {
    if (!desktop) return
    setActionError(null)
    setSafetyMessage(null)
    setBusy(true)
    try {
      const result = await desktop.world.resetLocal()
      setSafetyMessage(result.reset ? t('settings.desktop.resetDone') : t('settings.desktop.resetCancelled'))
    } catch (error) {
      setSafetyMessage(t('settings.desktop.resetFailed', { error: errorText(error) }))
    } finally {
      setBusy(false)
    }
  }

  const tabs = desktop ? [...WEB_TABS.slice(0, 1), ...DESKTOP_TABS, ...WEB_TABS.slice(1)] : WEB_TABS
  const desktopTab = tab === 'simulation' || tab === 'app'
  const justSaved = savedAt && Date.now() - savedAt < 2500

  return (
    <Modal open onClose={onClose} className="settings-modal" title={t('settings.title')} hideTitle>
      <div className="lang-modal-header">
        <span className="lang-modal-title">{t('settings.title').toLocaleUpperCase()}</span>
        {desktop && (
          <span className="tree-modal-sub">
            v{desktop.appVersion} · {desktop.platform}
          </span>
        )}
        <button aria-label={t('common.close')} className="close-btn" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="settings-layout">
        <nav className="settings-tabs" aria-label={t('settings.sectionsAria')}>
          {tabs.map((entry) => (
            <button
              key={entry.id}
              className={clsx('settings-tab', tab === entry.id && 'active')}
              aria-pressed={tab === entry.id}
              onClick={() => setTab(entry.id)}
            >
              <ToolSprite icon={entry.icon} size={16} />
              <span>{t(entry.label)}</span>
            </button>
          ))}
        </nav>
        <div className="settings-pane">
          {tab === 'world' &&
            (desktop ? (
              <Section title={t('settings.desktop.yourWorld')}>
                <SettingRow
                  title={t('settings.desktop.exportWorld')}
                  desc={t('settings.desktop.exportWorldDesc')}
                >
                  <button className="lang-btn" onClick={() => void exportDesktopWorld()} disabled={busy}>
                    {t('settings.desktop.exportButton')}
                  </button>
                </SettingRow>
                <SettingRow title={t('settings.desktop.newWorld')} desc={t('settings.desktop.newWorldDesc')}>
                  <button
                    className="lang-btn danger"
                    onClick={() => void resetDesktopWorld()}
                    disabled={busy}
                  >
                    {t('settings.desktop.newWorldButton')}
                  </button>
                </SettingRow>
                {safetyMessage && <div className="settings-note">{safetyMessage}</div>}
              </Section>
            ) : (
              <WorldSourceSection />
            ))}
          {tab === 'language' && (
            <Section title={t('settings.language.section')}>
              <LanguageTab />
            </Section>
          )}
          {tab === 'display' && (
            <Section title={t('settings.display.section')}>
              <DisplayTab />
            </Section>
          )}
          {tab === 'access' && (
            <Section title={t('settings.accessibility.section')}>
              <AccessibilityTab />
            </Section>
          )}
          {tab === 'performance' && (
            <Section title={t('settings.performance.section')}>
              <PerformanceTab />
            </Section>
          )}
          {tab === 'help' && (
            <Section title={t('settings.help.section')}>
              <HelpTab onClose={onClose} />
            </Section>
          )}

          {desktopTab && desktop && !settings && !loadError && (
            <div className="settings-note">{t('common.loading')}</div>
          )}
          {desktopTab && desktop && !settings && loadError && (
            <div className="settings-note" role="alert">
              {loadError}{' '}
              <button className="lang-btn" onClick={() => setLoadAttempt((n) => n + 1)}>
                {t('common.retry')}
              </button>
            </div>
          )}
          {desktopTab && desktop && settings && (
            <>
              {tab === 'simulation' && (
                <Section title={t('settings.desktop.localSimulation')}>
                  <SettingRow
                    title={t('settings.desktop.process')}
                    desc={
                      status
                        ? status.running
                          ? t('settings.desktop.running', { port: status.port ?? '' })
                          : t('settings.desktop.notRunning')
                        : t('settings.desktop.runsNatively')
                    }
                  >
                    <button className="lang-btn" onClick={restart} disabled={busy}>
                      {busy ? t('settings.desktop.restarting') : t('settings.desktop.applyRestart')}
                    </button>
                  </SettingRow>
                  {status?.error && <div className="settings-note error">{status.error}</div>}
                  <Field label={t('settings.desktop.tickInterval', { ms: settings.tickMs })}>
                    <input
                      type="range"
                      min={30}
                      max={2000}
                      step={10}
                      value={settings.tickMs}
                      onChange={(e) => update({ tickMs: parseInt(e.target.value, 10) })}
                      style={{ width: '100%' }}
                    />
                    <div className="settings-note">{t('settings.desktop.tickNote')}</div>
                  </Field>
                  <Field
                    label={t('settings.desktop.capacity', { count: formatNumber(settings.populationCap) })}
                  >
                    <input
                      type="range"
                      min={120}
                      max={5000}
                      step={20}
                      value={settings.populationCap}
                      onChange={(e) => update({ populationCap: parseInt(e.target.value, 10) })}
                      style={{ width: '100%' }}
                    />
                    <div
                      className="desktop-cap-presets"
                      role="group"
                      aria-label={t('settings.desktop.capacityPresets')}
                    >
                      {POPULATION_CAP_PRESETS.map(([cap, label]) => (
                        <button
                          key={cap}
                          type="button"
                          className={settings.populationCap === cap ? 'active' : ''}
                          onClick={() => update({ populationCap: cap })}
                        >
                          {formatNumber(cap)} · {t(label)}
                        </button>
                      ))}
                    </div>
                    <div className="settings-note">{t('settings.desktop.capacityNote')}</div>
                  </Field>
                </Section>
              )}
              {tab === 'app' && (
                <>
                  <Section title={t('settings.desktop.updates')}>
                    <SettingRow
                      title={t('settings.desktop.autoUpdate')}
                      desc={t('settings.desktop.autoUpdateDesc')}
                    >
                      <Switch
                        checked={settings.autoUpdate}
                        onChange={(v) => update({ autoUpdate: v })}
                        label={t('settings.desktop.autoUpdate')}
                      />
                    </SettingRow>
                    <UpdateCheckButton desktop={desktop} />
                  </Section>
                  <Section title={t('settings.desktop.startup')}>
                    <SettingRow
                      title={t('settings.desktop.launchAtSignIn')}
                      desc={t('settings.desktop.launchAtSignInDesc')}
                    >
                      <Switch
                        checked={settings.autoLaunch}
                        onChange={(v) => update({ autoLaunch: v })}
                        label={t('settings.desktop.launchAtSignIn')}
                      />
                    </SettingRow>
                    <SettingRow
                      title={t('settings.desktop.startHidden')}
                      desc={t('settings.desktop.startHiddenDesc')}
                    >
                      <Switch
                        checked={settings.startMinimized}
                        onChange={(v) => update({ startMinimized: v })}
                        label={t('settings.desktop.startHidden')}
                      />
                    </SettingRow>
                    <SettingRow
                      title={t('settings.desktop.pauseWhenHidden')}
                      desc={t('settings.desktop.pauseWhenHiddenDesc')}
                    >
                      <Switch
                        checked={settings.pauseWhenHidden}
                        onChange={(v) => update({ pauseWhenHidden: v })}
                        label={t('settings.desktop.pauseWhenHidden')}
                      />
                    </SettingRow>
                  </Section>
                  <Section title={t('settings.desktop.saveFolder')}>
                    <code className="settings-path">
                      {settings.saveLocationOverride ?? t('settings.desktop.defaultFolder')}
                    </code>
                    <div className="settings-actions">
                      <button
                        className="lang-btn"
                        onClick={async () => {
                          setActionError(null)
                          setSafetyMessage(null)
                          let dir: string | null
                          try {
                            dir = await desktop.app.pickSaveDir()
                          } catch (error) {
                            setSafetyMessage(t('settings.desktop.pickFailed', { error: errorText(error) }))
                            return
                          }
                          if (dir) await migrateSaveFolder(dir)
                        }}
                        disabled={busy}
                      >
                        {t('settings.desktop.moveFolder')}
                      </button>
                      {settings.saveLocationOverride && (
                        <button
                          className="lang-btn"
                          onClick={() => void migrateSaveFolder(null)}
                          disabled={busy}
                        >
                          {t('settings.desktop.moveBack')}
                        </button>
                      )}
                    </div>
                    <div className="settings-note">{t('settings.desktop.moveNote')}</div>
                    {safetyMessage && <div className="settings-note">{safetyMessage}</div>}
                  </Section>
                  <Section title={t('settings.desktop.tools')}>
                    <div className="settings-actions">
                      <button
                        className="lang-btn"
                        onClick={() =>
                          // captureScreenshot() resolves null instead of
                          // rejecting when the capture or its file write fails,
                          // so treat a null path as the failure too.
                          runDesktopTool('settings.desktop.screenshotFailed', async () => {
                            if (!(await desktop.app.screenshot()))
                              throw new Error(t('settings.desktop.captureFailed'))
                          })
                        }
                      >
                        {t('settings.desktop.screenshot')}
                      </button>
                      <button
                        className="lang-btn"
                        onClick={() =>
                          runDesktopTool('settings.desktop.openWorldsFailed', () => desktop.app.openWorlds())
                        }
                      >
                        {t('settings.desktop.openWorlds')}
                      </button>
                      <button
                        className="lang-btn"
                        onClick={() =>
                          runDesktopTool('settings.desktop.openLogsFailed', () => desktop.app.openLogs())
                        }
                      >
                        {t('settings.desktop.openLogs')}
                      </button>
                    </div>
                  </Section>
                </>
              )}
              <div className="settings-footer">
                <button className="lang-btn active" onClick={save} disabled={busy}>
                  {busy ? t('settings.desktop.saving') : t('settings.desktop.save')}
                </button>
                {justSaved && <span className="settings-saved">{t('settings.desktop.saved')}</span>}
                {actionError && (
                  <span className="settings-note" role="alert">
                    {actionError}
                  </span>
                )}
                <span className="settings-note">{t('settings.desktop.restartNote')}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function UpdateCheckButton({ desktop }: { desktop: DesktopBridge }) {
  const [result, setResult] = useState<UpdateCheckResult | null>(null)
  const [checking, setChecking] = useState(false)

  async function check() {
    setChecking(true)
    setResult({ status: 'checking' })
    try {
      setResult(await desktop.app.checkForUpdates())
    } catch (error) {
      // Without this the "checking..." message stayed up forever and the
      // rejection was dropped as an unhandled promise.
      setResult({ status: 'error', message: t('updates.failedWith', { error: errorText(error) }) })
    } finally {
      setChecking(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
      <button className="lang-btn" onClick={check} disabled={checking}>
        {checking ? t('updates.checking') : t('updates.check')}
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
