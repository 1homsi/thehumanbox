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
    pub(super) dormant: bool,
    pub(super) strangers_near: bool,
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
            dormant: false,
            strangers_near: false,
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
            dormant: false,
            strangers_near: false,
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

pub(in crate::sim::simulation) struct DormantPlan {
    at: (f32, f32),
    neighbours: Option<(Vec<usize>, Vec<usize>)>,
    feeds_kin: Option<bool>,
}

pub(crate) struct PendingLearn {
    idx: usize,
    perception: String,
    action: usize,
    reward: f32,
    succeeded: bool,
    terminal: bool,
    night: bool,
    animal_near: bool,
}

const LOD_EVERY: u64 = 16;

const LORE_EVERY: u64 = 60;

const LORE_CHANCE_PERCENT: u64 = 20;

const LORE_ROOM: usize = 48;

const LORE: &[&str] = &[
    "fire",
    "shelter",
    "hunt",
    "woodcutting",
    "cooking",
    "foraging",
    "language",
    "farm",
    "agriculture",
    "writing",
    "fishing",
    "pottery",
    "smelting",
    "weaving",
    "barter",
    "currency",
    "animal_hides",
    "axe",
    "borders",
    "cartography",
    "food_preservation",
    "forestry",
    "herbalism",
    "knife",
    "leatherwork",
    "masonry",
    "ritual",
    "ritual_dance",
    "salt_harvesting",
    "spear",
    "star_charts",
    "stone_tools",
    "territory",
    "textiles",
    "tool_making",
    "torch",
    "trap",
    "medicine",
];

const COMMAND_FOCUS_REACH: i32 = 24;

const BATTLE_FOCUS_REACH: i32 = 20;

const HOLD: usize = usize::MAX;

const CHALLENGE_COOLDOWN: u64 = 80;

const DORMANT_CHALLENGE_PER_MILLE: u64 = 4;

impl Simulation {
    pub(super) fn lod_awake(
        &self,
        animal_spatial: &SpatialIndex,
        buf: &mut Vec<usize>,
    ) -> (Vec<bool>, Vec<bool>) {
        let storm = self.weather.kind >= 2;
        let mut strangers = vec![false; self.organisms.len()];
        let riders: crate::hashing::FxHashSet<&str> = self
            .vehicles
            .iter()
            .flat_map(|v| v.occupants.iter().map(String::as_str))
            .collect();
        let mut tribes_by_cell: crate::hashing::FxHashMap<(i32, i32), (&str, bool)> = Default::default();
        for o in self.organisms.iter().filter(|o| o.alive) {
            let cell = ((o.x as i32).div_euclid(10), (o.y as i32).div_euclid(10));
            let entry = tribes_by_cell
                .entry(cell)
                .or_insert((o.lineage_id.as_str(), false));
            if entry.0 != o.lineage_id.as_str() {
                entry.1 = true;
            }
        }
        let awake = self
            .organisms
            .iter()
            .enumerate()
            .map(|(i, o)| {
                if !o.alive {
                    return false;
                }
                if storm
                    || (self.tick_count + i as u64).is_multiple_of(LOD_EVERY)
                    || o.energy < 0.40
                    || o.hydration < 0.35
                    || o.health < 0.6
                    || o.infection > 0.3
                    || o.water_ticks > 0
                    || o.mounted_vehicle.is_some()
                    || riders.contains(o.id.as_str())
                    || o.last_action.is_none()
                {
                    return true;
                }
                let (x, y) = (o.x as i32, o.y as i32);
                if self
                    .focus_points
                    .iter()
                    .any(|&(fx, fy, _)| (fx - x).abs().max((fy - y).abs()) <= COMMAND_FOCUS_REACH)
                    || self.battles.iter().any(|b| {
                        b.ended_tick.is_none()
                            && (b.location.0 - x).abs().max((b.location.1 - y).abs()) <= BATTLE_FOCUS_REACH
                    })
                {
                    return true;
                }
                animal_spatial.query_into(x, y, 12, buf);
                if buf.iter().any(|&a| {
                    let a = &self.animals[a];
                    a.alive && a.kind.hostile() && (a.x - o.x).abs() + (a.y - o.y).abs() <= 14.0
                }) {
                    return true;
                }
                strangers[i] = (-1..=1).any(|dy| {
                    (-1..=1).any(|dx| {
                        tribes_by_cell
                            .get(&(x.div_euclid(10) + dx, y.div_euclid(10) + dy))
                            .is_some_and(|&(first, mixed)| mixed || first != o.lineage_id.as_str())
                    })
                });
                false
            })
            .collect();
        (awake, strangers)
    }

