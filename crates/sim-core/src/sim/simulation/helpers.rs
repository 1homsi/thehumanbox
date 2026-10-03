use super::*;

pub(super) fn living_lineage_members<'a>(
    organisms: &'a [Organism],
    members: &'a FxHashMap<String, Vec<usize>>,
    lineage_id: &'a str,
) -> impl Iterator<Item = &'a Organism> {
    members
        .get(lineage_id)
        .into_iter()
        .flatten()
        .map(move |&idx| &organisms[idx])
        .filter(move |o| o.alive && o.lineage_id == lineage_id)
}

pub(super) fn lineage_member_index(organisms: &[Organism]) -> FxHashMap<String, Vec<usize>> {
    let mut members = FxHashMap::default();
    for (idx, org) in organisms.iter().enumerate() {
        if org.alive {
            members
                .entry(org.lineage_id.clone())
                .or_insert_with(Vec::new)
                .push(idx);
        }
    }
    members
}

pub(super) struct TickBuffers {
    pub(super) spatial: Vec<usize>,
    pub(super) available_actions: Vec<usize>,
    pub(super) perception: Vec<usize>,
}

impl TickBuffers {
    pub(super) fn new() -> Self {
        Self {
            spatial: Vec::with_capacity(32),
            available_actions: Vec::with_capacity(256),
            perception: Vec::with_capacity(32),
        }
    }
}

pub(super) fn nearby_human_positions(
    organisms: &[Organism],
    spatial: &SpatialIndex,
    x: f32,
    y: f32,
    radius: i32,
    candidates: &mut Vec<usize>,
    positions: &mut Vec<(f32, f32)>,
) {
    positions.clear();
    if radius <= 0 {
        return;
    }
    ordered_human_candidates(spatial, x, y, radius, candidates);
    positions.extend(candidates.iter().filter_map(|&index| {
        let person = &organisms[index];
        person.alive.then_some((person.x, person.y))
    }));
}

pub(super) fn ordered_human_candidates(
    spatial: &SpatialIndex,
    x: f32,
    y: f32,
    radius: i32,
    candidates: &mut Vec<usize>,
) {
    spatial.query_into(x as i32, y as i32, radius, candidates);
    // Encounter rolls and nearest-target ties used population order in the
    // former full scans. Keep that order before applying exact distances.
    candidates.sort_unstable();
}

pub(super) fn fallback_walkable_step(
    grid: &WorldGrid,
    ix: i32,
    iy: i32,
    requested_action: usize,
    fear: f32,
    health: f32,
) -> Option<(i32, i32)> {
    let (rdx, rdy) = DIRECTIONS[requested_action];
    let mut best: Option<(i32, i32)> = None;
    let mut best_score = f32::NEG_INFINITY;
    for &(dx, dy) in &DIRECTIONS {
        let nx = ix + dx;
        let ny = iy + dy;
        let tile = grid.get(nx, ny);
        // Fire is `walkable()` but burns and drains the organism, so treat it
        // as a non-destination here as well. Scoring in `toward` already
        // penalises it, but scoring is advisory: when every neighbour scores
        // `-inf` it falls through to direction 0, which may be fire. This is
        // the choke point every move passes through, so the invariant holds
        // no matter which caller chose the action.
        if !tile.walkable() || tile == Tile::Fire {
            continue;
        }
        let alignment = (dx * rdx + dy * rdy) as f32;
        let mut score = alignment * 10.0;
        if tile == Tile::Water {
            let depth = grid.depth_at(nx, ny);
            if depth > 0.18 {
                score -= 40.0;
            } else {
                score -= 4.0 + depth * 8.0;
            }
        }
        let hazard = grid.hazard_at(nx, ny);
        if hazard > 0.0 {
            let cautiousness = 0.7 + fear * 0.8 + (1.0 - health).max(0.0) * 0.5;
            score -= hazard * 14.0 * cautiousness;
        }
        if score > best_score {
            best_score = score;
            best = Some((nx, ny));
        }
    }
    best
}

