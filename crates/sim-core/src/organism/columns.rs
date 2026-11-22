//! Hot organism fields in parallel arrays.
//!
//! A person is a large struct (memories, trust, names, inventory). The passes
//! that walk everyone only touch a few words of it, so they pull a whole
//! struct through cache to read those words. This store keeps the hot words
//! in contiguous columns. Slot `i` is `organisms[i]`. Ids, names and relations
//! stay on [`Organism`], which is what saves, the UI and mods read.
//!
//! What each hot pass actually reads:
//!
//! | Pass | Reads | Writes |
//! |---|---|---|
//! | Spatial rebuild | `alive`, `x`, `y` | — |
//! | Separation | `alive`, `x`, `y` | `x`, `y` |
//! | Sensing (neighbour scan in perception and setup) | `alive`, `x`, `y`, lineage | — |
//! | Velocity smoothing | `alive`, `x`, `y`, `prev_*`, `vx_smooth`, `vy_smooth` | `prev_*`, `vx_smooth`, `vy_smooth` |
//! | Pairing | `alive`, `x`, `y`, sex, age, partner, plus trust and names | partner, offspring |
//!
//! Pairing stays on the struct. It runs after that person's own step, and the
//! people before them have already aged, moved, partnered or died, so a
//! snapshot taken at the start of the turn would answer a different question
//! than the live struct. Trust and names are cold either way. Needs, sex, age
//! and the flag word are still packed here: the layout is what a later SIMD
//! pass wants, and syncing them is one extra word in the copy the spatial
//! window already pays for.
//!
//! Columns are a cache. [`OrganismColumns::sync_from`] copies them off the
//! structs and marks them ready. Readers use them only while ready. Anything
//! that writes a hot field through the struct clears that mark.

use super::organism::{Organism, Sex};
use crate::intern::Sym;

/// Bit 0 of [`OrganismColumns::flags`].
pub const FLAG_FEMALE: u32 = 1 << 0;
/// Bit 1 of [`OrganismColumns::flags`].
pub const FLAG_PREGNANT: u32 = 1 << 1;
/// Bit 2 of [`OrganismColumns::flags`].
pub const FLAG_PARTNERED: u32 = 1 << 2;
/// Bit 3 of [`OrganismColumns::flags`].
pub const FLAG_ELDER: u32 = 1 << 3;
/// Bit 4 of [`OrganismColumns::flags`].
pub const FLAG_LEADER: u32 = 1 << 4;

/// Borrowed position, life and tribe columns for one neighbour scan.
#[derive(Clone, Copy)]
pub struct NeighbourCols<'a> {
    pub x: &'a [f32],
    pub y: &'a [f32],
    pub alive: &'a [u8],
    pub lineage: &'a [Sym],
}

impl NeighbourCols<'_> {
    #[inline]
    pub fn alive_at(&self, i: usize) -> bool {
        self.alive[i] != 0
    }
}

/// Packed hot fields. Not serialized: the organism struct is the save image.
#[derive(Clone)]
pub struct OrganismColumns {
    ready: bool,
    pub x: Vec<f32>,
    pub y: Vec<f32>,
    pub prev_x: Vec<f32>,
    pub prev_y: Vec<f32>,
    pub vx: Vec<f32>,
    pub vy: Vec<f32>,
    pub energy: Vec<f32>,
    pub hydration: Vec<f32>,
    pub health: Vec<f32>,
    /// `1` living, `0` dead. A byte, not `bool`, so a SIMD load is a lane.
    pub alive: Vec<u8>,
    pub lineage: Vec<Sym>,
    pub age: Vec<u32>,
    /// [`FLAG_FEMALE`], [`FLAG_PREGNANT`], [`FLAG_PARTNERED`], [`FLAG_ELDER`], [`FLAG_LEADER`].
    pub flags: Vec<u32>,
}

impl Default for OrganismColumns {
    fn default() -> Self {
        Self::new()
    }
}

impl OrganismColumns {
    pub fn new() -> Self {
        Self {
            ready: false,
            x: Vec::new(),
            y: Vec::new(),
            prev_x: Vec::new(),
            prev_y: Vec::new(),
            vx: Vec::new(),
            vy: Vec::new(),
            energy: Vec::new(),
            hydration: Vec::new(),
            health: Vec::new(),
            alive: Vec::new(),
            lineage: Vec::new(),
            age: Vec::new(),
            flags: Vec::new(),
        }
    }

    pub fn len(&self) -> usize {
        self.x.len()
    }

    pub fn is_empty(&self) -> bool {
        self.x.is_empty()
    }

    /// Columns match `organisms` and may be read in place of those fields.
    #[inline]
    pub fn ready_for(&self, n: usize) -> bool {
        self.ready && self.x.len() == n
    }

    pub fn invalidate(&mut self) {
        self.ready = false;
    }

