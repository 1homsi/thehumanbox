import { useRef, useState, type DragEvent } from 'react'
import clsx from 'clsx'
import { t } from '../../i18n'
import { askConfirm } from '../../shared/confirm'
import { useMods, type InstallResult, type InstalledMod } from '../../simulation/actions/mod-store'
import { MOD_LIMITS, describeModProblem, type ModProblem } from '../../simulation/actions/mods'
import { ToolSprite } from '../toolbar/ToolSprite'
import { Section, Switch } from './DesktopSettingsModal'
import './mods-tab.css'

export const SAMPLE_MOD_URL = `${import.meta.env.BASE_URL}mods/example-firestorm.json`

function Problems({ problems, source }: { problems: readonly ModProblem[]; source?: unknown }) {
  return (
    <ul className="mods-problems">
      {problems.map((p, i) => (
        <li key={i}>{describeModProblem(p, source)}</li>
      ))}
    </ul>
  )
}

function ImportResult({ result }: { result: InstallResult }) {
  if (!result.ok)
    return (
      <div className="settings-note error mods-result" role="alert">
        <div>{t('settings.mods.failed')}</div>
        <Problems problems={result.problems} source={result.source} />
      </div>
    )
  const { mod } = result
  return (
    <div className="settings-note mods-result mods-ok" role="status">
      <div>
        {t(result.replaced ? 'settings.mods.updated' : 'settings.mods.added', {
          name: mod.name,
          count: mod.manifest.actions.length,
        })}
      </div>
      {mod.notes.length > 0 && <Problems problems={mod.notes} />}
    </div>
  )
}

function ModCard({ entry }: { entry: InstalledMod }) {
  const setEnabled = useMods((s) => s.setEnabled)
  const remove = useMods((s) => s.remove)
  const { mod } = entry
  const name = mod?.name ?? t('settings.mods.brokenName')
  const confirmRemove = () => {
    void askConfirm({
      title: t('settings.mods.removeTitle', { name }),
      body: t('settings.mods.removeBody'),
      confirmLabel: t('settings.mods.remove'),
    }).then((ok) => {
      if (ok) remove(mod?.id ?? entry.raw)
    })
  }
  return (
    <li className={clsx('mods-card', mod && !entry.enabled && 'off')}>
      <div className="mods-card-head">
        <div className="mods-card-text">
          <div className="settings-row-title">{name}</div>
          {mod?.author && (
            <div className="settings-row-desc">{t('settings.mods.by', { author: mod.author })}</div>
          )}
        </div>
        {mod && (
          <Switch
            checked={entry.enabled}
            onChange={(on) => setEnabled(mod.id, on)}
            label={t('settings.mods.enable', { name })}
          />
        )}
        <button type="button" className="lang-btn danger mods-remove" onClick={confirmRemove}>
          {t('settings.mods.remove')}
        </button>
      </div>
      {mod?.description && <div className="settings-row-desc">{mod.description}</div>}
      {mod ? (
        <ul className="mods-actions" aria-label={t('settings.mods.actionsLabel', { name })}>
          {mod.manifest.actions.map((action) => (
            <li key={action.id} className="mods-action" title={action.description ?? action.label}>
              <ToolSprite icon={action.icon} size={16} />
              <span>{action.label}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="settings-note error">
          <div>{t('settings.mods.broken')}</div>
          <Problems problems={entry.problems} />
        </div>
      )}
    </li>
  )
}

export function ModsTab() {
  const mods = useMods((s) => s.mods)
  const install = useMods((s) => s.install)
  const [result, setResult] = useState<InstallResult | null>(null)
  const [pasted, setPasted] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const importText = (text: string) => {
    const outcome = install(text)
    setResult(outcome)
    if (outcome.ok) setPasted('')
  }
  const importFile = (file: File | undefined) => {
    if (!file) return
    if (file.size > MOD_LIMITS.bytes) {
      setResult({
        ok: false,
        problems: [
          {
            key: 'settings.mods.problems.tooBig',
            params: { size: Math.ceil(file.size / 1000), most: MOD_LIMITS.bytes / 1000 },
          },
        ],
      })
      return
    }
    void file.text().then(importText, (error: unknown) =>
      setResult({
        ok: false,
        problems: [{ key: 'settings.mods.problems.unreadable', params: { detail: String(error) } }],
      }),
    )
  }
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    importFile(event.dataTransfer.files[0])
  }

  return (
    <>
      <Section title={t('settings.mods.section')}>
        <div className="settings-row-desc">{t('settings.mods.intro')}</div>
        <div className="settings-note">
          {t('settings.mods.rules', { steps: MOD_LIMITS.steps, radius: MOD_LIMITS.radius })}{' '}
          <a href={SAMPLE_MOD_URL} download="example-firestorm.json">
            {t('settings.mods.sample')}
          </a>
        </div>
        <div
          className={clsx('mods-drop', dragging && 'dragging')}
          role="button"
          tabIndex={0}
          aria-label={t('settings.mods.pick')}
          onClick={() => fileInput.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              fileInput.current?.click()
            }
          }}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <ToolSprite icon="✨" size={20} />
          <span>{t('settings.mods.drop')}</span>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => {
            importFile(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        <label className="mods-paste">
          <span className="settings-row-desc">{t('settings.mods.pasteLabel')}</span>
          <textarea
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            placeholder={t('settings.mods.pastePlaceholder')}
            rows={4}
            spellCheck={false}
          />
        </label>
        <div className="settings-actions">
          <button
            type="button"
            className="lang-btn primary"
            disabled={!pasted.trim()}
            onClick={() => importText(pasted)}
          >
            {t('settings.mods.import')}
          </button>
        </div>
        {result && <ImportResult result={result} />}
      </Section>
      <Section title={t('settings.mods.installed')}>
        {mods.length === 0 ? (
          <div className="settings-row-desc">{t('settings.mods.none')}</div>
        ) : (
          <ul className="mods-list">
            {mods.map((entry) => (
              <ModCard key={entry.mod?.id ?? entry.raw} entry={entry} />
            ))}
          </ul>
        )}
        <div className="settings-note">{t('settings.mods.storedNote')}</div>
      </Section>
    </>
  )
}
