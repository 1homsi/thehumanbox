use crate::organism::organism::Organism;
use crate::sim::simulation::Simulation;
use crate::sim::spatial::SpatialIndex;
use crate::sim::world_events::push_event;
use crate::world::grid::WorldGrid;
use crate::world::tiles::Tile;

#[allow(dead_code)]
pub struct ActionCtx<'a> {
    pub sim: &'a mut Simulation,
    pub idx: usize,
    pub ix: i32,
    pub iy: i32,
    pub tile: Tile,
    pub fidx: usize,
    pub rock_near: bool,
    pub water_near: bool,
    pub fire_near: bool,
    pub kin: Vec<usize>,
    pub near: Vec<usize>,
    pub lid: String,
    pub tick: u64,
    pub sx: f32,
    pub sy: f32,
}

impl<'a> ActionCtx<'a> {
    pub fn new(sim: &'a mut Simulation, idx: usize, ix: i32, iy: i32, spatial: &SpatialIndex) -> Self {
        let tick = sim.tick_count;
        let (sx, sy) = (sim.organisms[idx].x, sim.organisms[idx].y);
        let lid = sim.organisms[idx].lineage_id.clone();
        let tile = sim.grid.get(ix, iy);

        // Use the per-tick spatial index instead of scanning the full
        // organism list. The previous O(N) double-scan was the heaviest
        // bit of work in try_apply when populations grow.
        let mut cand: Vec<usize> = Vec::with_capacity(16);
        spatial.query_into(sx as i32, sy as i32, 6, &mut cand);
        let mut near: Vec<usize> = Vec::with_capacity(cand.len());
        let mut kin: Vec<usize> = Vec::with_capacity(cand.len() / 2);
        for &i in &cand {
            if i == idx {
                continue;
            }
            let o = &sim.organisms[i];
            if !o.alive {
                continue;
            }
            if (o.x - sx).abs() + (o.y - sy).abs() > 6.0 {
                continue;
            }
            near.push(i);
            if o.lineage_id == lid {
                kin.push(i);
            }
        }
        let rock_near = [
            (-1, 0),
            (1, 0),
            (0, -1),
            (0, 1),
            (-1, -1),
            (1, -1),
            (-1, 1),
            (1, 1),
        ]
        .iter()
        .any(|&(dx, dy)| matches!(sim.grid.get(ix + dx, iy + dy), Tile::Rock | Tile::Mineral));
        let water_near =
            (-2i32..=2).any(|dx| (-2i32..=2).any(|dy| matches!(sim.grid.get(ix + dx, iy + dy), Tile::Water)));
        let fire_near = [(-1, 0), (1, 0), (0, -1), (0, 1)]
            .iter()
            .any(|&(dx, dy)| matches!(sim.grid.get(ix + dx, iy + dy), Tile::Campfire | Tile::Fire));
        let fidx = WorldGrid::idx(ix, iy);

        Self {
            sim,
            idx,
            ix,
            iy,
            tile,
            fidx,
            rock_near,
            water_near,
            fire_near,
            kin,
            near,
            lid,
            tick,
            sx,
            sy,
        }
    }

    pub fn org(&self) -> &Organism {
        &self.sim.organisms[self.idx]
    }
    pub fn org_mut(&mut self) -> &mut Organism {
        &mut self.sim.organisms[self.idx]
    }

    pub fn think(&mut self, t: &str) {
        let tick = self.tick;
        self.sim.organisms[self.idx].think(t, tick);
    }

    pub fn discover(&mut self, what: &str, msg: &str) {
        let tick = self.tick;
        let nm = self.sim.organisms[self.idx].name.clone();
        if self.sim.organisms[self.idx].discover(what) {
            push_event(&mut self.sim.events, tick, "build", &nm, msg);
        }
    }

    pub fn event(&mut self, kind: &str, msg: &str) {
        let tick = self.tick;
        let nm = self.sim.organisms[self.idx].name.clone();
        push_event(&mut self.sim.events, tick, kind, &nm, msg);
        if kind == "life" || kind == "build" {
            self.sim.organisms[self.idx].log_life(tick, kind, msg.to_string());
        }
    }

    pub fn consume_material(&mut self) {
        let o = &mut self.sim.organisms[self.idx];
        if o.inv_stone > 0 {
            o.inv_stone -= 1;
        } else if o.inv_wood > 0 {
            o.inv_wood -= 1;
        }
    }

    pub fn craft(&mut self, what: &str, base: f32) -> f32 {
        let tick = self.tick;
        let nm = self.sim.organisms[self.idx].name.clone();
        if self.sim.organisms[self.idx].discover(what) {
            push_event(
                &mut self.sim.events,
                tick,
                "build",
                &nm,
                &format!("crafted {} for the first time", what),
            );
            base
        } else {
            base * 0.3
        }
    }

    pub fn chance(&mut self, p: f32) -> bool {
        use rand::Rng;
        self.sim.rng.random::<f32>() < p
    }

    pub fn is_night(&self) -> bool {
        self.sim.is_night()
    }

    pub fn good(&self, key: &str) -> u8 {
        self.org().tools.get(key).copied().unwrap_or(0)
    }

    pub fn add_good(&mut self, key: &str, n: u8) {
        let cur = self.good(key);
        let next = (cur as u32 + n as u32).min(8) as u8;
        self.org_mut().tools.insert(key.into(), next);
    }

