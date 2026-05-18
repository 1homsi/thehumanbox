//! Shared per-action context. Holds a mutable reference to the
//! Simulation plus all the locals that EVERY action needs to know
//! (tile under the org, nearby kin, fire/water/rock adjacency, etc.)
//! so each action file can focus on the actual behaviour without
//! re-deriving these from the world state.
//!
//! Built once per dispatched action via `ActionCtx::new()`. Action
//! files take `&mut ActionCtx` and mutate through `ctx.sim` for the
//! world state and the inline helper methods for thinking / events /
//! discoveries.

use crate::organism::organism::Organism;
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;
use crate::world::grid::WorldGrid;
use crate::world::tiles::Tile;

// Some fields + helpers are only referenced by categories we haven't
// migrated yet. Silence the warnings until the rest of the actions
// land in subsequent commits.
#[allow(dead_code)]
pub struct ActionCtx<'a> {
    pub sim: &'a mut Simulation,
    pub idx: usize,
    pub ix:  i32,
    pub iy:  i32,
    pub tile: Tile,
    pub fidx: usize,
    pub rock_near:  bool,
    pub water_near: bool,
    pub fire_near:  bool,
    pub kin:  Vec<usize>,
    pub near: Vec<usize>,
    pub lid:  String,
    pub tick: u64,
    pub sx:   f32,
    pub sy:   f32,
}

impl<'a> ActionCtx<'a> {
    /// Build the context from the live simulation. Computes the
    /// kin/near vectors and the adjacency flags once so each action
    /// can read them as plain fields. Cost is O(N) over orgs which
    /// is the same as the old inline derivation.
    pub fn new(sim: &'a mut Simulation, idx: usize, ix: i32, iy: i32) -> Self {
        let tick = sim.tick_count;
        let (sx, sy) = (sim.organisms[idx].x, sim.organisms[idx].y);
        let lid  = sim.organisms[idx].lineage_id.clone();
        let tile = sim.grid.get(ix, iy);

        let kin: Vec<usize> = sim.organisms.iter().enumerate()
            .filter(|(i, o)| *i != idx && o.alive && o.lineage_id == lid)
            .filter(|(_, o)| (o.x - sx).abs() + (o.y - sy).abs() <= 6.0)
            .map(|(i, _)| i)
            .collect();
        let near: Vec<usize> = sim.organisms.iter().enumerate()
            .filter(|(i, o)| *i != idx && o.alive)
            .filter(|(_, o)| (o.x - sx).abs() + (o.y - sy).abs() <= 6.0)
            .map(|(i, _)| i)
            .collect();
        let rock_near = [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(1,-1),(-1,1),(1,1)]
            .iter().any(|&(dx,dy)| matches!(sim.grid.get(ix+dx, iy+dy), Tile::Rock | Tile::Mineral));
        let water_near = (-2i32..=2).any(|dx| (-2i32..=2).any(|dy|
            matches!(sim.grid.get(ix+dx, iy+dy), Tile::Water)));
        let fire_near = [(-1,0),(1,0),(0,-1),(0,1)]
            .iter().any(|&(dx,dy)| matches!(sim.grid.get(ix+dx, iy+dy), Tile::Campfire | Tile::Fire));
        let fidx = WorldGrid::idx(ix, iy);

        Self {
            sim, idx, ix, iy, tile, fidx,
            rock_near, water_near, fire_near,
            kin, near, lid, tick, sx, sy,
        }
    }

    // ── Convenience accessors ─────────────────────────────────────

    pub fn org(&self) -> &Organism { &self.sim.organisms[self.idx] }
    pub fn org_mut(&mut self) -> &mut Organism { &mut self.sim.organisms[self.idx] }

    /// Set the org's current thought + push to thought history.
    pub fn think(&mut self, t: &str) {
        let tick = self.tick;
        self.sim.organisms[self.idx].think(t, tick);
    }

    /// Try to unlock a discovery for the org. If newly unlocked,
    /// emit a "build" event with the given message so the chronicle
    /// can pick it up.
    pub fn discover(&mut self, what: &str, msg: &str) {
        let tick = self.tick;
        let nm = self.sim.organisms[self.idx].name.clone();
        if self.sim.organisms[self.idx].discover(what) {
            push_event(&mut self.sim.events, tick, "build", &nm, msg);
        }
    }

    /// Push an event of an arbitrary kind for the current org.
    pub fn event(&mut self, kind: &str, msg: &str) {
        let tick = self.tick;
        let nm = self.sim.organisms[self.idx].name.clone();
        push_event(&mut self.sim.events, tick, kind, &nm, msg);
    }

    /// Consume one unit of any carried building material - stone
    /// before wood. Used by build_X actions that take "any material".
    pub fn consume_material(&mut self) {
        let o = &mut self.sim.organisms[self.idx];
        if      o.inv_stone > 0 { o.inv_stone -= 1; }
        else if o.inv_wood  > 0 { o.inv_wood  -= 1; }
    }

    /// Generic craft helper: unlock a discovery, emit a "first time"
    /// event, return the reward to add. Repeat performances get 30%
    /// of the base reward.
    pub fn craft(&mut self, what: &str, base: f32) -> f32 {
        let tick = self.tick;
        let nm = self.sim.organisms[self.idx].name.clone();
        if self.sim.organisms[self.idx].discover(what) {
            push_event(&mut self.sim.events, tick, "build", &nm,
                       &format!("crafted {} for the first time", what));
            base
        } else {
            base * 0.3
        }
    }

    /// RNG: chance gate. true with probability `p`.
    pub fn chance(&mut self, p: f32) -> bool {
        use rand::Rng;
        self.sim.rng.gen::<f32>() < p
    }

    /// Is the simulated world currently in its night phase?
    pub fn is_night(&self) -> bool {
        self.sim.is_night()
    }
}