    pub(super) fn lineage_lore(&mut self, awake: &[bool]) {
        if !self.tick_count.is_multiple_of(LORE_EVERY) {
            return;
        }
        let mut lore: std::collections::BTreeMap<String, std::collections::BTreeSet<String>> =
            std::collections::BTreeMap::new();
        let mut near: std::collections::BTreeMap<(i32, i32), std::collections::BTreeSet<String>> =
            std::collections::BTreeMap::new();
        for o in self.organisms.iter().filter(|o| o.alive) {
            let core = || {
                o.discoveries
                    .iter()
                    .filter(|d| LORE.contains(&d.as_str()))
                    .cloned()
            };
            lore.entry(o.lineage_id.clone()).or_default().extend(core());
            near.entry(((o.x as i32).div_euclid(10), (o.y as i32).div_euclid(10)))
                .or_default()
                .extend(core());
        }
        let tick = self.tick_count;
        for (i, o) in self.organisms.iter_mut().enumerate() {
            if !o.alive || awake.get(i).copied().unwrap_or(true) {
                continue;
            }
            let (cx, cy) = ((o.x as i32).div_euclid(10), (o.y as i32).div_euclid(10));
            let mut known: std::collections::BTreeSet<&String> =
                lore.get(&o.lineage_id).into_iter().flatten().collect();
            for dy in -1..=1 {
                for dx in -1..=1 {
                    known.extend(near.get(&(cx + dx, cy + dy)).into_iter().flatten());
                }
            }
            for d in known {
                if o.discoveries.len() >= LORE_ROOM {
                    break;
                }
                if o.discoveries.contains(d.as_str()) {
                    continue;
                }
                let roll = d
                    .bytes()
                    .chain(tick.to_le_bytes())
                    .chain((i as u64).to_le_bytes())
                    .fold(0xcbf2_9ce4_8422_2325u64, |h, b| {
                        (h ^ u64::from(b)).wrapping_mul(0x0000_0100_0000_01b3)
                    });
                if roll % 100 < LORE_CHANCE_PERCENT {
                    o.discover(d);
                }
            }
        }
    }

    pub(super) fn dormant_sensed(&self, idx: usize, strangers_near: bool) -> Sensed {
        let o = &self.organisms[idx];
        Sensed {
            idx,
            epsilon: 0.0,
            night: self.is_night(),
            prev_energy: o.energy,
            prev_hydration: o.hydration,
            prev_inv_food: o.inv_food,
            prev_inv_water: o.inv_water,
            animal_near: false,
            fear_trait: o.traits.fear,
            ox: o.x,
            oy: o.y,
            perception: String::new(),
            storm_build: None,
            threat_kind: AnimalKind::Wolf,
            wolf_threat: None,
            threat_summoned: false,
            summoned_threat: None,
            dormant: true,
            strangers_near,
        }
    }

    pub(super) fn dormant_choice(
        &self,
        s: &Sensed,
        rng: decide::ChoiceRng,
        spatial: &SpatialIndex,
        buf: &mut Vec<usize>,
    ) -> Choice {
        let o = &self.organisms[s.idx];
        let action = match o.last_action.map(usize::from) {
            Some(a) if a >= 8 => a,
            _ => {
                let goal = {
                    let route = o.route.borrow();
                    (route.next < route.steps.len()).then_some(route.goal)
                };
                let here = (o.x as i32, o.y as i32);
                match goal.filter(|&t| t != here && o.wander_target == Some(t)) {
                    Some(target) => o.toward(target, &self.grid),
                    None if self.is_night() => 17,
                    None => HOLD,
                }
            }
        };
        let tick = self.tick_count;
        let plan = DormantPlan {
            at: (o.x, o.y),
            neighbours: (action >= 26 && action != HOLD)
                .then(|| crate::sim::actions::ctx::near_and_kin(&self.organisms, s.idx, spatial)),
            feeds_kin: (o.energy > 0.82 && tick - o.last_fed_kin >= 180)
                .then(|| social::pick_food_recipient(s.idx, &self.organisms, spatial, tick, buf).is_some()),
        };
        Choice {
            action,
            thought: None,
            origin: "dormant",
            at: (o.x as i32, o.y as i32),
            rng,
            flight: None,
            plan: Some(plan),
        }
    }

