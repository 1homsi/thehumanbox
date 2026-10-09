use super::{clamp_cmd_coord, Simulation};
use crate::organism::organism::Harm;
use crate::sim::civ::building_damage::{strike_buildings, DamageCause};
use crate::sim::world_events::push_event;
use crate::world::grid::WorldGrid;
use crate::world::tiles::Tile;
use rand::RngExt;

/// The widest hail reaches, in tiles.
const MAX_RADIUS: i32 = 14;
/// Health a person loses at the centre of the hail (less toward its edge).
const CENTRE_HARM: f32 = 0.3;
/// Chance that a small animal caught in the hail dies.
const ANIMAL_DEATH_CHANCE: f32 = 0.2;

impl Simulation {
    /// Hail beats down on the ground inside the radius: plantings and wild food are flattened, roofs
    /// take a little damage, people are hurt (more at the centre) and some animals are killed.
    /// Returns false when nothing in reach could be changed.
    pub(super) fn cmd_hail(&mut self, x: i32, y: i32, radius: i32) -> bool {
        let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
        let r = radius.clamp(2, MAX_RADIUS);
        let rf = r as f32;
        let mut hit = false;
        for dx in -r..=r {
            for dy in -r..=r {
                if dx * dx + dy * dy > r * r {
                    continue;
                }
                let (ix, iy) = (x + dx, y + dy);
                if !WorldGrid::in_bounds(ix, iy) {
                    continue;
                }
                if self.plantings.remove(&(WorldGrid::idx(ix, iy) as u32)).is_some() {
                    hit = true;
                }
                if self.grid.get(ix, iy) == Tile::Food {
                    self.grid.set(ix, iy, Tile::Grass);
                    hit = true;
                }
            }
        }
        if hit {
            self.planting_revision = self.planting_revision.wrapping_add(1);
        }
        hit |= strike_buildings(self, x, y, rf, 0.1, 0.0, DamageCause::Storm) > 0;

        let tick = self.tick_count;
        for o in self.organisms.iter_mut().filter(|o| o.alive) {
            let d = (o.x - x as f32).hypot(o.y - y as f32);
            if d <= rf {
                o.health -= CENTRE_HARM * (1.0 - d / (rf + 1.0));
                o.mark_harm(Harm::Disaster, tick);
                hit = true;
            }
        }

        let caught: Vec<usize> = self
            .animals
            .iter()
            .enumerate()
            .filter(|(_, a)| a.alive && (a.x - x as f32).hypot(a.y - y as f32) <= rf)
            .map(|(i, _)| i)
            .collect();
        for i in caught {
            if self.rng.random::<f32>() < ANIMAL_DEATH_CHANCE {
                self.animals[i].alive = false;
                hit = true;
            }
        }

        if hit {
            push_event(
                &mut self.events,
                tick,
                "disaster",
                "world",
                &format!("hail beat down around ({x}, {y})"),
            );
        }
        hit
    }
}

#[cfg(test)]
mod tests {
    use crate::organism::animal::Animal;
    use crate::organism::animal::AnimalKind;
    use crate::sim::simulation::Simulation;
    use crate::world::tiles::Tile;

    /// Only the given people are alive; animals and plantings are cleared so only the hail acts.
    fn clear_world(sim: &mut Simulation, people: &[(f32, f32)]) {
        for o in sim.organisms.iter_mut() {
            o.alive = false;
        }
        for (k, &(x, y)) in people.iter().enumerate() {
            sim.organisms[k].alive = true;
            sim.organisms[k].x = x;
            sim.organisms[k].y = y;
            sim.organisms[k].health = 1.0;
        }
        sim.animals.clear();
        sim.plantings.clear();
    }

    #[test]
    fn hail_flattens_food_and_hurts_people_inside_its_reach_only() {
        let mut sim = Simulation::new(4);
        clear_world(&mut sim, &[(100.0, 100.0), (200.0, 200.0)]);
        sim.grid.set(102, 100, Tile::Food);
        sim.grid.set(190, 190, Tile::Food);
        assert!(sim.apply_command_json(r#"{"cmd":"hail","x":100,"y":100,"radius":6}"#));
        assert_eq!(
            sim.grid.get(102, 100),
            Tile::Grass,
            "food in reach is beaten flat"
        );
        assert_eq!(
            sim.grid.get(190, 190),
            Tile::Food,
            "food out of reach is untouched"
        );
        assert!(sim.organisms[0].health < 1.0, "the person in the hail is hurt");
        assert_eq!(sim.organisms[1].health, 1.0, "the person outside is not");
    }

    #[test]
    fn hail_on_empty_ground_changes_nothing_and_reports_it() {
        let mut sim = Simulation::new(4);
        clear_world(&mut sim, &[(200.0, 200.0)]);
        assert!(!sim.apply_command_json(r#"{"cmd":"hail","x":40,"y":40,"radius":5}"#));
        assert_eq!(sim.organisms[0].health, 1.0);
    }

    #[test]
    fn hail_kills_some_animals_in_reach() {
        let mut sim = Simulation::new(9);
        clear_world(&mut sim, &[]);
        for i in 0..200 {
            sim.animals.push(Animal::new(i, 60.0, 60.0, AnimalKind::Rabbit));
        }
        assert!(sim.apply_command_json(r#"{"cmd":"hail","x":60,"y":60,"radius":4}"#));
        let dead = sim.animals.iter().filter(|a| !a.alive).count();
        assert!(
            dead > 0 && dead < 200,
            "some, not all, rabbits are killed: {dead}"
        );
    }
}
