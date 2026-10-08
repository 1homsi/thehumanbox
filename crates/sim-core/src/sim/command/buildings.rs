use super::{clamp_cmd_coord, Simulation};
use crate::sim::buildings::Building;
use crate::world::grid::WorldGrid;
use crate::world::tiles::Tile;

/// Whether any tile of the building's footprint lies within `radius` of `(x, y)`.
fn footprint_touches(building: &Building, x: i32, y: i32, radius: i32) -> bool {
    let (width, height) = building.footprint();
    let nearest_x = x.clamp(building.x, building.x + i32::from(width) - 1);
    let nearest_y = y.clamp(building.y, building.y + i32::from(height) - 1);
    let (dx, dy) = (nearest_x - x, nearest_y - y);
    dx * dx + dy * dy <= radius * radius
}

impl Simulation {
    /// Remove the buildings the radius touches, and clear the huts and campfires
    /// standing on tiles inside it. Returns false when there was nothing to pull down.
    pub(super) fn cmd_demolish(&mut self, x: i32, y: i32, radius: i32) -> bool {
        // Command coordinates are untrusted: clamp before any offset is added.
        let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
        let r = radius.clamp(0, 24);
        let before = self.buildings.len();
        self.buildings.retain(|b| !footprint_touches(b, x, y, r));
        let mut cleared = 0usize;
        for dx in -r..=r {
            for dy in -r..=r {
                if dx * dx + dy * dy > r * r {
                    continue;
                }
                let (nx, ny) = (x + dx, y + dy);
                if !WorldGrid::in_bounds(nx, ny) {
                    continue;
                }
                if matches!(self.grid.get(nx, ny), Tile::Hut | Tile::Campfire) {
                    self.grid.set(nx, ny, Tile::Grass);
                    cleared += 1;
                }
            }
        }
        let removed = before - self.buildings.len();
        if removed == 0 && cleared == 0 {
            return false;
        }
        self.building_state_revision = self.building_state_revision.wrapping_add(1);
        true
    }

    /// Bring every damaged or ruined building the radius touches back to full
    /// condition. Returns false when none of them needed it.
    pub(super) fn cmd_repair(&mut self, x: i32, y: i32, radius: i32) -> bool {
        let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
        let r = radius.clamp(0, 24);
        let tick = self.tick_count;
        let mut repaired = 0usize;
        for building in self.buildings.iter_mut() {
            if !footprint_touches(building, x, y, r) || !(building.is_damaged() || building.is_ruined()) {
                continue;
            }
            building.damage = 0.0;
            building.ruined_at_tick = None;
            building.last_repair_tick = Some(tick);
            repaired += 1;
        }
        if repaired == 0 {
            return false;
        }
        self.building_state_revision = self.building_state_revision.wrapping_add(1);
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::buildings::BuildingKind;

    fn hut_at(sim: &mut Simulation, id: u32, x: i32, y: i32) {
        let tick = sim.tick_count;
        sim.buildings.push(Building::new(
            id,
            BuildingKind::Hut,
            x,
            y,
            Some("tribe".into()),
            tick,
        ));
    }

    #[test]
    fn demolish_removes_only_buildings_the_radius_touches() {
        let mut sim = Simulation::new(3);
        sim.buildings.clear();
        hut_at(&mut sim, 1, 100, 100);
        hut_at(&mut sim, 2, 200, 200);
        assert!(sim.apply_command_json(r#"{"cmd":"demolish","x":100,"y":100,"radius":3}"#));
        let ids: Vec<u32> = sim.buildings.iter().map(|b| b.id).collect();
        assert_eq!(ids, vec![2]);
    }

    #[test]
    fn demolish_clears_huts_and_campfires_on_the_grid_to_grass() {
        let mut sim = Simulation::new(3);
        sim.buildings.clear();
        sim.grid.set(50, 50, Tile::Hut);
        sim.grid.set(51, 50, Tile::Campfire);
        sim.grid.set(52, 50, Tile::Rock);
        assert!(sim.apply_command_json(r#"{"cmd":"demolish","x":50,"y":50,"radius":3}"#));
        assert_eq!(sim.grid.get(50, 50), Tile::Grass);
        assert_eq!(sim.grid.get(51, 50), Tile::Grass);
        assert_eq!(sim.grid.get(52, 50), Tile::Rock);
    }

    #[test]
    fn demolish_reports_nothing_to_pull_down() {
        let mut sim = Simulation::new(3);
        sim.buildings.clear();
        let revision = sim.building_state_revision;
        assert!(!sim.apply_command_json(r#"{"cmd":"demolish","x":10,"y":10,"radius":2}"#));
        assert_eq!(sim.building_state_revision, revision);
    }

    #[test]
    fn repair_restores_damaged_and_ruined_buildings_in_reach() {
        let mut sim = Simulation::new(3);
        sim.buildings.clear();
        hut_at(&mut sim, 1, 100, 100);
        hut_at(&mut sim, 2, 200, 200);
        sim.buildings[0].damage = 0.6;
        sim.buildings[0].ruined_at_tick = Some(5);
        sim.buildings[1].damage = 0.6;
        assert!(sim.apply_command_json(r#"{"cmd":"repair","x":100,"y":100,"radius":3}"#));
        assert_eq!(sim.buildings[0].damage, 0.0);
        assert!(sim.buildings[0].ruined_at_tick.is_none());
        assert!(!sim.buildings[0].is_ruined());
        assert_eq!(
            sim.buildings[1].damage, 0.6,
            "a building out of reach is left alone"
        );
    }

    #[test]
    fn repair_reports_nothing_to_do_on_intact_buildings() {
        let mut sim = Simulation::new(3);
        sim.buildings.clear();
        hut_at(&mut sim, 1, 100, 100);
        assert!(!sim.apply_command_json(r#"{"cmd":"repair","x":100,"y":100,"radius":3}"#));
    }
}
