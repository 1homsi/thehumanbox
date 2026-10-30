use super::*;

mod act;
mod ageing;
mod bonds;
mod decide;
mod home_heir;
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
    /// This person's possible actions, worked out before the turns began (see [`PreparedActions`]).
    pub(super) prepared: Option<PreparedActions>,
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
    /// The nearest threat is a summoned wolf: people run for shelter from further off.
    pub(super) threat_summoned: bool,
    /// The nearest summoned wolf within the alarm radius, whatever else is near (see `flight_threat`).
    pub(super) summoned_threat: Option<(f32, f32, f32)>,
}

/// A person's possible actions, worked out on all cores before the turns began, from where they stood then.
pub(super) struct PreparedActions {
    pub(super) at: (i32, i32),
    pub(super) actions: Vec<usize>,
}

impl Simulation {
    /// Every living person's possible actions, worked out on all cores (see `sim::par`) from the world as
    /// the turns begin. A person's turn uses theirs when they still stand where it was worked out.
    pub(super) fn prepare_available_actions(&self, spatial: &SpatialIndex) -> Vec<Option<PreparedActions>> {
        crate::sim::par::map_with(
            self.organisms.len(),
            || Vec::with_capacity(32),
            |nearby, i| {
                let o = &self.organisms[i];
                if !o.alive {
                    return None;
                }
                let at = (o.x as i32, o.y as i32);
                let mut actions = Vec::with_capacity(64);
                crate::sim::actions::available_actions_into(
                    self,
                    i,
                    at.0,
                    at.1,
                    spatial,
                    &mut actions,
                    nearby,
                );
                Some(PreparedActions { at, actions })
            },
        )
    }

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
        prepared: Option<PreparedActions>,
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
            prepared,
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
            threat_summoned: false,
            summoned_threat: None,
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
