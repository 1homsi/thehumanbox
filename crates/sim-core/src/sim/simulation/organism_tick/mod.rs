use super::*;

mod act;
mod ageing;
mod bonds;
mod decide;
mod learning;
mod mortality;
mod pairing;
mod routines;
mod setup;
mod threats;
mod vitals;

/// Locals that outlive a single phase of one organism's tick. A phase binds the
/// ones it needs on entry and writes back the ones it changed on exit.
pub(super) struct OrgFrame<'a> {
    pub(super) idx: usize,
    pub(super) population_slots_used: usize,
    pub(super) lineage_counts: &'a FxHashMap<String, usize>,
    pub(super) spatial: &'a SpatialIndex,
    pub(super) animal_spatial: &'a SpatialIndex,
    pub(super) org_idx_by_id: &'a FxHashMap<String, usize>,
    pub(super) lineage_members: &'a mut FxHashMap<String, Vec<usize>>,
    pub(super) spatial_buf: &'a mut Vec<usize>,
    pub(super) available_buf: &'a mut Vec<usize>,
    pub(super) perception_buf: &'a mut Vec<usize>,
    pub(super) action: usize,
    pub(super) action_succeeded: bool,
    pub(super) animal_near: bool,
    pub(super) boredom: f32,
    pub(super) comfort: f32,
    pub(super) current_tile: Tile,
    pub(super) decision_origin: &'static str,
    pub(super) epsilon: f32,
    pub(super) fear_trait: f32,
    pub(super) is_unpartnered_adult: bool,
    pub(super) kin_count_2: usize,
    pub(super) kin_sum: f32,
    pub(super) lineage: String,
    pub(super) loneliness: f32,
    pub(super) movement_reward: f32,
    pub(super) new_thought: Option<String>,
    pub(super) next_perception: String,
    pub(super) night: bool,
    pub(super) ox: f32,
    pub(super) ox_2: f32,
    pub(super) oy: f32,
    pub(super) oy_2: f32,
    pub(super) perception: String,
    pub(super) prev_energy: f32,
    pub(super) prev_hydration: f32,
    pub(super) prev_inv_food: u8,
    pub(super) prev_inv_water: u8,
    pub(super) resilience: f32,
    pub(super) reward: f32,
    pub(super) signal_reward: f32,
    pub(super) storm_build: Option<(usize, Option<String>)>,
    pub(super) tc: u64,
    pub(super) threat_kind: AnimalKind,
    pub(super) wolf_threat: Option<(f32, f32, f32)>,
}

impl Simulation {
    /// One organism's turn. Runs the phases in order, each in its own module:
    /// setup, threats, decide, act, vitals, ageing, bonds, learning, routines,
    /// pairing and mortality. Values that outlive a phase travel in [`OrgFrame`].
    pub(super) fn tick_organism(
        &mut self,
        idx: usize,
        population_slots_used: usize,
        lineage_counts: &FxHashMap<String, usize>,
        spatial: &SpatialIndex,
        animal_spatial: &SpatialIndex,
        buffers: &mut TickBuffers,
        org_idx_by_id: &FxHashMap<String, usize>,
        lineage_members: &mut FxHashMap<String, Vec<usize>>,
    ) {
        let TickBuffers {
            spatial: spatial_buf,
            available_actions: available_buf,
            perception: perception_buf,
        } = buffers;
        let mut f = OrgFrame {
            idx,
            population_slots_used,
            lineage_counts,
            spatial,
            animal_spatial,
            org_idx_by_id,
            lineage_members,
            spatial_buf,
            available_buf,
            perception_buf,
            action: 0,
            action_succeeded: false,
            animal_near: false,
            boredom: 0.0,
            comfort: 0.0,
            current_tile: Tile::Grass,
            decision_origin: "",
            epsilon: 0.0,
            fear_trait: 0.0,
            is_unpartnered_adult: false,
            kin_count_2: 0,
            kin_sum: 0.0,
            lineage: String::new(),
            loneliness: 0.0,
            movement_reward: 0.0,
            new_thought: None,
            next_perception: String::new(),
            night: false,
            ox: 0.0,
            ox_2: 0.0,
            oy: 0.0,
            oy_2: 0.0,
            perception: String::new(),
            prev_energy: 0.0,
            prev_hydration: 0.0,
            prev_inv_food: 0,
            prev_inv_water: 0,
            resilience: 0.0,
            reward: 0.0,
            signal_reward: 0.0,
            storm_build: None,
            tc: 0,
            threat_kind: AnimalKind::Wolf,
            wolf_threat: None,
        };
        self.org_setup(&mut f);
        self.org_threats(&mut f);
        self.org_decide(&mut f);
        self.org_act(&mut f);
        self.org_vitals(&mut f);
        self.org_ageing(&mut f);
        self.org_bonds(&mut f);
        self.org_learning(&mut f);
        self.org_routines(&mut f);
        self.org_pairing(&mut f);
        self.org_mortality(&mut f);
    }
}
