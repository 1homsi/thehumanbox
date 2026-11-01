use super::*;

mod act;
mod ageing;
mod bonds;
mod decide;
pub(super) use decide::Choice;
mod home_heir;
mod learning;
mod mortality;
mod pairing;
mod routines;
mod setup;
mod threats;
mod vitals;

/// What a person sensed at the start of their turn (setup and threats), carried to the choosing, which runs
/// for everyone at once, and back into their turn.
pub(super) struct Sensed {
    pub(super) idx: usize,
    pub(super) epsilon: f32,
    pub(super) night: bool,
    pub(super) prev_energy: f32,
    pub(super) prev_hydration: f32,
    pub(super) prev_inv_food: u8,
    pub(super) prev_inv_water: u8,
    pub(super) animal_near: bool,
    pub(super) fear_trait: f32,
    pub(super) ox: f32,
    pub(super) oy: f32,
    pub(super) perception: String,
    pub(super) storm_build: Option<(usize, Option<String>)>,
    pub(super) threat_kind: AnimalKind,
    pub(super) wolf_threat: Option<(f32, f32, f32)>,
    pub(super) threat_summoned: bool,
    pub(super) summoned_threat: Option<(f32, f32, f32)>,
}

impl OrgFrame<'_> {
    fn take_sensed(&mut self) -> Sensed {
        Sensed {
            idx: self.idx,
            epsilon: self.epsilon,
            night: self.night,
            prev_energy: self.prev_energy,
            prev_hydration: self.prev_hydration,
            prev_inv_food: self.prev_inv_food,
            prev_inv_water: self.prev_inv_water,
            animal_near: self.animal_near,
            fear_trait: self.fear_trait,
            ox: self.ox,
            oy: self.oy,
            perception: std::mem::take(&mut self.perception),
            storm_build: self.storm_build.take(),
            threat_kind: self.threat_kind,
            wolf_threat: self.wolf_threat,
            threat_summoned: self.threat_summoned,
            summoned_threat: self.summoned_threat,
        }
    }

    /// What the person sensed, as it stands in their turn.
    fn sensed_copy(&self) -> Sensed {
        Sensed {
            idx: self.idx,
            epsilon: self.epsilon,
            night: self.night,
            prev_energy: self.prev_energy,
            prev_hydration: self.prev_hydration,
            prev_inv_food: self.prev_inv_food,
            prev_inv_water: self.prev_inv_water,
            animal_near: self.animal_near,
            fear_trait: self.fear_trait,
            ox: self.ox,
            oy: self.oy,
            perception: self.perception.clone(),
            storm_build: self.storm_build.clone(),
            threat_kind: self.threat_kind,
            wolf_threat: self.wolf_threat,
            threat_summoned: self.threat_summoned,
            summoned_threat: self.summoned_threat,
        }
    }

    fn put_sensed(&mut self, s: Sensed) {
        self.epsilon = s.epsilon;
        self.night = s.night;
        self.prev_energy = s.prev_energy;
        self.prev_hydration = s.prev_hydration;
        self.prev_inv_food = s.prev_inv_food;
        self.prev_inv_water = s.prev_inv_water;
        self.animal_near = s.animal_near;
        self.fear_trait = s.fear_trait;
        self.ox = s.ox;
        self.oy = s.oy;
        self.perception = s.perception;
        self.storm_build = s.storm_build;
        self.threat_kind = s.threat_kind;
        self.wolf_threat = s.wolf_threat;
        self.threat_summoned = s.threat_summoned;
        self.summoned_threat = s.summoned_threat;
    }
}

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
    pub(super) prev_health: f32,
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

/// The shared values of one person's turn, with every per-phase local at its starting value.
#[allow(clippy::too_many_arguments)]
fn new_frame<'a>(
    idx: usize,
    population_slots_used: usize,
    lineage_counts: &'a FxHashMap<String, usize>,
    spatial: &'a SpatialIndex,
    animal_spatial: &'a SpatialIndex,
    buffers: &'a mut TickBuffers,
    org_idx_by_id: &'a FxHashMap<String, usize>,
    lineage_members: &'a mut FxHashMap<String, Vec<usize>>,
) -> OrgFrame<'a> {
    let TickBuffers {
        spatial: spatial_buf,
        available_actions: available_buf,
        perception: perception_buf,
    } = buffers;
    OrgFrame {
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
        prev_health: 0.0,
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
    }
}

