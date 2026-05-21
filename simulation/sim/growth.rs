use rand::Rng;
use uuid::Uuid;
use crate::organism::organism::{Organism, generate_name, N_ACTIONS, Sex, apply_sex_traits};
use crate::organism::traits::Traits;
use crate::organism::vocabulary::Vocabulary;
use crate::organism::attributes::{assign_birth_attributes, check_earned_attributes, inherit_attributes_from_parents};
use crate::world::{grid::WorldGrid, tiles::{Tile, Biome}};
use super::config::MAX_POPULATION;
use super::simulation::{Event, History};
use super::world_events::push_event;

pub fn spawn_organism_with_home(
    grid: &WorldGrid,
    organisms: &mut Vec<Organism>,
    x: f32, y: f32,
    home_x: f32, home_y: f32,
    lineage_id: String,
    rng: &mut impl Rng,
) {
    let id     = Uuid::new_v4().to_string()[..8].to_string();
    let sex    = Sex::random(rng);
    let mut traits = Traits::random(rng);
    apply_sex_traits(&mut traits, sex);
    let max_age = rng.gen_range(
        (9000.0 + 4000.0 * traits.resilience) as u32
        ..=(14000.0 + 6000.0 * traits.resilience) as u32
    );

    let mut org = Organism::new(
        id.clone(), generate_name(rng, sex),
        x, y, 0, String::new(), lineage_id, max_age, traits,
    );
    org.home_x = home_x;
    org.home_y = home_y;
    org.sex = sex;
    org.vocabulary = Vocabulary::generate(rng);
    assign_birth_attributes(&mut org, rng);
    check_earned_attributes(&mut org);

    let ix = x as i32; let iy = y as i32;
    for dx in -6i32..=6 {
        for dy in -6i32..=6 {
            let (nx, ny) = (ix + dx, iy + dy);
            match grid.get(nx, ny) {
                Tile::Water => Organism::remember(&mut org.water_memory, nx, ny, 0.9, org.traits.memory_strength),
                Tile::Food  => Organism::remember(&mut org.food_memory,  nx, ny, 0.5, org.traits.memory_strength),
                _ => {}
            }
        }
    }
    organisms.push(org);
}