    pub(super) fn perceive_all(
        &self,
        spatial: &SpatialIndex,
        animal_spatial: &SpatialIndex,
        awake: &[bool],
    ) -> Vec<Option<String>> {
        let night = self.is_night();
        crate::sim::par::map_with(
            self.organisms.len(),
            || (Vec::with_capacity(32), Vec::with_capacity(32)),
            |(perception_buf, animal_buf), i| {
                let org = &self.organisms[i];
                if !org.alive || !awake[i] {
                    return None;
                }
                let (ox, oy) = (org.x, org.y);
                animal_spatial.query_into(ox as i32, oy as i32, 8, animal_buf);
                let animal_near = animal_buf.iter().any(|&a| {
                    let a = &self.animals[a];
                    a.alive && (a.x - ox).abs() + (a.y - oy).abs() <= 8.0
                });
                Some(org.perceive_into(
                    &self.grid,
                    &self.organisms,
                    night,
                    animal_near,
                    spatial,
                    perception_buf,
                ))
            },
        )
    }

    pub(super) fn dormant_upkeep(
        &mut self,
        dormant: &[bool],
        spatial: &SpatialIndex,
        animal_spatial: &SpatialIndex,
    ) {
        let neighbours: Vec<(f32, f32, f32, bool)> = self
            .organisms
            .iter()
            .map(|o| (o.x, o.y, o.infection, o.alive))
            .collect();
        let climate = self.climate(self.is_night());
        let tick = self.tick_count;
        let grid = &self.grid;
        let animals = &self.animals;
        let outcomes = crate::sim::par::map_mut(
            &mut self.organisms[..dormant.len()],
            || (Vec::with_capacity(32), Vec::with_capacity(32)),
            |(animal_buf, spatial_buf), i, o| {
                if !dormant[i] || !o.alive {
                    return (false, false);
                }
                let (cx, cy) = (o.x as i32, o.y as i32);
                let tile = grid.get(cx, cy);
                verify_local_resource_memory(o, grid, cx, cy);
                verify_local_danger_memory(o, grid, animals, animal_spatial, animal_buf, cx, cy);
                let shelter = vitals::shelter_strength(grid, cx, cy);
                vitals::shelter_comfort(o, shelter, || upkeep_roll(tick, i));
                vitals::drain_and_eat(o, grid, &climate, cx, cy, shelter);
                let in_water = tile == Tile::Water;
                if !in_water {
                    o.water_ticks = 0;
                }
                vitals::weather_and_sickness(o, grid, &climate, cx, cy, shelter);
                vitals::ritual_comfort(o, grid, climate.night);
                let mut fell_sick = false;
                if o.infection < 0.8 {
                    spatial.query_into(cx, cy, 2, spatial_buf);
                    let caught = vitals::caught_infection(o, i, spatial_buf, |j| neighbours[j]);
                    fell_sick = vitals::set_infection(o, caught);
                }
                ageing::body_ageing(o, tile == Tile::Fire, tick);
                (in_water, fell_sick)
            },
        );
        for (i, (in_water, fell_sick)) in outcomes.into_iter().enumerate() {
            if fell_sick {
                self.history.sickness_events += 1;
            }
            if in_water {
                let (x, y) = (self.organisms[i].x as i32, self.organisms[i].y as i32);
                self.apply_water_fatigue(i, x, y);
            }
        }
    }

    pub(super) fn learn_from_the_tick(&mut self, spatial: &SpatialIndex) {
        let pending = std::mem::take(&mut self.pending_learning);
        let sim = &*self;
        let best = crate::sim::par::map_with(
            pending.len(),
            || (Vec::with_capacity(32), Vec::with_capacity(32)),
            |(perception_buf, spatial_buf), k| {
                let p = &pending[k];
                if p.terminal {
                    return 0.0;
                }
                let org = &sim.organisms[p.idx];
                let next = org.perceive_into(
                    &sim.grid,
                    &sim.organisms,
                    p.night,
                    p.animal_near,
                    spatial,
                    perception_buf,
                );
                org.q_table.get(&next).map_or(0.0, |row| {
                    crate::sim::actions::best_next_q(
                        sim,
                        p.idx,
                        org.x as i32,
                        org.y as i32,
                        spatial,
                        spatial_buf,
                        row,
                    )
                })
            },
        );
        for (p, best_next) in pending.into_iter().zip(best) {
            self.organisms[p.idx].learn_from_best_next(
                &p.perception,
                p.action,
                p.reward,
                best_next,
                Some(p.succeeded),
                p.terminal,
            );
        }
    }
}

