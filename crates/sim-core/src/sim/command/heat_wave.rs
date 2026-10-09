use super::Simulation;
use crate::sim::world_events::{push_event, HEAT_WAVE_TICKS};

impl Simulation {
    /// A heat wave settles over the land for a while (see `world_events::heat`). Calling it again while
    /// one is on starts the count over. Always lands.
    pub(super) fn cmd_heat_wave(&mut self) -> bool {
        let now = self.tick_count;
        self.weather.heat_until = now + HEAT_WAVE_TICKS;
        push_event(
            &mut self.events,
            now,
            "weather",
            "the sky",
            "a heat wave settles over the land",
        );
        true
    }
}

#[cfg(test)]
mod tests {
    use crate::sim::simulation::Simulation;
    use crate::sim::world_events::tick_heat_wave;
    use crate::world::grid::{HEIGHT, WIDTH};
    use crate::world::tiles::Tile;

    fn grass_world(sim: &mut Simulation) {
        for x in 0..WIDTH as i32 {
            for y in 0..HEIGHT as i32 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
    }

    fn water_pool(sim: &mut Simulation, x0: i32, y0: i32, size: i32) {
        for x in x0..x0 + size {
            for y in y0..y0 + size {
                sim.grid.set(x, y, Tile::Water);
            }
        }
    }

    fn water_count(sim: &Simulation, x0: i32, y0: i32, size: i32) -> usize {
        let mut n = 0;
        for x in x0..x0 + size {
            for y in y0..y0 + size {
                if sim.grid.get(x, y) == Tile::Water {
                    n += 1;
                }
            }
        }
        n
    }

    #[test]
    fn a_heat_wave_lasts_its_length_and_then_breaks() {
        let mut sim = Simulation::new(61);
        sim.tick_count = 500;
        assert!(sim.apply_command_json(r#"{"cmd":"heat_wave"}"#));
        assert!(sim.weather.heat_active(500), "the heat is on as it begins");
        assert!(sim.weather.heat_active(500 + 1799));
        assert!(
            !sim.weather.heat_active(500 + 1800),
            "the heat is over after its length"
        );
        let end = sim.weather.heat_until;
        let mut farms = Vec::new();
        let mut events = std::collections::VecDeque::new();
        tick_heat_wave(
            &mut sim.weather,
            &mut sim.grid,
            &mut farms,
            end,
            &mut events,
            &mut sim.rng,
        );
        assert_eq!(sim.weather.heat_until, 0, "the wave is cleared when it ends");
        assert!(
            events.iter().any(|e| e.detail.contains("heat breaks")),
            "the end of the heat is written into the chronicle"
        );
    }

    #[test]
    fn shore_water_dries_to_sand_during_a_heat_wave_and_deep_water_stays() {
        let mut sim = Simulation::new(62);
        grass_world(&mut sim);
        water_pool(&mut sim, 100, 100, 12);
        let before = water_count(&sim, 100, 100, 12);
        sim.weather.heat_until = 100_000;
        let mut farms = Vec::new();
        let mut events = std::collections::VecDeque::new();
        for k in 1..=300u64 {
            tick_heat_wave(
                &mut sim.weather,
                &mut sim.grid,
                &mut farms,
                k * 60,
                &mut events,
                &mut sim.rng,
            );
        }
        let after = water_count(&sim, 100, 100, 12);
        assert!(after < before, "some shore water dried up ({before} -> {after})");
        assert!(after > 0, "the middle of a wide pool is still water");
        assert!(
            (100..112).any(|x| sim.grid.get(x, 105) == Tile::Sand),
            "dried shore cells become sand"
        );
    }

    #[test]
    fn a_heat_wave_drains_thirst_faster_than_a_mild_day() {
        let thirst_after = |heat: bool| {
            let mut sim = Simulation::new(63);
            grass_world(&mut sim);
            for o in sim.organisms.iter_mut() {
                o.alive = false;
            }
            sim.organisms[0].alive = true;
            sim.organisms[0].x = 200.0;
            sim.organisms[0].y = 200.0;
            sim.organisms[0].hydration = 0.9;
            if heat {
                sim.weather.heat_until = 1_000_000;
            }
            for _ in 0..200 {
                sim.organisms[0].alive = true;
                sim.organisms[0].x = 200.0;
                sim.organisms[0].y = 200.0;
                sim.tick();
            }
            sim.organisms[0].hydration
        };
        assert!(
            thirst_after(true) < thirst_after(false),
            "people in a heat wave are thirstier"
        );
    }
}