    pub fn take_good(&mut self, key: &str, n: u8) -> bool {
        let cur = self.good(key);
        if cur < n {
            return false;
        }
        let next = cur - n;
        if next == 0 {
            self.org_mut().tools.remove(key);
        } else {
            self.org_mut().tools.insert(key.into(), next);
        }
        true
    }

    pub fn comfort_kin(&mut self, amount: f32) -> usize {
        let kin = self.kin.clone();
        let mut n = 0;
        for &i in &kin {
            let o = &mut self.sim.organisms[i];
            if !o.alive {
                continue;
            }
            o.comfort = (o.comfort + amount).min(1.0);
            n += 1;
        }
        n
    }

    pub fn energize_kin(&mut self, amount: f32) -> usize {
        let kin = self.kin.clone();
        let mut n = 0;
        for &i in &kin {
            let o = &mut self.sim.organisms[i];
            if !o.alive {
                continue;
            }
            o.energy = (o.energy + amount).min(1.0);
            n += 1;
        }
        n
    }

    pub fn literacy_kin(&mut self, amount: f32) -> usize {
        let kin = self.kin.clone();
        let mut n = 0;
        for &i in &kin {
            let o = &mut self.sim.organisms[i];
            if !o.alive {
                continue;
            }
            o.literacy = (o.literacy + amount).min(1.0);
            n += 1;
        }
        n
    }

    pub fn add_literacy(&mut self, amount: f32) {
        let o = self.org_mut();
        o.literacy = (o.literacy + amount).min(1.0);
    }

    pub fn add_comfort(&mut self, amount: f32) {
        let o = self.org_mut();
        o.comfort = (o.comfort + amount).min(1.0);
    }

    pub fn add_piety(&mut self, amount: f32) {
        let o = self.org_mut();
        o.piety = (o.piety + amount).min(1.0);
    }

    pub fn add_energy(&mut self, amount: f32) {
        let o = self.org_mut();
        o.energy = (o.energy + amount).min(1.0);
    }

    pub fn add_wealth(&mut self, n: u32) {
        let o = self.org_mut();
        o.wealth = o.wealth.saturating_add(n);
    }
}

/// Declarative spec for the canonical "build a thing on the current
/// tile" action shape. Most of the construction/ folder followed this
/// shape with cut-and-paste boilerplate; the helper below turns each
/// action into a single declarative call.
///
/// All fields default to "off" / zero so callers only fill what they
/// need. The result of `ActionCtx::build_one` is the reward to return
/// from the action `apply` function.
#[derive(Default)]
pub struct BuildSpec<'a> {
    /// Skip unless `ctx.water_near` is true.
    pub need_water_near: bool,
    /// Skip unless the organism has ≥1 stone. Consumed on success.
    pub need_stone: bool,
    /// Skip unless the organism has ≥1 wood. Consumed on success.
    pub need_wood: bool,
    /// Skip unless the organism has ≥1 stone OR ≥1 wood. The cheaper
    /// "consume_material" rule applies (stone first, then wood).
    pub need_either_material: bool,
    /// How much structural integrity to add at (ix, iy).
    pub structure_add: f32,
    /// If true, registers (ix, iy) as an active structure tile.
    pub mark_active: bool,
    /// Optional trail to leave at (ix, iy).
    pub trail: Option<(crate::world::grid::TrailKind, f32)>,
    /// Thought to record on success.
    pub thought: &'a str,
    /// Discovery key + event message; passed to `ctx.discover`.
    pub discovery: &'a str,
    pub event_msg: &'a str,
    /// Reward returned from the action on success.
    pub reward: f32,
}

impl<'a> ActionCtx<'a> {
    /// Apply a canonical build action. Returns `spec.reward` on
    /// success, `0.0` if any guard fails. The caller's `apply` fn
    /// just needs `ctx.build_one(BuildSpec { … })`.
    pub fn build_one(&mut self, spec: BuildSpec) -> f32 {
        if matches!(self.tile, Tile::Water | Tile::Flooded | Tile::Void) {
            return 0.0;
        }
        if spec.need_water_near && !self.water_near {
            return 0.0;
        }
        if spec.need_stone && self.sim.organisms[self.idx].inv_stone == 0 {
            return 0.0;
        }
        if spec.need_wood && self.sim.organisms[self.idx].inv_wood == 0 {
            return 0.0;
        }
        if spec.need_either_material
            && self.sim.organisms[self.idx].inv_stone == 0
            && self.sim.organisms[self.idx].inv_wood == 0
        {
            return 0.0;
        }
        // Consume resources up-front so a guard failure later doesn't
        // half-pay.
        if spec.need_stone {
            self.sim.organisms[self.idx].inv_stone -= 1;
        }
        if spec.need_wood {
            self.sim.organisms[self.idx].inv_wood -= 1;
        }
        if spec.need_either_material {
            self.consume_material();
        }
        let (ix, iy) = (self.ix, self.iy);
        if spec.structure_add > 0.0 {
            self.sim.grid.add_structure(ix, iy, spec.structure_add);
        }
        if spec.mark_active {
            self.sim.active_structure_tiles.insert((ix, iy));
        }
        if let Some((kind, strength)) = spec.trail {
            self.sim.grid.leave_trail(ix, iy, kind, strength);
        }
        if !spec.thought.is_empty() {
            self.think(spec.thought);
        }
        if !spec.discovery.is_empty() {
            self.discover(spec.discovery, spec.event_msg);
        }
        spec.reward
    }
}
