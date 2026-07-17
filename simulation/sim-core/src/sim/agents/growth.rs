use crate::organism::attributes::{
    assign_birth_attributes, check_earned_attributes, inherit_attributes_from_parents,
};
use crate::organism::organism::{apply_sex_traits, generate_name, Organism, Sex};
use crate::organism::traits::Traits;
use crate::organism::vocabulary::Vocabulary;
use crate::sim::config::natural_lineage_limit;
use crate::sim::simulation::{Event, History};
use crate::sim::world_events::push_event;
use crate::world::{
    grid::WorldGrid,
    tiles::{Biome, Tile},
};
use rand::Rng;
use uuid::Uuid;

pub fn spawn_organism_with_home(
    grid: &WorldGrid,
    organisms: &mut Vec<Organism>,
    x: f32,
    y: f32,
    home_x: f32,
    home_y: f32,
    lineage_id: String,
    rng: &mut impl Rng,
) {
    let id = Uuid::new_v4().to_string()[..8].to_string();
    let sex = Sex::random(rng);
    let mut traits = Traits::random(rng);
    apply_sex_traits(&mut traits, sex);
    let max_age = rng.random_range(
        (9000.0 + 4000.0 * traits.resilience) as u32..=(14000.0 + 6000.0 * traits.resilience) as u32,
    );

    let mut org = Organism::new(
        id.clone(),
        generate_name(rng, sex),
        x,
        y,
        0,
        String::new(),
        lineage_id,
        max_age,
        traits,
    );
    org.home_x = home_x;
    org.home_y = home_y;
    org.sex = sex;
    let stagger_tick = rng.random_range(0..crate::sim::cosmos::YEAR_LENGTH_TICKS);
    org.birth_tick = stagger_tick;
    org.zodiac = crate::sim::cosmos::ZodiacSign::from_birth_tick(stagger_tick)
        .label()
        .to_string();
    org.vocabulary = Vocabulary::generate(rng);
    org.discoveries.insert("foraging".to_string());
    assign_birth_attributes(&mut org, rng);
    check_earned_attributes(&mut org);

    let ix = x as i32;
    let iy = y as i32;
    for dx in -6i32..=6 {
        for dy in -6i32..=6 {
            let (nx, ny) = (ix + dx, iy + dy);
            match grid.get(nx, ny) {
                Tile::Water => {
                    Organism::remember(&mut org.water_memory, nx, ny, 0.9, org.traits.memory_strength)
                }
                Tile::Food => {
                    Organism::remember(&mut org.food_memory, nx, ny, 0.5, org.traits.memory_strength)
                }
                _ => {}
            }
        }
    }
    organisms.push(org);
}

