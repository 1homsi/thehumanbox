use super::*;

/// The world's buildings: a plain list that also keeps a coarse position index,
/// so "which buildings are near here" does not read every building.
///
/// Reads go through `Deref` to the `Vec`; any mutable access (`push`, `retain`,
/// `iter_mut`, indexing for writing) goes through `DerefMut`, which marks the
/// index stale. The index is rebuilt the next time it is asked, so it can never
/// disagree with the list. It only records where buildings stand (their
/// footprints never move once placed); whether a nearby building is operational,
/// whose it is and what it is stay the caller's live checks.
pub struct BuildingList {
    items: Vec<Building>,
    version: u64,
    index: std::cell::RefCell<PositionIndex>,
}

/// Side of an index cell, in tiles.
const CELL_SHIFT: i32 = 4;

#[derive(Default)]
struct PositionIndex {
    /// The list version these cells were built for.
    built_for: Option<u64>,
    columns: i32,
    rows: i32,
    /// Building positions in the list, per cell, for every cell a footprint touches.
    cells: Vec<Vec<u32>>,
}

impl PositionIndex {
    fn cell(&self, x: i32, y: i32) -> (i32, i32) {
        (
            (x >> CELL_SHIFT).clamp(0, self.columns - 1),
            (y >> CELL_SHIFT).clamp(0, self.rows - 1),
        )
    }

    fn rebuild(&mut self, items: &[Building], version: u64) {
        use crate::world::grid::{HEIGHT, WIDTH};
        self.columns = ((WIDTH as i32) >> CELL_SHIFT) + 1;
        self.rows = ((HEIGHT as i32) >> CELL_SHIFT) + 1;
        for cell in &mut self.cells {
            cell.clear();
        }
        self.cells
            .resize_with((self.columns * self.rows) as usize, Vec::new);
        for (position, building) in items.iter().enumerate() {
            let (width, height) = building.footprint();
            let (x0, y0) = self.cell(building.x, building.y);
            let (x1, y1) = self.cell(
                building.x + i32::from(width) - 1,
                building.y + i32::from(height) - 1,
            );
            for cy in y0..=y1 {
                for cx in x0..=x1 {
                    self.cells[(cy * self.columns + cx) as usize].push(position as u32);
                }
            }
        }
        self.built_for = Some(version);
    }
}

impl BuildingList {
    pub fn new() -> Self {
        Self::from(Vec::new())
    }

    /// Calls `visit` for every building whose footprint touches the square of
    /// half-width `radius` around `(x, y)` (and possibly some that do not), until
    /// it returns true. Returns whether it did. A building spanning several cells
    /// can be visited more than once.
    pub fn any_near(&self, x: i32, y: i32, radius: i32, mut visit: impl FnMut(&Building) -> bool) -> bool {
        self.visit_near(x, y, radius, |_, building| visit(building))
    }

    /// `any_near`, also telling the visitor each building's position in the
    /// list, for callers whose tie-breaks follow list order.
    pub fn visit_near(
        &self,
        x: i32,
        y: i32,
        radius: i32,
        mut visit: impl FnMut(usize, &Building) -> bool,
    ) -> bool {
        let mut index = self.index.borrow_mut();
        if index.built_for != Some(self.version) {
            index.rebuild(&self.items, self.version);
        }
        let (x0, y0) = index.cell(x - radius, y - radius);
        let (x1, y1) = index.cell(x + radius, y + radius);
        for cy in y0..=y1 {
            for cx in x0..=x1 {
                for &position in &index.cells[(cy * index.columns + cx) as usize] {
                    if visit(position as usize, &self.items[position as usize]) {
                        return true;
                    }
                }
            }
        }
        false
    }
}

impl Default for BuildingList {
    fn default() -> Self {
        Self::new()
    }
}

impl From<Vec<Building>> for BuildingList {
    fn from(items: Vec<Building>) -> Self {
        BuildingList {
            items,
            version: 0,
            index: Default::default(),
        }
    }
}

impl Clone for BuildingList {
    fn clone(&self) -> Self {
        Self::from(self.items.clone())
    }
}

impl std::ops::Deref for BuildingList {
    type Target = Vec<Building>;

    fn deref(&self) -> &Vec<Building> {
        &self.items
    }
}

impl std::ops::DerefMut for BuildingList {
    fn deref_mut(&mut self) -> &mut Vec<Building> {
        self.version += 1;
        &mut self.items
    }
}

impl<'a> IntoIterator for &'a BuildingList {
    type Item = &'a Building;
    type IntoIter = std::slice::Iter<'a, Building>;

    fn into_iter(self) -> Self::IntoIter {
        self.items.iter()
    }
}

impl<'a> IntoIterator for &'a mut BuildingList {
    type Item = &'a mut Building;
    type IntoIter = std::slice::IterMut<'a, Building>;

    fn into_iter(self) -> Self::IntoIter {
        self.version += 1;
        self.items.iter_mut()
    }
}