pub(super) fn safe_flee_target(
    grid: &WorldGrid,
    ox: f32,
    oy: f32,
    away_dx: f32,
    away_dy: f32,
    flee_dist: f32,
) -> (i32, i32) {
    let raw_tx = ((ox + away_dx * flee_dist).round() as i32).clamp(5, WIDTH as i32 - 5);
    let raw_ty = ((oy + away_dy * flee_dist).round() as i32).clamp(5, HEIGHT as i32 - 5);
    let start = (ox as i32, oy as i32);
    let mut best = (raw_tx, raw_ty);
    let mut best_score = f32::NEG_INFINITY;

    for radius in [0i32, 4, 8, 14] {
        for dx in -radius..=radius {
            for dy in -radius..=radius {
                if radius > 0 && dx.abs() != radius && dy.abs() != radius {
                    continue;
                }
                let tx = (raw_tx + dx).clamp(5, WIDTH as i32 - 5);
                let ty = (raw_ty + dy).clamp(5, HEIGHT as i32 - 5);
                let tile = grid.get(tx, ty);
                // Never nominate fire as somewhere to flee *to*. The hazard
                // term below already penalises it, but a fire tile is the
                // worst possible destination when the point of the search is
                // to escape, and the movement executor now refuses it anyway
                // — so choosing it just burns the flee on an unreachable
                // target.
                if !tile.walkable() || tile == Tile::Fire {
                    continue;
                }
                let progress =
                    ((tx - start.0) as f32 * away_dx + (ty - start.1) as f32 * away_dy) / flee_dist.max(1.0);
                let mut score = progress * 10.0;
                score -= ((tx - raw_tx).abs() + (ty - raw_ty).abs()) as f32 * 0.12;
                if tile == Tile::Water {
                    score -= 5.0 + grid.depth_at(tx, ty) * 12.0;
                }
                score -= grid.hazard_at(tx, ty) * 18.0;
                if score > best_score {
                    best_score = score;
                    best = (tx, ty);
                }
            }
        }
        if best_score.is_finite()
            && grid.hazard_at(best.0, best.1) < 0.40
            && grid.get(best.0, best.1) != Tile::Water
        {
            break;
        }
    }

    best
}

pub(super) fn movement_step_feedback(
    grid: &WorldGrid,
    ix: i32,
    iy: i32,
    requested_action: usize,
    destination: Option<(i32, i32)>,
) -> f32 {
    let (dx, dy) = DIRECTIONS[requested_action];
    let requested = (ix + dx, iy + dy);
    let requested_tile = grid.get(requested.0, requested.1);
    let Some((mx, my)) = destination else {
        return -0.018;
    };

    let mut feedback = 0.001;
    // Fire is walkable but is not a legal destination, so asking for it is
    // the same kind of blocked request as asking for a wall. Keeping this in
    // step with the executor's rule matters: otherwise the learner is neither
    // rewarded nor penalised for choosing flames.
    if !requested_tile.walkable() || requested_tile == Tile::Fire {
        feedback -= 0.006;
    }
    if (mx, my) != requested {
        feedback -= 0.002;
    }

    let moved_tile = grid.get(mx, my);
    if moved_tile == Tile::Water {
        let depth = grid.depth_at(mx, my);
        feedback -= 0.003 + depth * 0.012;
    }
    let hazard = grid.hazard_at(mx, my);
    if hazard > 0.0 {
        feedback -= hazard * 0.025;
    }

    feedback
}

pub(super) fn movement_momentum_feedback(
    org: &Organism,
    grid: &WorldGrid,
    from: (i32, i32),
    destination: Option<(i32, i32)>,
) -> f32 {
    let Some((mx, my)) = destination else {
        return 0.0;
    };
    let step = ((mx - from.0) as f32, (my - from.1) as f32);
    let step_len = (step.0 * step.0 + step.1 * step.1).sqrt();
    let prior_len = (org.vx_smooth * org.vx_smooth + org.vy_smooth * org.vy_smooth).sqrt();
    if step_len < 0.5 || prior_len < 0.15 {
        return 0.0;
    }

    let dot = (step.0 * org.vx_smooth + step.1 * org.vy_smooth) / (step_len * prior_len);
    if dot >= -0.55 {
        return 0.0;
    }

    let urgent = org.energy < 0.32 || org.hydration < 0.32 || org.health < 0.45;
    let escaping_danger = org.fear_level > 0.55
        || grid.hazard_at(from.0, from.1) > 0.35
        || grid.hazard_at(mx, my) + 0.10 < grid.hazard_at(from.0, from.1);
    if urgent || escaping_danger {
        return 0.0;
    }

    -0.006 * (1.0 - org.traits.curiosity * 0.35).clamp(0.65, 1.0)
}