#[allow(clippy::if_same_then_else)]
pub fn try_reproduce(
    org_idx: usize,
    organisms: &mut Vec<Organism>,
    grid: &WorldGrid,
    tick: u64,
    events: &mut std::collections::VecDeque<Event>,
    rng: &mut impl Rng,
    alive_count: usize,
    population_limit: usize,
    lineage_counts: &rustc_hash::FxHashMap<String, usize>,
) {
    if alive_count >= population_limit {
        return;
    }

    let org = &organisms[org_idx];
    if org.sex != Sex::Female {
        return;
    }

    let lineage_limit = natural_lineage_limit(population_limit);
    if lineage_counts.get(&org.lineage_id).copied().unwrap_or(0) >= lineage_limit {
        return;
    }

    let critical = alive_count < 30;
    let low_pop = alive_count < 80;
    let (e_min, h_min, hp_min, cooldown, partner_dist) = if critical {
        (0.18, 0.18, 0.22, 350u64, 200.0f32)
    } else if low_pop {
        (0.28, 0.28, 0.32, 500u64, 100.0f32)
    } else {
        (0.40, 0.40, 0.43, 1300u64, 40.0f32)
    };

    if !(org.energy > e_min && org.hydration > h_min && org.health > hp_min && org.age > 1000) {
        return;
    }
    if tick - org.last_reproduced < cooldown {
        return;
    }
    if !critical && org.infection > 0.30 {
        return;
    }

    let (org_x, org_y) = (org.x, org.y);
    let partner_id: String = if critical {
        let nearest = organisms
            .iter()
            .filter(|o| {
                o.alive
                    && o.sex == Sex::Male
                    && o.age > 1000
                    && (o.x - org_x).hypot(o.y - org_y) < partner_dist
            })
            .min_by(|a, b| {
                let da = (a.x - org_x).hypot(a.y - org_y);
                let db = (b.x - org_x).hypot(b.y - org_y);
                da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
            });
        match nearest {
            Some(o) => o.id.clone(),
            None => return,
        }
    } else {
        let Some(pid) = org.partner_id.clone() else { return };
        let bonded_nearby = organisms.iter().any(|o| {
            o.alive && o.id == pid && o.sex == Sex::Male && (o.x - org_x).hypot(o.y - org_y) < partner_dist
        });
        if !bonded_nearby {
            return;
        }
        pid
    };

    let biome = grid.biome_at(org_x as i32, org_y as i32);
    let biome_mult = match biome {
        Biome::Volcanic => 0.25,
        Biome::Tundra => 0.40,
        Biome::Desert => 0.55,
        Biome::Grassland => 1.00,
        Biome::Wetland => 1.20,
        Biome::Forest => 1.30,
    };

    let local_fert = {
        let cx = org_x as i32;
        let cy = org_y as i32;
        let mut sum = 0.0f32;
        let mut n = 0u32;
        for dx in -3i32..=3 {
            for dy in -3i32..=3 {
                if WorldGrid::in_bounds(cx + dx, cy + dy) {
                    sum += grid.fertility_at(cx + dx, cy + dy);
                    n += 1;
                }
            }
        }
        if n > 0 {
            sum / n as f32
        } else {
            0.5
        }
    };
    let land_mult = 0.4 + local_fert * 1.2;

    let social = org.traits.social_tendency;
    let fertility_prob = (0.30 + social * 0.50) * biome_mult * land_mult;
    if rng.random::<f32>() > fertility_prob.clamp(0.20, 0.95) {
        return;
    }

    let spawn_pos = find_spawn_near(grid, org.x as i32, org.y as i32, rng);
    let Some((sx, sy)) = spawn_pos else {
        return;
    };

    let father_traits = organisms
        .iter()
        .find(|o| o.id == partner_id)
        .map(|o| o.traits.clone())
        .unwrap_or_else(|| organisms[org_idx].traits.clone());
    let child_traits = organisms[org_idx].traits.mix(&father_traits, rng).mutate(rng);

    let child_sex = Sex::random(rng);
    let mut child_traits_sexed = child_traits;
    apply_sex_traits(&mut child_traits_sexed, child_sex);

    let max_age = rng.random_range(
        (8000.0 + 4000.0 * child_traits_sexed.resilience) as u32
            ..=(18000.0 + 8000.0 * child_traits_sexed.resilience) as u32,
    );

    let child_id = Uuid::new_v4().to_string()[..8].to_string();
    let mut child_name = generate_name(rng, child_sex);
    let mut namesake: Option<String> = None;
    if rng.random::<f32>() < 0.15 {
        let dead_kin: Vec<String> = organisms
            .iter()
            .filter(|o| {
                !o.alive
                    && o.lineage_id == organisms[org_idx].lineage_id
                    && o.sex == child_sex
                    && !o.name.is_empty()
            })
            .map(|o| o.name.clone())
            .collect();
        if !dead_kin.is_empty() {
            let pick = dead_kin[rng.random_range(0..dead_kin.len())].clone();
            namesake = Some(pick.clone());
            child_name = pick;
        }
    }
    let child_name = child_name;
    let parent_id = organisms[org_idx].id.clone();
    let lineage_id = organisms[org_idx].lineage_id.clone();
    let generation = organisms[org_idx].generation + 1;

    let mut child = Organism::new(
        child_id.clone(),
        child_name.clone(),
        sx as f32,
        sy as f32,
        generation,
        parent_id,
        lineage_id,
        max_age,
        child_traits_sexed,
    );
    child.sex = child_sex;
    child.birth_tick = tick;
    child.zodiac = crate::sim::cosmos::ZodiacSign::from_birth_tick(tick)
        .label()
        .to_string();
    child.vocabulary = Vocabulary::inherit_from(&organisms[org_idx].vocabulary, rng);

    {
        use crate::organism::memory::{MemoryEntry, MemoryKind};
        let mother_name = organisms[org_idx].name.clone();
        let heirloom = organisms[org_idx]
            .memories
            .top(4)
            .into_iter()
            .find(|m| !matches!(m.kind, MemoryKind::Core | MemoryKind::Dream))
            .map(|m| (m.kind, m.text.clone(), m.emotion));
        if let Some((kind, text, emotion)) = heirloom {
            let lower = text.trim_end_matches('.').to_lowercase();
            let retold = format!("my mother {} carried — {}", mother_name, lower);
            let inherit_kind = match kind {
                MemoryKind::Bond => MemoryKind::Bond,
                _ => MemoryKind::Fact,
            };
            let entry = MemoryEntry::new(inherit_kind, retold, tick)
                .with_salience(0.70)
                .with_emotion((emotion as i32 / 2).clamp(-2, 2) as i8);
            child.memories.insert(entry);
        }
        let biome_text = match biome {
            Biome::Forest => "I was born under the trees of the forest",
            Biome::Grassland => "I was born on the open grasslands",
            Biome::Wetland => "I was born by the wet land where the reeds grow",
            Biome::Desert => "I was born in the dry land where the sun burns",
            Biome::Tundra => "I was born where the cold lives in the ground",
            Biome::Volcanic => "I was born on the burning land",
        };
        child.memories.insert(
            MemoryEntry::new(MemoryKind::Place, biome_text, tick)
                .with_salience(0.85)
                .with_emotion(1),
        );
        if let Some(ref namesake_name) = namesake {
            child.memories.insert(
                MemoryEntry::new(
                    MemoryKind::Fact,
                    format!("I am named for {}, who came before me", namesake_name),
                    tick,
                )
                .with_salience(0.92)
                .with_emotion(2),
            );
        }
    }

    for (state, actions) in &organisms[org_idx].q_table {
        let mut row: crate::organism::organism::QRow = Vec::with_capacity(actions.len());
        for &(a, v) in actions {
            let new_v = if rng.random::<f32>() < 0.20 {
                v + rng.random_range(-0.03f32..0.03)
            } else {
                v
            };
            row.push((a, new_v));
        }
        child.q_table.insert(state.clone(), row);
    }

    let mem_trait = child.traits.memory_strength;
    let mut food_sorted: Vec<((i32, i32), f32)> = organisms[org_idx]
        .food_memory
        .iter()
        .map(|(&k, &v)| (k, v))
        .collect();
    food_sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    for (k, v) in food_sorted.into_iter().take(20) {
        if rng.random::<f32>() < 0.45 {
            Organism::remember(&mut child.food_memory, k.0, k.1, v * 0.5, mem_trait);
        }
    }
    let mut water_sorted: Vec<((i32, i32), f32)> = organisms[org_idx]
        .water_memory
        .iter()
        .map(|(&k, &v)| (k, v))
        .collect();
    water_sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    for (k, v) in water_sorted.into_iter().take(10) {
        if rng.random::<f32>() < 0.55 {
            Organism::remember(&mut child.water_memory, k.0, k.1, v * 0.5, mem_trait);
        }
    }
    for (&k, &v) in &organisms[org_idx].danger_memory {
        if rng.random::<f32>() < 0.6 {
            Organism::remember(&mut child.danger_memory, k.0, k.1, v * 0.5, mem_trait);
        }
    }

    for (lid, &att) in &organisms[org_idx].lineage_attitudes {
        child.lineage_attitudes.insert(lid.clone(), att * 0.7);
    }
    for (oid, &trust) in &organisms[org_idx].org_trust {
        child.org_trust.insert(oid.clone(), trust * 0.4);
    }

    child.discoveries.insert("foraging".to_string());

    let always_inherit = [
        "fire",
        "shelter",
        "water",
        "wood",
        "stone",
        "hunt",
        "cooking",
        "stone_tools",
        "spear",
        "foraging",
        "language",
    ];
    let sometimes_inherit = [
        "masonry",
        "torch",
        "medicine",
        "ritual",
        "farm",
        "smelting",
        "pottery",
        "agriculture",
        "tool_making",
        "fishing",
        "hunting",
        "writing",
        "basket_weaving",
        "leather",
        "weaving",
    ];
    for d in &organisms[org_idx].discoveries {
        if always_inherit.contains(&d.as_str()) {
            child.discoveries.insert(d.clone());
        } else if sometimes_inherit.contains(&d.as_str()) && rng.random::<f32>() < 0.85 {
            child.discoveries.insert(d.clone());
        } else if rng.random::<f32>() < 0.40 {
            child.discoveries.insert(d.clone());
        }
    }

    child.home_x = organisms[org_idx].home_x;
    child.home_y = organisms[org_idx].home_y;

    if organisms[org_idx].infection > 0.1 {
        child.infection = organisms[org_idx].infection * 0.15;
    }

    organisms[org_idx].energy -= 0.15;
    organisms[org_idx].hydration -= 0.05;
    organisms[org_idx].last_reproduced = tick;
    organisms[org_idx].pregnant = true;
    organisms[org_idx].pregnancy_start = tick;
    organisms[org_idx].joy_ticks = (organisms[org_idx].joy_ticks + 200).min(1200);

    child.alive = false;
    child.age = 0;
    child.father_id = Some(partner_id.clone());

    // Collect parent attribute snapshots before mutating child
    let mother_attrs = organisms[org_idx].attributes.clone();
    let father_attrs = organisms
        .iter()
        .find(|o| o.id == partner_id)
        .map(|o| o.attributes.clone())
        .unwrap_or_default();

    assign_birth_attributes(&mut child, rng);
    inherit_attributes_from_parents(&mut child, &mother_attrs, &father_attrs, rng);
    check_earned_attributes(&mut child);

    let parent_name = organisms[org_idx].name.clone();
    organisms[org_idx].think("expecting", tick);
    organisms[org_idx].log_event(format!("expecting {} (due in ~2 days)", child_name));

    push_event(
        events,
        tick,
        "born",
        &child_name,
        &format!("gen{} from {} (expecting)", generation, parent_name),
    );
    organisms.push(child);
}

