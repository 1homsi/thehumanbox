use rand::Rng;
use uuid::Uuid;
use crate::organism::organism::{Organism, generate_name, N_ACTIONS};
use crate::organism::traits::Traits;
use crate::organism::vocabulary::Vocabulary;
use crate::world::{grid::WorldGrid, tiles::Tile};
use super::config::MAX_POPULATION;
use super::simulation::{Event, History};
use super::world_events::push_event;

pub fn spawn_organism(
    grid: &WorldGrid,
    organisms: &mut Vec<Organism>,
    x: f32, y: f32,
    rng: &mut impl Rng,
) {
    let id     = Uuid::new_v4().to_string()[..8].to_string();
    let traits = Traits::random(rng);
    let max_age = rng.gen_range(
        (3000.0 + 2500.0 * traits.resilience) as u32
        ..=(5000.0 + 3500.0 * traits.resilience) as u32
    );

    let mut org = Organism::new(
        id.clone(), generate_name(rng),
        x, y, 0, String::new(), id.clone(), max_age, traits,
    );
    org.vocabulary = Vocabulary::generate(rng);

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
    events: &mut Vec<Event>,
    history: &mut History,
    rng: &mut impl Rng,
) {
    let alive_count = organisms.iter().filter(|o| o.alive).count();
    if alive_count >= MAX_POPULATION { return; }

    let org = &organisms[org_idx];
    if !(org.energy > 0.82 && org.hydration > 0.82 && org.health > 0.9 && org.age > 400) { return; }
    if tick - org.last_reproduced < 600 { return; }
    if org.infection > 0.25 { return; }

    let spawn_pos = find_spawn_near(grid, org.x as i32, org.y as i32, rng);
    let Some((sx, sy)) = spawn_pos else { return; };

    let child_traits = organisms[org_idx].traits.mutate(rng);
    let max_age = rng.gen_range(
        (3000.0 + 2500.0 * child_traits.resilience) as u32
        ..=(5000.0 + 3500.0 * child_traits.resilience) as u32
    );

    let child_id = Uuid::new_v4().to_string()[..8].to_string();
    let child_name = generate_name(rng);
    let parent_id  = organisms[org_idx].id.clone();
    let lineage_id = organisms[org_idx].lineage_id.clone();
    let generation = organisms[org_idx].generation + 1;

    let mut child = Organism::new(
        child_id.clone(), child_name.clone(),
        sx as f32, sy as f32,
        generation, parent_id, lineage_id,
        max_age, child_traits,
    );
    child.vocabulary = Vocabulary::inherit_from(&organisms[org_idx].vocabulary, rng);

    // Q-table inheritance — more noise so children explore rather than copying parent routes
    for (state, actions) in &organisms[org_idx].q_table {
        let mut row = actions.clone();
        while row.len() < N_ACTIONS { row.push(0.0); }
        for v in &mut row {
            if rng.gen::<f32>() > 0.08 {
                *v += rng.gen_range(-0.15f32..0.15);
            } else {
                *v = rng.gen_range(-0.4f32..0.4);
            }
        }
        child.q_table.insert(state.clone(), row);
    }

    // Partial memory inheritance — danger passes strongly, food/water only hints
    let mem_trait = child.traits.memory_strength;
    for (&k, &v) in &organisms[org_idx].food_memory {
        if rng.gen::<f32>() < 0.12 {
            Organism::remember(&mut child.food_memory, k.0, k.1, v * 0.2, mem_trait);
        }
    }
    for (&k, &v) in &organisms[org_idx].water_memory {
        if rng.gen::<f32>() < 0.18 {
            Organism::remember(&mut child.water_memory, k.0, k.1, v * 0.2, mem_trait);
        }
    }
    for (&k, &v) in &organisms[org_idx].danger_memory {
        if rng.gen::<f32>() < 0.6 {
            Organism::remember(&mut child.danger_memory, k.0, k.1, v * 0.5, mem_trait);
        }
    }

    // Inherit relationships (diluted)
    for (lid, &att) in &organisms[org_idx].lineage_attitudes {
        child.lineage_attitudes.insert(lid.clone(), att * 0.7);
    }
    for (oid, &trust) in &organisms[org_idx].org_trust {
        child.org_trust.insert(oid.clone(), trust * 0.4);
    }

    // Inherit home location — children know where they came from
    child.home_x = organisms[org_idx].home_x;
    child.home_y = organisms[org_idx].home_y;

    // Settlement imprinting: if born near an existing structure, that place is home
    let struct_near = (-4i32..=4).flat_map(|dx| (-4i32..=4).map(move |dy| (sx as i32 + dx, sy as i32 + dy)))
        .map(|(x, y)| grid.structure_at(x, y))
        .fold(0.0f32, f32::max);
    if struct_near >= 0.2 {
        child.home_x = sx as f32;
        child.home_y = sy as f32;
    }

    // Birth infection
    if organisms[org_idx].infection > 0.1 {
        child.infection = organisms[org_idx].infection * 0.15;
    }

    organisms[org_idx].energy    -= 0.25;
    organisms[org_idx].hydration -= 0.10;
    organisms[org_idx].last_reproduced = tick;

    let parent_name = organisms[org_idx].name.clone();
    child.think("born", tick);
    organisms[org_idx].think(&format!("offspring: {}", child_name), tick);
    organisms[org_idx].log_event(format!("had offspring {} at ({},{})", child_name, sx, sy));

    push_event(events, tick, "born", &child_name,
               &format!("gen{} from {}", generation, parent_name));
    history.births += 1;
    organisms.push(child);
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