pub(super) fn urgent_resource_progress_feedback(
    org: &Organism,
    from: (i32, i32),
    destination: Option<(i32, i32)>,
) -> f32 {
    let Some(to) = destination else {
        let hunger_urgency = (0.50 - org.energy).max(0.0) / 0.50;
        let thirst_urgency = (0.50 - org.hydration).max(0.0) / 0.50;
        return -0.004 * hunger_urgency.max(thirst_urgency).min(1.0);
    };

    let mut feedback = 0.0f32;
    let mut score_target = |target: Option<(i32, i32)>, urgency: f32| {
        let Some((tx, ty)) = target else {
            return;
        };
        let urgency = urgency.clamp(0.0, 1.0);
        if urgency <= 0.0 {
            return;
        }
        let before = (tx - from.0).abs() + (ty - from.1).abs();
        let after = (tx - to.0).abs() + (ty - to.1).abs();
        if before == 0 {
            return;
        }
        let delta = before - after;
        if delta > 0 {
            feedback += (delta as f32 / before as f32).min(0.25) * 0.018 * urgency;
        } else if delta < 0 {
            feedback -= ((-delta) as f32 / before as f32).min(0.25) * 0.012 * urgency;
        }
    };

    let hunger_urgency = (0.50 - org.energy) / 0.50;
    if hunger_urgency > 0.0 {
        let target = Organism::best_remembered_with_danger(
            &org.food_memory,
            from.0 as f32,
            from.1 as f32,
            &org.danger_memory,
            hunger_urgency,
        );
        score_target(target, hunger_urgency);
    }

    let thirst_urgency = (0.50 - org.hydration) / 0.50;
    if thirst_urgency > 0.0 {
        let target = Organism::best_remembered_with_danger(
            &org.water_memory,
            from.0 as f32,
            from.1 as f32,
            &org.danger_memory,
            thirst_urgency,
        );
        score_target(target, thirst_urgency);
    }

    feedback
}

pub(super) fn reserve_inventory_feedback(
    prev_energy: f32,
    prev_hydration: f32,
    prev_food: u8,
    prev_water: u8,
    org: &Organism,
) -> f32 {
    let food_gain = org.inv_food.saturating_sub(prev_food) as f32;
    let water_gain = org.inv_water.saturating_sub(prev_water) as f32;
    let mut feedback = 0.0f32;

    if food_gain > 0.0 && prev_food < 3 {
        let future_hunger = ((0.80 - prev_energy) / 0.80).clamp(0.15, 1.0);
        let room_factor = (3 - prev_food).min(food_gain as u8) as f32;
        feedback += 0.006 * future_hunger * room_factor;
    }

    if water_gain > 0.0 && prev_water < 4 {
        let future_thirst = ((0.85 - prev_hydration) / 0.85).clamp(0.15, 1.0);
        let room_factor = (4 - prev_water).min(water_gain as u8) as f32;
        feedback += 0.005 * future_thirst * room_factor;
    }

    feedback
}

pub(super) fn use_needed_reserves(org: &mut Organism, tick: u64) -> (bool, bool) {
    let urgent_water = org.hydration < 0.24;
    let periodic_water = org.hydration < 0.55 && tick.is_multiple_of(8);
    let used_water = if org.inv_water > 0 && (urgent_water || periodic_water) {
        org.inv_water -= 1;
        org.hydration = (org.hydration + 0.18).min(1.0);
        true
    } else {
        false
    };

    let urgent_food = org.energy < 0.28;
    let periodic_food = org.energy < 0.45 && tick.is_multiple_of(6);
    let needs_food = urgent_food || periodic_food;
    let used_food = if org.inv_food > 0 && needs_food {
        org.inv_food -= 1;
        org.energy = (org.energy + 0.30).min(1.0);
        true
    } else if needs_food {
        let stored = org.tools.get("winter_provisions").copied().unwrap_or(0);
        if stored == 0 {
            false
        } else {
            if stored == 1 {
                org.tools.remove("winter_provisions");
            } else {
                org.tools.insert("winter_provisions".into(), stored - 1);
            }
            org.energy = (org.energy + 0.30).min(1.0);
            true
        }
    } else {
        false
    };

    (used_food, used_water)
}

pub(super) fn resource_near(grid: &WorldGrid, x: i32, y: i32, tile: Tile) -> bool {
    (-1i32..=1).any(|dx| (-1i32..=1).any(|dy| grid.get(x + dx, y + dy) == tile))
}

/// Weaken what an organism remembers about the nine tiles around it and drop
/// every memory that has faded below the floor. One walk over the map does
/// both: the nine lookups it replaces cost more than the sweep they preceded.
pub(super) fn decay_local_resource_memory(
    memory: &mut FxHashMap<(i32, i32), f32>,
    x: i32,
    y: i32,
    exact_factor: f32,
    nearby_factor: f32,
) {
    if memory.is_empty() {
        return;
    }
    memory.retain(|&(kx, ky), v| {
        let (dx, dy) = (kx - x, ky - y);
        if dx.abs() <= 1 && dy.abs() <= 1 {
            *v *= if dx == 0 && dy == 0 {
                exact_factor
            } else {
                nearby_factor
            };
        }
        *v >= 0.04
    });
}