fn upkeep_roll(tick: u64, idx: usize) -> f32 {
    let mut z = tick.wrapping_mul(0x9E37_79B9_7F4A_7C15) ^ (idx as u64).wrapping_add(0xD1B5_4A32_D192_ED03);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^= z >> 31;
    (z >> 40) as f32 / (1u64 << 24) as f32
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
    pub(super) dormant: bool,
    pub(super) kin_count_2: usize,
    pub(super) kin_sum: f32,
    pub(super) lineage: String,
    pub(super) loneliness: f32,
    pub(super) movement_reward: f32,
    pub(super) new_thought: Option<String>,
    pub(super) night: bool,
    pub(super) ox: f32,
    pub(super) ox_2: f32,
    pub(super) oy: f32,
    pub(super) oy_2: f32,
    pub(super) perception: String,
    pub(super) pre_perception: Option<String>,
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
    pub(super) plan: Option<DormantPlan>,
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
        perception: perception_buf,
        ..
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
        dormant: false,
        kin_count_2: 0,
        kin_sum: 0.0,
        lineage: String::new(),
        loneliness: 0.0,
        movement_reward: 0.0,
        new_thought: None,
        night: false,
        ox: 0.0,
        ox_2: 0.0,
        oy: 0.0,
        oy_2: 0.0,
        perception: String::new(),
        pre_perception: None,
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
        plan: None,
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
        perception: Option<String>,
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
        f.pre_perception = perception;
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
        let people = crate::organism::people_index::PeopleIndex::build(&self.organisms);
        crate::sim::par::map_with(
            sensed.len(),
            || (Vec::with_capacity(256), Vec::with_capacity(32)),
            |(available, nearby), i| {
                let s = sensed[i].as_ref()?;
                if s.dormant {
                    return Some(self.dormant_choice(
                        s,
                        decide::choice_rng(tick_seed, s.idx),
                        spatial,
                        nearby,
                    ));
                }
                Some(self.org_choose(
                    s,
                    spatial,
                    available,
                    nearby,
                    decide::choice_rng(tick_seed, s.idx),
                    people.as_ref(),
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
        mut choice: Choice,
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
        let sensed_dormant = sensed.dormant;
        let sensed_strangers = sensed.strangers_near;
        f.dormant = sensed_dormant;
        f.put_sensed(sensed);
        // Others may have acted since sensing. Attribute only health changes
        // during this person's own turn to their decision.
        f.prev_health = self.organisms[f.idx].health;
        // Health below zero is a death already dealt (a meteor, a lightning strike, a bomb): it goes
        // straight to mortality, before a hurt clamped to zero and a little rest could undo it.
        if self.organisms[f.idx].health < 0.0 {
            self.org_mortality(&mut f);
            return;
        }
        let dormant = sensed_dormant;
        let f_holds = choice.action == HOLD;
        f.plan = choice.plan.take();
        if !f_holds {
            self.org_apply_choice(&mut f, choice);
            self.org_act(&mut f);
        }
        self.org_vitals(&mut f);
        if dormant {
            let tick = self.tick_count;
            let roll = (tick ^ (f.idx as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15))
                .wrapping_mul(0xBF58_476D_1CE4_E5B9)
                >> 32;
            if sensed_strangers
                && tick.saturating_sub(self.organisms[f.idx].last_challenged) >= CHALLENGE_COOLDOWN
                && roll % 1000 < DORMANT_CHALLENGE_PER_MILLE
            {
                crate::sim::agents::social::challenge_stranger(
                    f.idx,
                    &mut self.organisms,
                    f.spatial,
                    tick,
                    &mut self.events,
                    &mut self.history,
                );
            }
            self.org_routines(&mut f);
            self.org_pairing(&mut f);
            self.org_mortality(&mut f);
            return;
        }
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
        let sensed = self.org_sense(idx, population_slots_used, &cx, buffers, lineage_members, None);
        let rng = decide::choice_rng(self.rng.random(), idx);
        let choice = {
            let mut available = Vec::new();
            self.org_choose(&sensed, spatial, &mut available, &mut buffers.spatial, rng, None)
        };
        self.org_turn(
            sensed,
            choice,
            population_slots_used,
            &cx,
            buffers,
            lineage_members,
        );
        self.learn_from_the_tick(spatial);
    }
}