pub const PREGNANCY_DURATION: u64 = 1200;

pub fn deliver_births(
    organisms: &mut [Organism],
    tick: u64,
    events: &mut std::collections::VecDeque<Event>,
    history: &mut History,
) {
    let unborn_map: std::collections::HashMap<&str, usize> = organisms
        .iter()
        .enumerate()
        .filter(|(_, o)| !o.alive && o.age == 0)
        .map(|(i, o)| (o.parent_id.as_str(), i))
        .collect();

    let mut deliveries: Vec<(usize, usize)> = Vec::new();
    for mother_idx in 0..organisms.len() {
        if !organisms[mother_idx].pregnant {
            continue;
        }
        if tick.saturating_sub(organisms[mother_idx].pregnancy_start) < PREGNANCY_DURATION {
            continue;
        }
        let mother_id = organisms[mother_idx].id.as_str();
        if let Some(&child_idx) = unborn_map.get(mother_id) {
            deliveries.push((mother_idx, child_idx));
        }
    }
    for (mi, ci) in deliveries {
        let child_name = organisms[ci].name.clone();
        let generation = organisms[ci].generation;
        let parent_name = organisms[mi].name.clone();

        let dowry_food = organisms[mi].inv_food.saturating_sub(1) / 2;
        let dowry_water = organisms[mi].inv_water.saturating_sub(1) / 2;
        let dowry_wood = organisms[mi].inv_wood / 3;
        organisms[mi].inv_food = organisms[mi].inv_food.saturating_sub(dowry_food);
        organisms[mi].inv_water = organisms[mi].inv_water.saturating_sub(dowry_water);
        organisms[mi].inv_wood = organisms[mi].inv_wood.saturating_sub(dowry_wood);
        organisms[ci].inv_food = dowry_food.saturating_add(1);
        organisms[ci].inv_water = dowry_water.saturating_add(1);
        organisms[ci].inv_wood = dowry_wood;
        organisms[ci].nursing_until = tick + 1200;

        organisms[ci].alive = true;
        organisms[mi].pregnant = false;
        if organisms[mi].children_count == 0 {
            organisms[mi].add_anchor(tick, format!("first child {}", child_name), 0.8);
            use crate::organism::memory::{MemoryEntry, MemoryKind};
            let child_id_for_mem = organisms[ci].id.clone();
            organisms[mi].memories.insert(
                MemoryEntry::new(
                    MemoryKind::Bond,
                    format!("I became a mother — my first child was {}", child_name),
                    tick,
                )
                .with_salience(0.98)
                .with_emotion(3)
                .with_related(child_id_for_mem),
            );
        }
        organisms[mi].children_count += 1;
        organisms[mi].think(&format!("gave birth: {}", child_name), tick);
        organisms[mi].joy_ticks = (organisms[mi].joy_ticks + 400).min(1200);
        let ci_id = organisms[ci].id.clone();
        let cn = child_name.clone();
        organisms[mi].log_life_rel(
            tick,
            "birth",
            format!("gave birth to {}", child_name),
            Some(ci_id.clone()),
            Some(cn.clone()),
        );

        // The father also gets joy.
        let mother_partner = organisms[mi].partner_id.clone();
        if let Some(pid) = mother_partner {
            for fi in 0..organisms.len() {
                if organisms[fi].alive && organisms[fi].id == pid {
                    organisms[fi].joy_ticks = (organisms[fi].joy_ticks + 350).min(1200);
                    let was_first = organisms[fi].children_count == 0;
                    organisms[fi].children_count = organisms[fi].children_count.saturating_add(1);
                    organisms[fi].log_life_rel(
                        tick,
                        "birth",
                        format!("welcomed {} into the world", cn),
                        Some(ci_id.clone()),
                        Some(cn.clone()),
                    );
                    if was_first {
                        use crate::organism::memory::{MemoryEntry, MemoryKind};
                        organisms[fi].memories.insert(
                            MemoryEntry::new(
                                MemoryKind::Bond,
                                format!("I became a father — my first child was {}", cn),
                                tick,
                            )
                            .with_salience(0.96)
                            .with_emotion(3)
                            .with_related(ci_id.clone()),
                        );
                    }
                    break;
                }
            }
        }

        push_event(
            events,
            tick,
            "born",
            &child_name,
            &format!("gen{} born to {}", generation, parent_name),
        );
        history.births += 1;
    }
}

fn find_spawn_near(grid: &WorldGrid, x: i32, y: i32, rng: &mut impl Rng) -> Option<(i32, i32)> {
    for _ in 0..30 {
        let nx = x + rng.random_range(-3i32..=3);
        let ny = y + rng.random_range(-3i32..=3);
        if WorldGrid::in_bounds(nx, ny)
            && matches!(grid.get(nx, ny), Tile::Grass | Tile::Food | Tile::Hut | Tile::Ash)
        {
            return Some((nx, ny));
        }
    }
    for _ in 0..20 {
        let nx = x + rng.random_range(-5i32..=5);
        let ny = y + rng.random_range(-5i32..=5);
        if WorldGrid::in_bounds(nx, ny)
            && !matches!(
                grid.get(nx, ny),
                Tile::Rock | Tile::Void | Tile::Fire | Tile::Water
            )
        {
            return Some((nx, ny));
        }
    }
    None
}
