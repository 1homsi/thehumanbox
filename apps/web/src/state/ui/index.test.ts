import { afterEach, describe, expect, it } from 'vitest'
import { useUIStore } from './index'

const initialSelection = {
  selectedOrgId: null,
  followOrgId: null,
  panelOpen: false,
  leftOpen: false,
}

afterEach(() => {
  useUIStore.setState((state) => ({
    ...initialSelection,
    focus: 'all',
    viewFlags: { ...state.viewFlags, territory: false, territoryMap: false },
  }))
})

describe('world-first panels', () => {
  it('starts with both side panels collapsed', () => {
    useUIStore.setState(initialSelection)
    expect(useUIStore.getState().leftOpen).toBe(false)
    expect(useUIStore.getState().panelOpen).toBe(false)
  })

  it('opens organism details only after an explicit selection', () => {
    useUIStore.setState(initialSelection)
    useUIStore.getState().selectOrg('person-1')
    expect(useUIStore.getState().selectedOrgId).toBe('person-1')
    expect(useUIStore.getState().panelOpen).toBe(true)
  })

  it('releases the selected organism when details are explicitly closed', () => {
    useUIStore.setState({ ...initialSelection, selectedOrgId: 'person-1', panelOpen: true })
    useUIStore.getState().togglePanel()
    expect(useUIStore.getState().panelOpen).toBe(false)
    expect(useUIStore.getState().selectedOrgId).toBeNull()
  })

  it('stops following the old organism when selection changes', () => {
    useUIStore.setState({
      ...initialSelection,
      selectedOrgId: 'person-1',
      followOrgId: 'person-1',
      panelOpen: true,
    })
    useUIStore.getState().selectOrg('person-2')
    expect(useUIStore.getState().selectedOrgId).toBe('person-2')
    expect(useUIStore.getState().followOrgId).toBeNull()
  })

  it('enters and leaves territory view as one consistent transition', () => {
    useUIStore.setState({
      ...initialSelection,
      selectedOrgId: 'person-1',
      followOrgId: 'person-1',
      panelOpen: true,
      leftOpen: true,
      focus: 'all',
    })
    useUIStore.getState().setTerritoryView(true)
    expect(useUIStore.getState()).toMatchObject({
      selectedOrgId: null,
      followOrgId: null,
      panelOpen: false,
      leftOpen: false,
      focus: 'all',
    })
    expect(useUIStore.getState().viewFlags.territory).toBe(true)
    expect(useUIStore.getState().viewFlags.territoryMap).toBe(false)

    useUIStore.setState({ focus: 'lineage:lin-x' })
    useUIStore.getState().setTerritoryView(false)
    expect(useUIStore.getState().viewFlags.territory).toBe(false)
    expect(useUIStore.getState().focus).toBe('all')
  })
})
