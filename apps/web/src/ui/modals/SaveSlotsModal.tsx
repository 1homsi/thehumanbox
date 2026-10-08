import { useCallback, useEffect, useState } from 'react'
import { SAVE_SLOT_COUNT, type SaveSlotInfo } from '../../simulation/saveSlots'
import { Modal } from './Modal'

interface Props {
  listSlots: () => Promise<SaveSlotInfo[]>
  saveSlot: (slot: number) => Promise<boolean>
  loadSlot: (slot: number) => Promise<boolean>
  onClose: () => void
}

function savedLabel(savedAt: number): string {
  return new Date(savedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}

/** Three named saves of the browser world, kept next to the autosave. */
export function SaveSlotsModal({ listSlots, saveSlot, loadSlot, onClose }: Props) {
  const [slots, setSlots] = useState<SaveSlotInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = useCallback(() => {
    void listSlots().then(setSlots)
  }, [listSlots])

  useEffect(() => {
    refresh()
  }, [refresh])

  const run = (action: (slot: number) => Promise<boolean>, slot: number, done: string, failed: string) => {
    setBusy(true)
    setMessage(null)
    void action(slot).then((ok) => {
      setBusy(false)
      setMessage(ok ? done : failed)
      refresh()
    })
  }

  const rows = Array.from({ length: SAVE_SLOT_COUNT }, (_, index) => index + 1)

  return (
    <Modal open onClose={onClose} className="save-slots-modal" title="Save slots" hideTitle>
      <div className="lang-modal-header">
        <span className="lang-modal-title">SAVE SLOTS</span>
      </div>
      <p className="tree-modal-sub">
        Keep this world in one of three slots, next to the autosave. Loading a slot replaces the world you are
        watching.
      </p>
      <ul className="save-slot-list">
        {rows.map((slot) => {
          const info = slots.find((s) => s.slot === slot)
          return (
            <li key={slot} className="save-slot-row">
              <span className="save-slot-label">
                Slot {slot} ·{' '}
                {info ? `tick ${info.tick.toLocaleString()} · saved ${savedLabel(info.savedAt)}` : 'empty'}
              </span>
              <button
                type="button"
                className="tree-zoom-btn"
                disabled={busy}
                onClick={() => run(saveSlot, slot, `saved to slot ${slot}`, `could not save slot ${slot}`)}
              >
                save here
              </button>
              <button
                type="button"
                className="tree-zoom-btn"
                disabled={busy || !info}
                onClick={() => run(loadSlot, slot, `loaded slot ${slot}`, `could not load slot ${slot}`)}
              >
                load
              </button>
            </li>
          )
        })}
      </ul>
      {message && (
        <p role="status" className="tree-modal-sub">
          {message}
        </p>
      )}
    </Modal>
  )
}