/// The nine-lookup version this replaced, kept to check the single walk against.
#[cfg(test)]
pub(super) fn decay_local_resource_memory_reference(
    memory: &mut FxHashMap<(i32, i32), f32>,
    x: i32,
    y: i32,
    exact_factor: f32,
    nearby_factor: f32,
) {
    for dx in -1i32..=1 {
        for dy in -1i32..=1 {
            let key = (x + dx, y + dy);
            if let Some(v) = memory.get_mut(&key) {
                *v *= if dx == 0 && dy == 0 {
                    exact_factor
                } else {
                    nearby_factor
                };
            }
        }
    }
    memory.retain(|_, v| *v >= 0.04);
}

/// The people `SpatialIndex::ordered_nearby` would yield that `keep` accepts,
/// as population indices in population order, written into a reused buffer.
/// Filtering before the sort gives the same list as sorting first, and the
/// sort only has to order the few that qualify.
pub(super) fn ordered_nearby_filtered(
    organisms: &[Organism],
    spatial: &SpatialIndex,
    x: f32,
    y: f32,
    radius: i32,
    buf: &mut Vec<usize>,
    mut keep: impl FnMut(usize, &Organism) -> bool,
) {
    // `ordered_nearby` pads the radius by one tick of movement.
    spatial.query_into(x as i32, y as i32, radius + 2, buf);
    buf.retain(|&i| keep(i, &organisms[i]));
    buf.sort_unstable();
}

pub(super) fn verify_local_resource_memory(org: &mut Organism, grid: &WorldGrid, x: i32, y: i32) {
    let tile = grid.get(x, y);
    if tile == Tile::Water {
        let ms = org.traits.memory_strength;
        Organism::remember(&mut org.water_memory, x, y, 0.2, ms);
    } else if !resource_near(grid, x, y, Tile::Water) {
        decay_local_resource_memory(&mut org.water_memory, x, y, 0.45, 0.70);
    }

    if tile == Tile::Food {
        let ms = org.traits.memory_strength;
        Organism::remember(&mut org.food_memory, x, y, 0.2, ms);
    } else if !resource_near(grid, x, y, Tile::Food) {
        decay_local_resource_memory(&mut org.food_memory, x, y, 0.45, 0.70);
    }
}

pub(super) fn local_danger_present(
    grid: &WorldGrid,
    animals: &[Animal],
    animal_spatial: &SpatialIndex,
    candidates: &mut Vec<usize>,
    x: i32,
    y: i32,
) -> bool {
    let terrain_danger = (-1i32..=1).any(|dx| {
        (-1i32..=1).any(|dy| {
            let nx = x + dx;
            let ny = y + dy;
            matches!(grid.get(nx, ny), Tile::Fire) || grid.hazard_at(nx, ny) >= 0.35
        })
    });
    if terrain_danger {
        return true;
    }

    // Animals do not move until tick_animals, after every human acts. The
    // index may still contain animals killed earlier in this tick, so keep
    // the live check at read time.
    animal_spatial.query_into(x, y, 5, candidates);
    candidates.iter().any(|&index| {
        let animal = &animals[index];
        animal.alive
            && animal.kind.hostile()
            && !animal.sleeping
            && (animal.x - x as f32).abs() + (animal.y - y as f32).abs() <= 5.0
    })
}

pub(super) fn verify_local_danger_memory(
    org: &mut Organism,
    grid: &WorldGrid,
    animals: &[Animal],
    animal_spatial: &SpatialIndex,
    candidates: &mut Vec<usize>,
    x: i32,
    y: i32,
) {
    if local_danger_present(grid, animals, animal_spatial, candidates, x, y) {
        let current_hazard = grid.hazard_at(x, y);
        if current_hazard >= 0.35 || matches!(grid.get(x, y), Tile::Fire) {
            let ms = org.traits.memory_strength;
            Organism::remember(&mut org.danger_memory, x, y, 0.20 + current_hazard * 0.40, ms);
        }
        return;
    }

    decay_local_resource_memory(&mut org.danger_memory, x, y, 0.50, 0.72);
}

