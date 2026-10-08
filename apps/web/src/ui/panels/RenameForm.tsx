import { useState } from 'react'
import { sendSandboxCommand } from '../../simulation/commandBus'
import { useUIStore } from '../../state/store'
import { personName } from '../../shared/personName'
import type { OrganismState } from '../../shared/types'

/** The longest name a person can be given; the simulation keeps the same limit. */
const MAX_NAME = 24

/** Inline editor shown on a person's card while they are being renamed. */
export function RenameForm({ org }: { org: Pick<OrganismState, 'id' | 'name' | 'custom_name'> }) {
  const stopRename = useUIStore((s) => s.stopRename)
  const [value, setValue] = useState(() => personName(org))

  const save = () => {
    const name = value.trim()
    stopRename()
    if (!name || name === personName(org)) return
    void sendSandboxCommand({ cmd: 'rename_person', id: org.id, name })
  }

  return (
    <form
      className="org-rename-form"
      style={{ display: 'flex', gap: 6, padding: '4px 0' }}
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <input
        autoFocus
        aria-label="New name"
        maxLength={MAX_NAME}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') stopRename()
        }}
        style={{ flex: 1, minWidth: 0 }}
      />
      <button type="submit">save</button>
      <button type="button" onClick={stopRename}>
        cancel
      </button>
    </form>
  )
}