/// The shared, read-only part of a tick that every person's turn looks at.
pub(super) struct TurnContext<'a> {
    pub(super) lineage_counts: &'a FxHashMap<String, usize>,
    pub(super) spatial: &'a SpatialIndex,
    pub(super) animal_spatial: &'a SpatialIndex,
    pub(super) org_idx_by_id: &'a FxHashMap<String, usize>,
}

impl Simulation {
    /// The first part of a person's turn, run in order for everyone before anyone chooses: setup (their
    /// inner state, territory and grudges) and threats (what they perceive and what they flee).
    pub(super) fn org_sense(
        &mut self,
        idx: usize,
        population_slots_used: usize,
        cx: &TurnContext<'_>,
        buffers: &mut TickBuffers,
        lineage_members: &mut FxHashMap<String, Vec<usize>>,
    ) -> Sensed {
        let mut f = new_frame(
            idx,
            population_slots_used,
            cx.lineage_counts,
            cx.spatial,
            cx.animal_spatial,
            buffers,
            cx.org_idx_by_id,
            lineage_members,
        );
        self.org_setup(&mut f);
        self.org_threats(&mut f);
        let sensed = f.take_sensed();
        self.org_ready_to_choose(&sensed);
        sensed
    }

    /// Everyone's choice, on all cores (see `sim::par`), from the world as the choosing begins. Each
    /// person draws on their own random numbers (see [`decide::choice_rng`]), so the choices do not
    /// depend on how the work is split.
    pub(super) fn choose_all(
        &self,
        sensed: &[Option<Sensed>],
        spatial: &SpatialIndex,
        tick_seed: u64,
    ) -> Vec<Option<Choice>> {
        crate::sim::par::map_with(
            sensed.len(),
            || (Vec::with_capacity(256), Vec::with_capacity(32)),
            |(available, nearby), i| {
                let s = sensed[i].as_ref()?;
                Some(self.org_choose(
                    s,
                    spatial,
                    available,
                    nearby,
                    decide::choice_rng(tick_seed, s.idx),
                ))
            },
        )
    }

    /// The rest of a person's turn, in order: their choice counts, then act, vitals, ageing, bonds,
    /// learning, routines, pairing and mortality. Values that outlive a phase travel in [`OrgFrame`].
    #[allow(clippy::too_many_arguments)]
    pub(super) fn org_turn(
        &mut self,
        sensed: Sensed,
        choice: Choice,
        population_slots_used: usize,
        cx: &TurnContext<'_>,
        buffers: &mut TickBuffers,
        lineage_members: &mut FxHashMap<String, Vec<usize>>,
    ) {
        let mut f = new_frame(
            sensed.idx,
            population_slots_used,
            cx.lineage_counts,
            cx.spatial,
            cx.animal_spatial,
            buffers,
            cx.org_idx_by_id,
            lineage_members,
        );
        f.put_sensed(sensed);
        // Others may have acted since sensing. Attribute only health changes
        // during this person's own turn to their decision.
        f.prev_health = self.organisms[f.idx].health;
        self.org_apply_choice(&mut f, choice);
        self.org_act(&mut f);
        self.org_vitals(&mut f);
        self.org_ageing(&mut f);
        self.org_bonds(&mut f);
        self.org_learning(&mut f);
        self.org_routines(&mut f);
        self.org_pairing(&mut f);
        self.org_mortality(&mut f);
    }

    /// One person's whole turn on its own: sense, choose and act. The tick runs these parts for everyone
    /// in three passes instead (see `Simulation::tick`); this is for tests of a single turn.
    #[cfg(test)]
    #[allow(clippy::too_many_arguments)]
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
        let cx = TurnContext {
            lineage_counts,
            spatial,
            animal_spatial,
            org_idx_by_id,
        };
        let sensed = self.org_sense(idx, population_slots_used, &cx, buffers, lineage_members);
        let rng = decide::choice_rng(self.rng.random(), idx);
        let choice = {
            let TickBuffers {
                spatial: nearby,
                available_actions: available,
                ..
            } = &mut *buffers;
            self.org_choose(&sensed, spatial, available, nearby, rng)
        };
        self.org_turn(
            sensed,
            choice,
            population_slots_used,
            &cx,
            buffers,
            lineage_members,
        );
    }
}