pub fn try_reproduce(
    org_idx: usize,
    organisms: &mut Vec<Organism>,
    grid: &WorldGrid,
    tick: u64,
    events: &mut std::collections::VecDeque<Event>,
    _history: &mut History,
    rng: &mut impl Rng,
    alive_count: usize,
    lineage_counts: &std::collections::HashMap<String, usize>,
) {
    if alive_count >= MAX_POPULATION { return; }

    let org = &organisms[org_idx];
    if org.sex != Sex::Female { return; }

    const MAX_LINEAGE_POP: usize = 50;
    if lineage_counts.get(&org.lineage_id).copied().unwrap_or(0) >= MAX_LINEAGE_POP {
        return;
    }

    let critical = alive_count < 30;
    let low_pop  = alive_count < 80;
    let (e_min, h_min, hp_min, cooldown, partner_dist) = if critical {
        (0.18, 0.18, 0.22, 350u64, 200.0f32)
    } else if low_pop {
        (0.28, 0.28, 0.32, 500u64, 100.0f32)
    } else {
        (0.42, 0.42, 0.45, 1500u64, 30.0f32)
    };

    if !(org.energy > e_min && org.hydration > h_min && org.health > hp_min && org.age > 1000) { return; }
    if tick - org.last_reproduced < cooldown { return; }
    if !critical && org.infection > 0.30 { return; }

    let (org_x, org_y) = (org.x, org.y);
    let partner_id: String = if critical {
        let nearest = organisms.iter()
            .filter(|o| o.alive && o.sex == Sex::Male && o.age > 1000
                && (o.x - org_x).hypot(o.y - org_y) < partner_dist)
            .min_by(|a, b| {
                let da = (a.x - org_x).hypot(a.y - org_y);
                let db = (b.x - org_x).hypot(b.y - org_y);
                da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
            });
        match nearest {
            Some(o) => o.id.clone(),
            None    => return,
        }
    } else {
        let Some(pid) = org.partner_id.clone() else { return };
        let bonded_nearby = organisms.iter().any(|o| {
            o.alive && o.id == pid && o.sex == Sex::Male
                && (o.x - org_x).hypot(o.y - org_y) < partner_dist
        });
        if !bonded_nearby { return; }
        pid
    };

    let biome = grid.biome_at(org_x as i32, org_y as i32);
    let biome_mult = match biome {
        Biome::Volcanic  => 0.25,
        Biome::Tundra    => 0.40,
        Biome::Desert    => 0.55,
        Biome::Grassland => 1.00,
        Biome::Wetland   => 1.20,
        Biome::Forest    => 1.30,
    };

    let local_fert = {
        let cx = org_x as i32; let cy = org_y as i32;
        let mut sum = 0.0f32; let mut n = 0u32;
        for dx in -3i32..=3 { for dy in -3i32..=3 {
            if WorldGrid::in_bounds(cx+dx, cy+dy) {
                sum += grid.fertility_at(cx+dx, cy+dy); n += 1;
            }
        }}
        if n > 0 { sum / n as f32 } else { 0.5 }
    };
    let land_mult = 0.4 + local_fert * 1.2;

    let social = org.traits.social_tendency;
    let fertility_prob = (0.30 + social * 0.50) * biome_mult * land_mult;
    if rng.gen::<f32>() > fertility_prob.clamp(0.20, 0.95) { return; }

    let spawn_pos = find_spawn_near(grid, org.x as i32, org.y as i32, rng);
    let Some((sx, sy)) = spawn_pos else { return; };

    let father_traits = organisms.iter()
        .find(|o| o.id == partner_id)
        .map(|o| o.traits.clone())
        .unwrap_or_else(|| organisms[org_idx].traits.clone());
    let child_traits = organisms[org_idx].traits.mix(&father_traits, rng).mutate(rng);

    let child_sex = Sex::random(rng);
    let mut child_traits_sexed = child_traits;
    apply_sex_traits(&mut child_traits_sexed, child_sex);

    let max_age = rng.gen_range(
        (8000.0 + 4000.0 * child_traits_sexed.resilience) as u32
        ..=(18000.0 + 8000.0 * child_traits_sexed.resilience) as u32
    );

    let child_id = Uuid::new_v4().to_string()[..8].to_string();
    let child_name = generate_name(rng, child_sex);
    let parent_id  = organisms[org_idx].id.clone();
    let lineage_id = organisms[org_idx].lineage_id.clone();
    let generation = organisms[org_idx].generation + 1;

    let mut child = Organism::new(
        child_id.clone(), child_name.clone(),
        sx as f32, sy as f32,
        generation, parent_id, lineage_id,
        max_age, child_traits_sexed,
    );
    child.sex = child_sex;
    child.vocabulary = Vocabulary::inherit_from(&organisms[org_idx].vocabulary, rng);

    for (state, actions) in &organisms[org_idx].q_table {
        let mut row: crate::organism::organism::QRow = Vec::with_capacity(actions.len());
        for &(a, v) in actions {
            let new_v = if rng.gen::<f32>() > 0.08 {
                v + rng.gen_range(-0.15f32..0.15)
            } else {
                rng.gen_range(-0.4f32..0.4)
            };
            row.push((a, new_v));
        }
        child.q_table.insert(state.clone(), row);
    }

    let mem_trait = child.traits.memory_strength;
    let mut food_sorted: Vec<((i32, i32), f32)> = organisms[org_idx].food_memory
        .iter().map(|(&k, &v)| (k, v)).collect();
    food_sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    for (k, v) in food_sorted.into_iter().take(20) {
        if rng.gen::<f32>() < 0.45 {
            Organism::remember(&mut child.food_memory, k.0, k.1, v * 0.5, mem_trait);
        }
    }
    let mut water_sorted: Vec<((i32, i32), f32)> = organisms[org_idx].water_memory
        .iter().map(|(&k, &v)| (k, v)).collect();
    water_sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    for (k, v) in water_sorted.into_iter().take(10) {
        if rng.gen::<f32>() < 0.55 {
            Organism::remember(&mut child.water_memory, k.0, k.1, v * 0.5, mem_trait);
        }
    }
    for (&k, &v) in &organisms[org_idx].danger_memory {
        if rng.gen::<f32>() < 0.6 {
            Organism::remember(&mut child.danger_memory, k.0, k.1, v * 0.5, mem_trait);
        }
    }

    for (lid, &att) in &organisms[org_idx].lineage_attitudes {
        child.lineage_attitudes.insert(lid.clone(), att * 0.7);
    }
    for (oid, &trust) in &organisms[org_idx].org_trust {
        child.org_trust.insert(oid.clone(), trust * 0.4);
    }

    let always_inherit = ["fire", "shelter", "water", "wood", "stone", "hunt"];
    let sometimes_inherit = ["cooking", "masonry", "stone_tools", "torch", "medicine", "ritual", "farm", "spear"];
    for d in &organisms[org_idx].discoveries {
        if always_inherit.contains(&d.as_str()) {
            child.discoveries.insert(d.clone());
        } else if sometimes_inherit.contains(&d.as_str()) && rng.gen::<f32>() < 0.55 {
            child.discoveries.insert(d.clone());
        } else if rng.gen::<f32>() < 0.20 {
            child.discoveries.insert(d.clone());
        }
    }

    let drift = 70.0;
    let dx = rng.gen_range(-drift..=drift) * 0.5 + rng.gen_range(-drift..=drift) * 0.5;
    let dy = rng.gen_range(-drift..=drift) * 0.5 + rng.gen_range(-drift..=drift) * 0.5;
    let reflect = |mut v: f32, max: f32| {
        if v < 0.0 { v = -v; }
        if v > max { v = 2.0 * max - v; }
        v.clamp(0.0, max)
    };
    child.home_x = reflect(organisms[org_idx].home_x + dx, (crate::world::grid::WIDTH  - 1) as f32);
    child.home_y = reflect(organisms[org_idx].home_y + dy, (crate::world::grid::HEIGHT - 1) as f32);

    if organisms[org_idx].infection > 0.1 {
        child.infection = organisms[org_idx].infection * 0.15;
    }

    organisms[org_idx].energy    -= 0.15;
    organisms[org_idx].hydration -= 0.05;
    organisms[org_idx].last_reproduced = tick;
    organisms[org_idx].pregnant        = true;
    organisms[org_idx].pregnancy_start = tick;

    child.alive     = false;
    child.age       = 0;
    child.father_id = Some(partner_id.clone());

    // Collect parent attribute snapshots before mutating child
    let mother_attrs = organisms[org_idx].attributes.clone();
    let father_attrs = organisms.iter()
        .find(|o| o.id == partner_id)
        .map(|o| o.attributes.clone())
        .unwrap_or_default();

    assign_birth_attributes(&mut child, rng);
    inherit_attributes_from_parents(&mut child, &mother_attrs, &father_attrs, rng);
    check_earned_attributes(&mut child);

    let parent_name = organisms[org_idx].name.clone();
    organisms[org_idx].think("expecting", tick);
    organisms[org_idx].log_event(format!("expecting {} (due in ~2 days)", child_name));

    push_event(events, tick, "born", &child_name,
               &format!("gen{} from {} (expecting)", generation, parent_name));
    organisms.push(child);
}

