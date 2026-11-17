import { afterEach, describe, expect, it } from 'vitest'
import { useUIStore } from './index'

const initialSelection = {
  selectedOrgId: null,
  followOrgId: null,
  renamingOrgId: null,
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

describe('renaming a person', () => {
  it('is abandoned when someone else, or no one, is selected', () => {
    useUIStore.getState().startRename('a')
    expect(useUIStore.getState().renamingOrgId).toBe('a')
    useUIStore.getState().selectOrg('b')
    expect(useUIStore.getState().renamingOrgId).toBeNull()
    // ... so selecting the first person again does not bring the form back.
    useUIStore.getState().selectOrg('a')
    expect(useUIStore.getState().renamingOrgId).toBeNull()

    useUIStore.getState().startRename('a')
    useUIStore.getState().selectOrg(null)
    expect(useUIStore.getState().renamingOrgId).toBeNull()
  })

  it('survives re-selecting the same person, and ends when their drawer closes', () => {
    useUIStore.getState().startRename('a')
    useUIStore.getState().selectOrg('a')
    expect(useUIStore.getState().renamingOrgId).toBe('a')
    useUIStore.getState().selectOrg(null)
    expect(useUIStore.getState().renamingOrgId).toBeNull()
  })

  it('opens the person drawer without opening the people list', () => {
    useUIStore.getState().startRename('a')
    expect(useUIStore.getState()).toMatchObject({ selectedOrgId: 'a', renamingOrgId: 'a', panelOpen: false })
  })
})

describe('world-first panels', () => {
  it('leaves dock tool names to their tooltips by default', () => {
    expect(useUIStore.getState().viewFlags.toolNames).toBe(false)
  })

  it('starts with both side panels collapsed', () => {
    useUIStore.setState(initialSelection)
    expect(useUIStore.getState().leftOpen).toBe(false)
    expect(useUIStore.getState().panelOpen).toBe(false)
  })

  it('opens a person in their own drawer, leaving the people list as it was', () => {
    useUIStore.setState(initialSelection)
    useUIStore.getState().selectOrg('person-1')
    expect(useUIStore.getState().selectedOrgId).toBe('person-1')
    expect(useUIStore.getState().panelOpen).toBe(false)
  })

  it('keeps the person drawer open when the people list closes', () => {
    useUIStore.setState({ ...initialSelection, selectedOrgId: 'person-1', panelOpen: true })
    useUIStore.getState().togglePanel()
    expect(useUIStore.getState().panelOpen).toBe(false)
    expect(useUIStore.getState().selectedOrgId).toBe('person-1')
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

describe('family tree', () => {
  it('opens on the whole population by default and on one person when asked', () => {
    useUIStore.getState().openFamilyTree()
    expect(useUIStore.getState().showFamilyTree).toBe(true)
    expect(useUIStore.getState().familyTreeFocus).toBeNull()
    useUIStore.getState().closeFamilyTree()
    useUIStore.getState().openFamilyTree('person-7')
    expect(useUIStore.getState().familyTreeFocus).toBe('person-7')
    useUIStore.getState().closeFamilyTree()
    expect(useUIStore.getState().showFamilyTree).toBe(false)
    expect(useUIStore.getState().familyTreeFocus).toBeNull()
  })
})
