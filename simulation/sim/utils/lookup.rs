//! Nearest-X lookups against the live world.

use crate::sim::simulation::Simulation;

impl Simulation {
    /// Lineage id of the nearest living organism to a point (Manhattan
    /// distance). Used for territory + scouting heuristics where we
    /// want to know "whose ground is this".
    pub(crate) fn nearest_lineage_at(&self, x: i32, y: i32) -> Option<String> {
        self.organisms.iter()
            .filter(|o| o.alive)
            .min_by(|a, b| {
                let da = (a.x - x as f32).abs() + (a.y - y as f32).abs();
                let db = (b.x - x as f32).abs() + (b.y - y as f32).abs();
                da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
            })
            .map(|o| o.lineage_id.clone())
    }
}