    /// Copy hot fields off `organisms`. Slot `i` is `organisms[i]`.
    pub fn sync_from(&mut self, organisms: &[Organism]) {
        let n = organisms.len();
        resize_f32(&mut self.x, n);
        resize_f32(&mut self.y, n);
        resize_f32(&mut self.prev_x, n);
        resize_f32(&mut self.prev_y, n);
        resize_f32(&mut self.vx, n);
        resize_f32(&mut self.vy, n);
        resize_f32(&mut self.energy, n);
        resize_f32(&mut self.hydration, n);
        resize_f32(&mut self.health, n);
        if self.alive.len() != n {
            self.alive.resize(n, 0);
        }
        if self.lineage.len() != n {
            self.lineage.resize(n, Sym::default());
        }
        if self.age.len() != n {
            self.age.resize(n, 0);
        }
        if self.flags.len() != n {
            self.flags.resize(n, 0);
        }
        for (i, o) in organisms.iter().enumerate() {
            self.x[i] = o.x;
            self.y[i] = o.y;
            self.prev_x[i] = o.prev_x;
            self.prev_y[i] = o.prev_y;
            self.vx[i] = o.vx_smooth;
            self.vy[i] = o.vy_smooth;
            self.energy[i] = o.energy;
            self.hydration[i] = o.hydration;
            self.health[i] = o.health;
            self.alive[i] = u8::from(o.alive);
            self.lineage[i] = o.lineage_id;
            self.age[i] = o.age;
            self.flags[i] = flag_word(o);
        }
        self.ready = true;
    }

    pub fn neighbours(&self) -> NeighbourCols<'_> {
        NeighbourCols {
            x: &self.x,
            y: &self.y,
            alive: &self.alive,
            lineage: &self.lineage,
        }
    }

    /// Keep a tribe id current when sense changes it, so later neighbour scans
    /// in the same pass still see the struct.
    pub fn note_lineage(&mut self, i: usize, lineage: Sym) {
        if self.ready && i < self.lineage.len() {
            self.lineage[i] = lineage;
        }
    }

    /// Copy lineages after a bulk change (a tribe forking, a town changing
    /// hands) so neighbour scans still see who belongs where.
    pub fn refresh_lineages(&mut self, organisms: &[Organism]) {
        if !self.ready || self.lineage.len() != organisms.len() {
            return;
        }
        for (i, o) in organisms.iter().enumerate() {
            self.lineage[i] = o.lineage_id;
        }
    }

    /// Write a position the separation pass just applied, on both sides.
    pub fn store_pos(&mut self, i: usize, x: f32, y: f32) {
        if self.ready && i < self.x.len() {
            self.x[i] = x;
            self.y[i] = y;
        }
    }

    /// Smoothed velocity, computed on the motion columns.
    ///
    /// Same arithmetic as the old per-struct loop: one step's displacement,
    /// dropped when it exceeds two tiles, otherwise an exponential moving
    /// average with weight `0.4` on the new step. Dead people are left alone.
    /// The result is written back onto the structs so saves and the frame
    /// still read `prev_*` and `vx_smooth` there.
    pub fn smooth_velocity(&mut self, organisms: &mut [Organism]) {
        const VEL_EMA_ALPHA: f32 = 0.4;
        const MAX_PER_TICK: f32 = 2.0;
        let n = organisms.len();
        resize_f32(&mut self.x, n);
        resize_f32(&mut self.y, n);
        resize_f32(&mut self.prev_x, n);
        resize_f32(&mut self.prev_y, n);
        resize_f32(&mut self.vx, n);
        resize_f32(&mut self.vy, n);
        if self.alive.len() != n {
            self.alive.resize(n, 0);
        }
        for (i, o) in organisms.iter().enumerate() {
            self.x[i] = o.x;
            self.y[i] = o.y;
            self.prev_x[i] = o.prev_x;
            self.prev_y[i] = o.prev_y;
            self.vx[i] = o.vx_smooth;
            self.vy[i] = o.vy_smooth;
            self.alive[i] = u8::from(o.alive);
        }
        // Four lanes on the contiguous motion columns. Dead slots stay put, and
        // the bits match the scalar EMA, including the teleport reset.
        crate::simd::integrate_velocity_columns(
            &self.x,
            &self.y,
            &mut self.prev_x,
            &mut self.prev_y,
            &mut self.vx,
            &mut self.vy,
            &self.alive,
            VEL_EMA_ALPHA,
            MAX_PER_TICK,
        );
        for (i, o) in organisms.iter_mut().enumerate() {
            if self.alive[i] == 0 {
                continue;
            }
            o.prev_x = self.prev_x[i];
            o.prev_y = self.prev_y[i];
            o.vx_smooth = self.vx[i];
            o.vy_smooth = self.vy[i];
        }
        // Needs, age and flags were not refreshed, and later systems move people.
        self.ready = false;
    }
}

