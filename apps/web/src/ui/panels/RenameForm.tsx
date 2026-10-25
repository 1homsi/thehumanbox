import { useEffect, useRef, useState } from 'react'
import { sendSandboxCommand } from '../../simulation/commandBus'
import { useUIStore } from '../../state/store'
import { personName } from '../../shared/personName'
import type { OrganismState } from '../../shared/types'
import { t } from '../../i18n'

/** The longest name a person can be given; the simulation keeps the same limit. */
const MAX_NAME = 24

/** Inline editor shown on a person's card while they are being renamed. */
export function RenameForm({ org }: { org: Pick<OrganismState, 'id' | 'name' | 'custom_name'> }) {
  const stopRename = useUIStore((s) => s.stopRename)
  const [value, setValue] = useState(() => personName(org))
  const [refused, setRefused] = useState(false)
  // One submission at a time: a second name typed while the world answers would be a second, independent command.
  const [pending, setPending] = useState(false)
  // The world answers later. By then the form may be gone, or the player may be renaming someone else.
  const open = useRef(true)
  useEffect(() => {
    open.current = true
    return () => {
      open.current = false
    }
  }, [])

  const save = () => {
    if (pending) return
    const name = value.trim()
    if (!name || name === personName(org)) {
      stopRename()
      return
    }
    setRefused(false)
    setPending(true)
    // A refused name (no sandbox here, or the world turned it down) keeps the form open with a message,
    // so the player can try another name or cancel. The card would otherwise show the old name with no reason.
    sendSandboxCommand({ cmd: 'rename_person', id: org.id, name }).then(
      (saved) => {
        if (!open.current) return
        setPending(false)
        if (saved) stopRename()
        else setRefused(true)
      },
      () => {
        if (!open.current) return
        setPending(false)
        setRefused(true)
      },
    )
  }

  return (
    <form
      className="org-rename-form"
      style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 0' }}
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <input
        autoFocus
        aria-label={t('panels.rename.label')}
        maxLength={MAX_NAME}
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          // An Escape that cancels a composed character is the input method's; it does not cancel the rename.
          if (e.key === 'Escape' && !e.nativeEvent.isComposing && e.keyCode !== 229) stopRename()
        }}
        style={{ flex: 1, minWidth: 0 }}
      />
      <button type="submit" disabled={pending}>
        {t('panels.rename.save')}
      </button>
      <button type="button" onClick={stopRename}>
        {t('panels.rename.cancel')}
      </button>
      {refused && (
        <div role="alert" style={{ color: '#ff9b6b', fontSize: 11, flexBasis: '100%' }}>
          {t('panels.rename.refused')}
        </div>
      )}
    </form>
  )
}
