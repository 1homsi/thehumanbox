use super::{clamp_cmd_coord, Simulation};
use crate::sim::buildings::{Building, BuildingKind};
use crate::world::grid::WorldGrid;
use crate::world::tiles::Tile;

/// The kind a name refers to (the names the sim uses: "hut", "house", "school", ...), if any.
fn kind_named(name: &str) -> Option<BuildingKind> {
    BuildingKind::all()
        .iter()
        .copied()
        .find(|kind| kind.name() == name)
}

/// Whether a footprint `x, y, w, h` shares a tile with the building.
fn overlaps(building: &Building, x: i32, y: i32, w: i32, h: i32) -> bool {
    let (bw, bh) = building.footprint();
    building.x < x + w
        && x < building.x + i32::from(bw)
        && building.y < y + h
        && y < building.y + i32::from(bh)
}

impl Simulation {
    /// Place a finished building of the named kind with its top-left tile at `(x, y)`. Every tile of its footprint
    /// must be dry land inside the world and free of other buildings; otherwise nothing is placed. The building has
    /// no owner, so the first lineage nearby can take it over. Returns false for an unknown kind or a blocked spot.
    pub(super) fn cmd_place_building(&mut self, x: i32, y: i32, kind: String) -> bool {
        let Some(kind) = kind_named(&kind) else {
            return false;
        };
        // Command coordinates are untrusted: clamp before any offset is added.
        let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
        let (w, h) = kind.footprint();
        let (w, h) = (i32::from(w), i32::from(h));
        for dx in 0..w {
            for dy in 0..h {
                let (tx, ty) = (x + dx, y + dy);
                if !WorldGrid::in_bounds(tx, ty)
                    || matches!(self.grid.get(tx, ty), Tile::Water | Tile::Rock | Tile::Void)
                {
                    return false;
                }
            }
        }
        if self.buildings.any_near(x, y, 8, |b| overlaps(b, x, y, w, h)) {
            return false;
        }
        let id = self
            .buildings
            .iter()
            .map(|b| b.id)
            .max()
            .unwrap_or(0)
            .saturating_add(1);
        let mut building = Building::new(id, kind, x, y, None, self.tick_count);
        building.condition = 1.0;
        self.buildings.push(building);
        self.building_state_revision = self.building_state_revision.wrapping_add(1);
        true
    }
}

#[cfg(test)]
mod tests {
    use crate::sim::simulation::Simulation;
    use crate::world::tiles::Tile;

    #[test]
    fn place_adds_a_finished_unowned_building_of_the_named_kind() {
        let mut sim = Simulation::new(10);
        sim.buildings.clear();
        for dx in 0..6 {
            for dy in 0..6 {
                sim.grid.set(40 + dx, 40 + dy, Tile::Grass);
            }
        }
        assert!(sim.apply_command_json(r#"{"cmd":"place_building","x":40,"y":40,"kind":"house"}"#));
        assert_eq!(sim.buildings.len(), 1);
        let placed = &sim.buildings[0];
        assert_eq!((placed.x, placed.y), (40, 40));
        assert!(placed.is_complete());
        assert!(placed.owner_lineage.is_none());
        assert_eq!(placed.kind.name(), "house");
    }

    #[test]
    fn place_refuses_water_overlap_and_unknown_kinds() {
        let mut sim = Simulation::new(10);
        sim.buildings.clear();
        sim.grid.set(60, 60, Tile::Grass);
        sim.grid.set(61, 60, Tile::Water);
        assert!(
            !sim.apply_command_json(r#"{"cmd":"place_building","x":60,"y":60,"kind":"house"}"#),
            "water in the footprint"
        );
        assert!(
            !sim.apply_command_json(r#"{"cmd":"place_building","x":60,"y":60,"kind":"castle"}"#),
            "unknown kind"
        );
        sim.grid.set(70, 70, Tile::Grass);
        assert!(sim.apply_command_json(r#"{"cmd":"place_building","x":70,"y":70,"kind":"hut"}"#));
        assert!(
            !sim.apply_command_json(r#"{"cmd":"place_building","x":70,"y":70,"kind":"hut"}"#),
            "already built here"
        );
        assert_eq!(sim.buildings.len(), 1);
    }
}