pub fn flag_word(o: &Organism) -> u32 {
    let mut flags = 0;
    if o.sex == Sex::Female {
        flags |= FLAG_FEMALE;
    }
    if o.pregnant {
        flags |= FLAG_PREGNANT;
    }
    if o.partner_id.is_some() {
        flags |= FLAG_PARTNERED;
    }
    if o.is_elder {
        flags |= FLAG_ELDER;
    }
    if o.is_leader {
        flags |= FLAG_LEADER;
    }
    flags
}

fn resize_f32(v: &mut Vec<f32>, n: usize) {
    if v.len() != n {
        v.resize(n, 0.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organism::traits::Traits;

    fn person(id: &str, x: f32, y: f32, alive: bool) -> Organism {
        let mut o = Organism::new(
            id,
            "n".into(),
            x,
            y,
            1,
            String::new(),
            "clan",
            9000,
            Traits::default(),
        );
        o.alive = alive;
        o.energy = 0.4;
        o.hydration = 0.5;
        o.health = 0.6;
        o.age = 1200;
        o.sex = Sex::Female;
        o.pregnant = true;
        o.partner_id = Some("mate".into());
        o.is_elder = true;
        o.is_leader = false;
        o.vx_smooth = 0.25;
        o.vy_smooth = -0.5;
        o
    }

    #[test]
    fn sync_copies_hot_fields_and_keeps_the_index() {
        let people = vec![person("a", 3.5, -2.0, true), person("b", 8.0, 9.0, false)];
        let mut cols = OrganismColumns::new();
        assert!(!cols.ready_for(2));
        cols.sync_from(&people);
        assert!(cols.ready_for(2));
        assert_eq!(cols.x[0].to_bits(), 3.5f32.to_bits());
        assert_eq!(cols.y[1].to_bits(), 9.0f32.to_bits());
        assert_eq!(cols.alive, vec![1, 0]);
        assert_eq!(cols.lineage[0], people[0].lineage_id);
        assert_eq!(cols.age[0], 1200);
        assert_eq!(cols.energy[0].to_bits(), 0.4f32.to_bits());
        assert_eq!(cols.hydration[1].to_bits(), 0.5f32.to_bits());
        assert_eq!(cols.health[0].to_bits(), 0.6f32.to_bits());
        assert_eq!(cols.vx[0].to_bits(), 0.25f32.to_bits());
        assert_ne!(cols.flags[0] & FLAG_FEMALE, 0);
        assert_ne!(cols.flags[0] & FLAG_PREGNANT, 0);
        assert_ne!(cols.flags[0] & FLAG_PARTNERED, 0);
        assert_ne!(cols.flags[0] & FLAG_ELDER, 0);
        assert_eq!(cols.flags[0] & FLAG_LEADER, 0);
        assert_eq!(flag_word(&people[0]), cols.flags[0]);
        cols.invalidate();
        assert!(!cols.ready_for(2));
    }

    #[test]
    fn velocity_smoothing_matches_the_scalar_step() {
        let mut people = vec![person("a", 4.0, 7.0, true), person("b", 1.0, 1.0, false)];
        people[0].prev_x = 3.0;
        people[0].prev_y = 7.5;
        people[0].vx_smooth = 1.0;
        people[0].vy_smooth = 1.0;
        people[1].prev_x = 0.0;
        people[1].vx_smooth = 9.0;
        let mut cols = OrganismColumns::new();
        cols.smooth_velocity(&mut people);
        // inst = (1, -0.5); ema = 0.4 * inst + 0.6 * previous.
        assert!((people[0].vx_smooth - (0.4 * 1.0 + 0.6 * 1.0)).abs() < 1e-6);
        assert!((people[0].vy_smooth - (0.4 * -0.5 + 0.6 * 1.0)).abs() < 1e-6);
        assert_eq!(people[0].prev_x, 4.0);
        assert_eq!(people[0].prev_y, 7.0);
        assert_eq!(people[1].vx_smooth, 9.0, "a dead person is not smoothed");
        assert_eq!(people[1].prev_x, 0.0);
        assert!(!cols.ready_for(2));
    }

    #[test]
    fn a_teleport_drops_smoothed_velocity() {
        let mut people = vec![person("a", 20.0, 1.0, true)];
        people[0].prev_x = 1.0;
        people[0].prev_y = 1.0;
        people[0].vx_smooth = 0.5;
        people[0].vy_smooth = 0.5;
        OrganismColumns::new().smooth_velocity(&mut people);
        assert_eq!(people[0].vx_smooth, 0.0);
        assert_eq!(people[0].vy_smooth, 0.0);
        assert_eq!(people[0].prev_x, 20.0);
    }
}