pub const PREGNANCY_DURATION: u64 = 1200;

pub fn deliver_births(
    organisms: &mut Vec<Organism>,
    tick: u64,
    events: &mut std::collections::VecDeque<Event>,
    history: &mut History,
) {
    let unborn_map: std::collections::HashMap<&str, usize> = organisms.iter().enumerate()
        .filter(|(_, o)| !o.alive && o.age == 0)
        .map(|(i, o)| (o.parent_id.as_str(), i))
        .collect();

    let mut deliveries: Vec<(usize, usize)> = Vec::new();
    for mother_idx in 0..organisms.len() {
        if !organisms[mother_idx].pregnant { continue; }
        if tick.saturating_sub(organisms[mother_idx].pregnancy_start) < PREGNANCY_DURATION { continue; }
        let mother_id = organisms[mother_idx].id.as_str();
        if let Some(&child_idx) = unborn_map.get(mother_id) {
            deliveries.push((mother_idx, child_idx));
        }
    }
    for (mi, ci) in deliveries {
        let child_name = organisms[ci].name.clone();
        let generation = organisms[ci].generation;
        let parent_name = organisms[mi].name.clone();

        organisms[ci].alive = true;
        organisms[mi].pregnant = false;
        if organisms[mi].children_count == 0 {
            organisms[mi].add_anchor(
                tick,
                format!("first child {}", child_name),
                0.8,
            );
        }
        organisms[mi].children_count += 1;
        organisms[mi].think(&format!("gave birth: {}", child_name), tick);
        let ci_id = organisms[ci].id.clone();
        let cn = child_name.clone();
        organisms[mi].log_life_rel(tick, "birth",
            format!("gave birth to {}", child_name),
            Some(ci_id), Some(cn));

        push_event(events, tick, "born", &child_name,
                   &format!("gen{} born to {}", generation, parent_name));
        history.births += 1;
    }
}

fn find_spawn_near(grid: &WorldGrid, x: i32, y: i32, rng: &mut impl Rng)
    -> Option<(i32, i32)>
{
    for _ in 0..20 {
        let nx = x + rng.gen_range(-3i32..=3);
        let ny = y + rng.gen_range(-3i32..=3);
        if WorldGrid::in_bounds(nx, ny) &&
           !matches!(grid.get(nx, ny), Tile::Rock | Tile::Void | Tile::Fire)
        {
            return Some((nx, ny));
        }
    }
    None
}
