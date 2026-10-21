use super::*;

pub(super) const OLD_WIDTH: usize = 600;
pub(super) const OLD_HEIGHT: usize = 300;

/// Keep the old island and everything on it together, with open sea around it.
pub(super) fn centre_old_world(state: &mut SaveState, seed: u64) {
    let dx = ((WIDTH - OLD_WIDTH) / 2) as i32;
    let dy = ((HEIGHT - OLD_HEIGHT) / 2) as i32;
    let mut old = WorldGrid::new_sized::<OLD_WIDTH, OLD_HEIGHT>(seed, true);
    let g = &mut state.grid;
    macro_rules! layer {
        ($saved:ident, $generated:ident, $ocean:expr) => {
            if g.$saved.len() != OLD_WIDTH * OLD_HEIGHT {
                g.$saved = std::mem::take(&mut old.$generated);
            }
            g.$saved = pad(&g.$saved, $ocean);
        };
    }
    layer!(tiles, tiles, Tile::Water as i8);
    layer!(depth, depth, 1.0);
    layer!(biome, biome, 0);
    layer!(fire, fire_intensity, 0.0);
    layer!(food_trail, food_trail, 0.0);
    layer!(water_trail, water_trail, 0.0);
    layer!(path_trail, path_trail, 0.0);
    layer!(structure, structure, 0.0);
    layer!(fertility, fertility, 0.0);
    layer!(hazard, hazard, 0.0);
    layer!(pressure, pressure, 0.0);
    layer!(road, road, 0);
    layer!(elevation, elevation, 0.0);
    layer!(temperature, temperature, 22.0);
    let volcanoes = g.volcanoes.get_or_insert(old.volcanoes);
    for v in volcanoes.iter_mut().chain(g.placed_volcanoes.iter_mut()) {
        v.x += dx;
        v.y += dy;
    }
    for p in g.pool_centers.get_or_insert(old.pool_centers) {
        shift_pair(p, dx, dy);
    }
    shift_coordinates(state, dx, dy);
}

fn pad<T: Copy>(old: &[T], ocean: T) -> Vec<T> {
    let mut new = vec![ocean; WIDTH * HEIGHT];
    let (dx, dy) = ((WIDTH - OLD_WIDTH) / 2, (HEIGHT - OLD_HEIGHT) / 2);
    for y in 0..OLD_HEIGHT {
        let start = (y + dy) * WIDTH + dx;
        new[start..start + OLD_WIDTH].copy_from_slice(&old[y * OLD_WIDTH..(y + 1) * OLD_WIDTH]);
    }
    new
}

fn shift_pair(p: &mut (i32, i32), dx: i32, dy: i32) {
    p.0 += dx;
    p.1 += dy;
}

fn shift_array(p: &mut [i32; 2], dx: i32, dy: i32) {
    p[0] += dx;
    p[1] += dy;
}

fn shift_memory(memory: &mut HashMap<String, f32>, dx: i32, dy: i32) {
    *memory = mem_encode(
        &mem_decode(std::mem::take(memory))
            .into_iter()
            .map(|((x, y), value)| ((x + dx, y + dy), value))
            .collect(),
    );
}

fn shift_coordinates(s: &mut SaveState, dx: i32, dy: i32) {
    for o in &mut s.organisms {
        o.x += dx as f32;
        o.y += dy as f32;
        // (0, 0) means there is no saved home; loading supplies the person's position.
        if o.home_x != 0.0 || o.home_y != 0.0 {
            o.home_x += dx as f32;
            o.home_y += dy as f32;
        }
        for memory in [&mut o.food_memory, &mut o.water_memory, &mut o.danger_memory] {
            shift_memory(memory, dx, dy);
        }
        shift_array(&mut o.last_area_cell, dx, dy);
        if let Some(p) = &mut o.wander_target {
            shift_array(p, dx, dy);
        }
        if let Some(journey) = &mut o.journey {
            shift_pair(&mut journey.target, dx, dy);
        }
    }
    for animal in &mut s.animals {
        animal.x += dx as f32;
        animal.y += dy as f32;
        if let Some(p) = &mut animal.pen {
            shift_pair(p, dx, dy);
        }
    }
    for carcass in &mut s.carcasses {
        carcass.x += dx as f32;
        carcass.y += dy as f32;
    }
    for ward in &mut s.wards {
        ward.x += dx as f32;
        ward.y += dy as f32;
    }
    macro_rules! shift_xy {
        ($items:expr) => {
            for item in $items {
                item.x += dx;
                item.y += dy;
            }
        };
    }
    shift_xy!(&mut s.buildings);
    shift_xy!(&mut s.farms);
    shift_xy!(&mut s.vehicles);
    shift_xy!(&mut s.water_use);
    shift_xy!(&mut s.field_fortifications);
    shift_xy!(&mut s.prayers.active);
    for vehicle in &mut s.vehicles {
        for p in &mut vehicle.route {
            shift_pair(p, dx, dy);
        }
        for p in [&mut vehicle.harbour, &mut vehicle.bound_for]
            .into_iter()
            .flatten()
        {
            shift_pair(p, dx, dy);
        }
        if let Some(ferry) = &mut vehicle.ferry {
            shift_pair(&mut ferry.a, dx, dy);
            shift_pair(&mut ferry.b, dx, dy);
        }
    }
    for points in s.territory.values_mut() {
        for p in points {
            shift_array(p, dx, dy);
        }
    }
    for home in s.lineage_homes.values_mut() {
        home[0] += dx;
        home[1] += dy;
    }
    for history in s.lineage_centroid_history.values_mut() {
        for sample in history {
            sample[1] += dx;
            sample[2] += dy;
        }
    }
    for p in &mut s.drought.dried_tiles {
        shift_array(p, dx, dy);
    }
    for (x, y, _) in &mut s.flood_tiles {
        *x += dx;
        *y += dy;
    }
    // Plantings use a flat tile index as their key, so the row stride changes too.
    s.plantings = std::mem::take(&mut s.plantings)
        .into_iter()
        .map(|(i, planting)| {
            let x = i as usize % OLD_WIDTH + dx as usize;
            let y = i as usize / OLD_WIDTH + dy as usize;
            ((y * WIDTH + x) as u32, planting)
        })
        .collect();
    for artwork in &mut s.artworks {
        shift_array(&mut artwork.location, dx, dy);
    }
    for festival in &mut s.festivals {
        shift_array(&mut festival.center, dx, dy);
    }
    for battle in &mut s.battles {
        shift_pair(&mut battle.location, dx, dy);
    }
    for outbreak in &mut s.outbreaks {
        shift_array(&mut outbreak.epicenter, dx, dy);
    }
    for route in &mut s.trade_routes {
        shift_array(&mut route.a_center, dx, dy);
        shift_array(&mut route.b_center, dx, dy);
    }
    for caravan in &mut s.caravans {
        shift_array(&mut caravan.from, dx, dy);
        shift_array(&mut caravan.to, dx, dy);
    }
    for road in &mut s.village_roads {
        shift_array(&mut road.from, dx, dy);
        shift_array(&mut road.to, dx, dy);
    }
    for rail in &mut s.rail_lines {
        shift_array(&mut rail.a, dx, dy);
        shift_array(&mut rail.b, dx, dy);
        for p in &mut rail.path {
            shift_array(p, dx, dy);
        }
    }
    for grain in &mut s.cart_grain {
        shift_array(&mut grain.at, dx, dy);
    }
    for plaza in &mut s.town_plazas {
        shift_array(&mut plaza.center, dx, dy);
        for p in &mut plaza.streets {
            shift_array(p, dx, dy);
        }
    }
}
