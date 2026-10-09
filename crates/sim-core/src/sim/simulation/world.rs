use super::*;

impl Simulation {
    pub fn is_night(&self) -> bool {
        (self.tick_count % DAY_LENGTH) >= (DAY_LENGTH as f64 * 0.7) as u64
    }

    pub fn season(&self) -> &'static str {
        SEASONS[(self.tick_count / SEASON_LENGTH) as usize % 4]
    }

    pub fn season_progress(&self) -> f32 {
        (self.tick_count % SEASON_LENGTH) as f32 / SEASON_LENGTH as f32
    }

    pub fn era(&self, lineage_id: &str) -> crate::sim::era::Era {
        self.lineage_eras
            .get(lineage_id)
            .copied()
            .unwrap_or(crate::sim::era::Era::PreStone)
    }

    pub(super) fn tick_water_depletion(&mut self) {
        const OVERDRINK_THRESHOLD: u32 = 200;
        const KEEP_FRACTION: f32 = 0.6;
        if self.water_use.is_empty() {
            return;
        }
        let snapshot: Vec<((i32, i32), u32)> = self
            .water_use
            .iter()
            .filter(|(_, n)| **n >= OVERDRINK_THRESHOLD)
            .map(|(k, v)| (*k, *v))
            .collect();
        for ((cx, cy), _n) in snapshot {
            if self.grid.get(cx, cy) != Tile::Water {
                continue;
            }
            let mut water_neighbours = 0;
            for &(dx, dy) in &[(-1, 0), (1, 0), (0, -1), (0, 1)] {
                if self.grid.get(cx + dx, cy + dy) == Tile::Water {
                    water_neighbours += 1
                }
            }
            if water_neighbours <= 1 {
                self.grid.set(cx, cy, Tile::Sand);
                self.water_use.swap_remove(&(cx, cy));
                push_event(
                    &mut self.events,
                    self.tick_count,
                    "drought",
                    "world",
                    &format!("a pond at ({},{}) dried out from overuse", cx, cy),
                );
            }
        }
        for n in self.water_use.values_mut() {
            *n = ((*n as f32) * KEEP_FRACTION) as u32;
        }
        self.water_use.retain(|_, n| *n > 0);
    }
}
