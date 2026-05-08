use rand::Rng;
use uuid::Uuid;
use crate::organism::organism::{Organism, generate_name, N_ACTIONS, Sex, apply_sex_traits};
use crate::organism::traits::Traits;
use crate::organism::vocabulary::Vocabulary;
use crate::world::{grid::WorldGrid, tiles::{Tile, Biome}};
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
    let sex    = Sex::random(rng);
    let mut traits = Traits::random(rng);
    apply_sex_traits(&mut traits, sex);
    let max_age = rng.gen_range(
        (3000.0 + 2500.0 * traits.resilience) as u32
        ..=(5000.0 + 3500.0 * traits.resilience) as u32
    );

    let mut org = Organism::new(
        id.clone(), generate_name(rng, sex),
        x, y, 0, String::new(), id.clone(), max_age, traits,
    );
    org.sex = sex;
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
    // Only females give birth
    if org.sex != Sex::Female { return; }
    // Must be at least 5 days old (adults only), and 8 days between births
    if !(org.energy > 0.82 && org.hydration > 0.82 && org.health > 0.9 && org.age > 3000) { return; }
    if tick - org.last_reproduced < 4800 { return; }
    if org.infection > 0.25 { return; }

    // Partner requirement: must have a bonded male partner nearby
    let partner_id = match org.partner_id.clone() {
        Some(pid) => pid,
        None => return,
    };
    let (org_x, org_y) = (org.x, org.y);
    let partner_nearby = organisms.iter().any(|o| {
        o.alive && o.id == partner_id && o.sex == Sex::Male
            && (o.x - org_x).hypot(o.y - org_y) < 20.0
    });
    if !partner_nearby { return; }

    // Biome survival pressure shapes reproduction rates
    let biome = grid.biome_at(org_x as i32, org_y as i32);
    let biome_mult = match biome {
        Biome::Volcanic  => 0.25, // extreme conditions crush birth rates
        Biome::Tundra    => 0.40, // cold seasons reduce fertility
        Biome::Desert    => 0.55, // harsh heat suppresses reproduction
        Biome::Grassland => 1.00,
        Biome::Wetland   => 1.20, // wetland abundance
        Biome::Forest    => 1.30, // forest abundance
    };

    // Local soil fertility shapes birth rates — fertile land supports more children
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
    // 0.4 at barren land → 1.6 at rich land
    let land_mult = 0.4 + local_fert * 1.2;

    // Birth rate variance: probability tied to social_tendency (some families large, some small)
    let social = org.traits.social_tendency;
    let fertility_prob = (0.15 + social * 0.40) * biome_mult * land_mult;
    if rng.gen::<f32>() > fertility_prob.clamp(0.02, 0.80) { return; }

    let spawn_pos = find_spawn_near(grid, org.x as i32, org.y as i32, rng);
    let Some((sx, sy)) = spawn_pos else { return; };

    // Mendelian trait mixing: each trait randomly drawn from mother or father
    let father_traits = organisms.iter()
        .find(|o| o.id == partner_id)
        .map(|o| o.traits.clone())
        .unwrap_or_else(|| organisms[org_idx].traits.clone());
    let child_traits = organisms[org_idx].traits.mix(&father_traits, rng).mutate(rng);

    let child_sex = Sex::random(rng);
    let mut child_traits_sexed = child_traits;
    apply_sex_traits(&mut child_traits_sexed, child_sex);

    let max_age = rng.gen_range(
        (3000.0 + 2500.0 * child_traits_sexed.resilience) as u32
        ..=(5000.0 + 3500.0 * child_traits_sexed.resilience) as u32
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

    organisms[org_idx].energy    -= 0.15;
    organisms[org_idx].hydration -= 0.05;
    organisms[org_idx].last_reproduced = tick;
    organisms[org_idx].pregnant        = true;
    organisms[org_idx].pregnancy_start = tick;

    // Store the child as a pending birth — we'll deliver it after the pregnancy period.
    // To avoid storing the full child object (costly), we push it immediately but mark
    // it as alive=false with a sentinel pregnancy_start check in simulation.rs.
    // Simpler: just push the child now as "unborn" with alive=false and let
    // deliver_births() flip it alive after PREGNANCY_DURATION ticks.
    // We use the child's age=0 and alive=false as the pending-birth marker.
    child.alive     = false;
    child.age       = 0;
    // Record biological father — tracks paternity even if parents later split or cheated
    child.father_id = Some(partner_id.clone());

    let parent_name = organisms[org_idx].name.clone();
    organisms[org_idx].think("expecting", tick);
    organisms[org_idx].log_event(format!("expecting {} (due in ~3 days)", child_name));

    push_event(events, tick, "born", &child_name,
               &format!("gen{} from {} (expecting)", generation, parent_name));
    organisms.push(child);
}

/// Called every tick. If a pregnant organism's delivery period is over, flip the
/// pending child (alive=false, age=0, parent_id points to pregnant mother) alive.
pub const PREGNANCY_DURATION: u64 = 1800; // ~3 sim-days

pub fn deliver_births(
    organisms: &mut Vec<Organism>,
    tick: u64,
    events: &mut Vec<Event>,
    history: &mut History,
) {
    // Collect deliveries: find pregnant mothers whose duration has elapsed
    let mut deliveries: Vec<(usize, usize)> = Vec::new(); // (mother_idx, child_idx)
    for mother_idx in 0..organisms.len() {
        if !organisms[mother_idx].pregnant { continue; }
        if tick.saturating_sub(organisms[mother_idx].pregnancy_start) < PREGNANCY_DURATION { continue; }
        let mother_id = organisms[mother_idx].id.clone();
        // Find the unborn child (alive=false, age=0, parent_id == mother_id)
        if let Some(child_idx) = organisms.iter().position(|o|
            !o.alive && o.age == 0 && o.parent_id == mother_id
        ) {
            deliveries.push((mother_idx, child_idx));
        }
    }
    for (mi, ci) in deliveries {
        let child_name = organisms[ci].name.clone();
        let generation = organisms[ci].generation;
        let parent_name = organisms[mi].name.clone();

        organisms[ci].alive = true;
        organisms[mi].pregnant = false;
        organisms[mi].children_count += 1;
        organisms[mi].think(&format!("gave birth: {}", child_name), tick);
        organisms[mi].log_event(format!("gave birth to {}", child_name));

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
