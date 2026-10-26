import type { CSSProperties } from 'react'

/** The look every map hover card shares: a small dark box with a gold rule, placed beside the pointer. */
export const CARD: CSSProperties = {
  position: 'absolute',
  zIndex: 15,
  pointerEvents: 'none',
  minWidth: 140,
  maxWidth: 220,
  padding: '6px 8px',
  background: 'rgba(20, 15, 10, 0.94)',
  border: '1px solid #c9a24a',
  borderRadius: 3,
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
  color: '#f1e6c8',
  font: '11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
}
