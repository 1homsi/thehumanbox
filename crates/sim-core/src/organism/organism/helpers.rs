use super::*;

pub(super) fn best_remembered_cell(
    memory: &FxHashMap<(i32, i32), f32>,
    cx: f32,
    cy: f32,
    danger: &FxHashMap<(i32, i32), f32>,
    urgency: f32,
) -> Option<(i32, i32)> {
    let mut best_score = 0.03f32;
    let mut best: Option<(i32, i32)> = None;
    let urgency = urgency.clamp(0.0, 1.0);
    let max_dist = 180.0 + urgency * 260.0;
    let distance_weight = 0.85 - urgency * 0.45;
    let danger_weight = 1.25 + urgency * 1.75;
    for (&cell, &strength) in memory.iter() {
        if strength < 0.15 {
            continue;
        }
        let tx = cell.0 as f32;
        let ty = cell.1 as f32;
        let dist = ((tx - cx) * (tx - cx) + (ty - cy) * (ty - cy)).sqrt();
        if dist > max_dist {
            continue;
        }
        let base = strength * (1.0 + urgency * 0.35) - (dist / max_dist) * distance_weight;
        // Danger only lowers the score, so skip its 9 lookups when this cell
        // can't win anyway or nothing dangerous is remembered.
        if base <= best_score {
            continue;
        }
        let local_danger = if danger.is_empty() {
            0.0
        } else {
            nearby_memory_strength(danger, cell, 1)
        };
        let score = base - local_danger * danger_weight;
        if score > best_score {
            best_score = score;
            best = Some(cell);
        }
    }
    best
}

pub(super) fn nearby_memory_strength(
    memory: &FxHashMap<(i32, i32), f32>,
    cell: (i32, i32),
    radius: i32,
) -> f32 {
    let mut best = memory.get(&cell).copied().unwrap_or(0.0);
    for dx in -radius..=radius {
        for dy in -radius..=radius {
            if dx == 0 && dy == 0 {
                continue;
            }
            if let Some(v) = memory.get(&(cell.0 + dx, cell.1 + dy)) {
                if *v > best {
                    best = *v;
                }
            }
        }
    }
    best
}

pub(super) fn remembered_dir_char(
    memory: &FxHashMap<(i32, i32), f32>,
    cx: f32,
    cy: f32,
    danger: &FxHashMap<(i32, i32), f32>,
    urgency: f32,
) -> char {
    if let Some((tx, ty)) = best_remembered_cell(memory, cx, cy, danger, urgency) {
        dir_char(tx - cx as i32, ty - cy as i32)
    } else {
        'X'
    }
}

pub(super) fn dir_char(dx: i32, dy: i32) -> char {
    if dx == 0 && dy == 0 {
        return 'O';
    }
    if dx.abs() >= dy.abs() {
        if dx > 0 {
            'E'
        } else {
            'W'
        }
    } else {
        if dy > 0 {
            'S'
        } else {
            'N'
        }
    }
}

pub(super) fn reserve_char(count: u8, stocked_at: u8) -> char {
    if count == 0 {
        '0'
    } else if count >= stocked_at {
        '2'
    } else {
        '1'
    }
}