pub(super) fn scarcity_driven_migration_season(season: &str) -> bool {
    matches!(season, "scarcity" | "decline")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organism::traits::Traits;

    struct Lcg(u64);
    impl Lcg {
        fn next(&mut self) -> u64 {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            self.0
        }
    }

    fn snapshot(memory: &FxHashMap<(i32, i32), f32>) -> Vec<((i32, i32), u32)> {
        // Iteration order is part of the state: later code walks these maps.
        memory.iter().map(|(&k, &v)| (k, v.to_bits())).collect()
    }

    /// Memories around a standing point: some on it, some beside it, some
    /// far away, with strengths on both sides of the 0.04 floor.
    fn memory_around(rng: &mut Lcg, x: i32, y: i32, n: usize) -> FxHashMap<(i32, i32), f32> {
        let mut memory = FxHashMap::default();
        for _ in 0..n {
            let (dx, dy) = match rng.next() % 4 {
                0 => ((rng.next() % 3) as i32 - 1, (rng.next() % 3) as i32 - 1),
                1 => ((rng.next() % 7) as i32 - 3, (rng.next() % 7) as i32 - 3),
                _ => ((rng.next() % 61) as i32 - 30, (rng.next() % 61) as i32 - 30),
            };
            let strength = match rng.next() % 5 {
                0 => 0.01 + (rng.next() % 40) as f32 * 0.001,
                1 => 0.04,
                2 => 0.05 + (rng.next() % 10) as f32 * 0.001,
                _ => (rng.next() % 1000) as f32 / 1000.0,
            };
            memory.insert((x + dx, y + dy), strength);
        }
        memory
    }

    #[test]
    fn local_memory_decay_matches_the_lookup_version() {
        let mut rng = Lcg(0x9E37_79B9_7F4A_7C15);
        let mut changed = 0;
        for round in 0..4_000 {
            let (x, y) = ((rng.next() % 300) as i32, (rng.next() % 300) as i32);
            let n = (rng.next() % 40) as usize;
            let mut fast = memory_around(&mut rng, x, y, n);
            if round % 17 == 0 {
                fast.insert((x, y), f32::NAN);
            }
            let mut reference = fast.clone();
            let before = snapshot(&fast);
            let (exact, nearby) = if round % 2 == 0 {
                (0.45, 0.70)
            } else {
                (0.50, 0.72)
            };
            // Decay the same map a few times, standing in different places,
            // as an organism walking about does.
            for step in 0..3 {
                let (sx, sy) = (x + step - 1, y + (step % 2));
                decay_local_resource_memory(&mut fast, sx, sy, exact, nearby);
                decay_local_resource_memory_reference(&mut reference, sx, sy, exact, nearby);
                assert_eq!(snapshot(&fast), snapshot(&reference), "round {round} step {step}");
            }
            changed += usize::from(snapshot(&fast) != before);
        }
        assert!(changed > 1_000, "the maps barely changed: {changed}");
    }

    fn crowd(seed: u64, n: usize) -> Vec<Organism> {
        let mut rng = Lcg(seed.wrapping_mul(0x2545_F491_4F6C_DD1D) | 1);
        (0..n)
            .map(|i| {
                let lineage = ["lineage-a", "lineage-b"][(rng.next() % 2) as usize];
                let x = 10.0 + (rng.next() % 300) as f32 / 10.0;
                let y = 10.0 + (rng.next() % 300) as f32 / 10.0;
                let mut o = Organism::new(
                    format!("id-{i}"),
                    format!("Name{i}"),
                    x,
                    y,
                    0,
                    String::new(),
                    lineage.to_string(),
                    5000,
                    Traits::default(),
                );
                o.energy = (rng.next() % 5) as f32 * 0.1;
                o.alive = !rng.next().is_multiple_of(9);
                o
            })
            .collect()
    }

    #[test]
    fn filtered_neighbour_list_matches_ordered_nearby() {
        let mut checked = 0;
        for seed in 1..=30u64 {
            let organisms = crowd(seed, 90);
            let spatial = SpatialIndex::build(&organisms, 10);
            let mut buf = Vec::new();
            for (idx, me) in organisms.iter().enumerate() {
                for radius in [3, 4, 6] {
                    let (sx, sy) = (me.x, me.y);
                    let pass = |i: usize, o: &Organism| {
                        i != idx
                            && o.alive
                            && o.lineage_id == me.lineage_id
                            && o.energy < 0.30
                            && (o.x - sx).abs() + (o.y - sy).abs() < 2.5 + radius as f32
                    };
                    let expected: Vec<usize> = spatial
                        .ordered_nearby(&organisms, sx, sy, radius)
                        .filter(|(i, o)| pass(*i, o))
                        .map(|(i, _)| i)
                        .collect();
                    ordered_nearby_filtered(&organisms, &spatial, sx, sy, radius, &mut buf, pass);
                    assert_eq!(buf, expected, "seed {seed} idx {idx} radius {radius}");
                    checked += expected.len();
                }
            }
        }
        assert!(checked > 1_000, "too few neighbours to mean anything: {checked}");
    }
}
