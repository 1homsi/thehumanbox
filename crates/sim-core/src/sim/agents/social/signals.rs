use super::*;

pub fn signal_food(
    org_idx: usize,
    organisms: &mut [Organism],
    spatial: &SpatialIndex,
    grid: &crate::world::grid::WorldGrid,
    tick: u64,
    events: &mut std::collections::VecDeque<Event>,
    rng: &mut impl Rng,
) -> f32 {
    let (ix, iy) = (organisms[org_idx].x as i32, organisms[org_idx].y as i32);
    let org_lineage = organisms[org_idx].lineage_id.clone();
    let org_id = organisms[org_idx].id.clone();
    // `word_for` falls back to the English concept name when the word has
    // been forgotten, so two organisms who both forgot "food" would compare
    // equal and count as recognising each other's signal. Capture the real
    // word (if any) so a forgotten word is treated as missing.
    let signal_word = organisms[org_idx]
        .vocabulary
        .known_word("food")
        .map(str::to_string);
    organisms[org_idx].vocabulary.touch_concept("food", tick);

    let best = Organism::best_remembered(
        &organisms[org_idx].food_memory,
        organisms[org_idx].x,
        organisms[org_idx].y,
    );
    let (bx, by) = match best {
        Some(p) => p,
        None if grid.get(ix, iy) == Tile::Food => (ix, iy),
        None => {
            organisms[org_idx].think("signaling (no food known)", tick);
            return 0.0;
        }
    };

    let nearby_indices: Vec<usize> = spatial
        .ordered_nearby(organisms, organisms[org_idx].x, organisms[org_idx].y, 12)
        .filter(|(i, o)| *i != org_idx && o.alive)
        .filter(|(_, o)| (o.x - organisms[org_idx].x).abs() + (o.y - organisms[org_idx].y).abs() <= 12.0)
        .map(|(i, _)| i)
        .collect();

    if nearby_indices.is_empty() {
        organisms[org_idx].think(
            &format!("\"{}\" (no one hears)", signal_word.as_deref().unwrap_or("~")),
            tick,
        );
        return 0.0;
    }

    let my_vocab = organisms[org_idx].vocabulary.clone();
    let mut reached = 0usize;
    let mut understood = 0usize;

    for &ni in &nearby_indices {
        let recognizes =
            signal_word.is_some() && organisms[ni].vocabulary.known_word("food") == signal_word.as_deref();
        organisms[ni].vocabulary.touch_concept("food", tick);
        let is_kin = organisms[ni].lineage_id == org_lineage;
        let trust = *organisms[ni].org_trust.get(&org_id).unwrap_or(&0.0);

        let base_strength = if is_kin {
            (0.5 * (0.5 + trust)).max(0.20)
        } else {
            0.10
        };
        let strength = if recognizes {
            base_strength
        } else {
            base_strength * 0.3
        };

        // `remember` scales by the *owner's* recall. Use the listener's own
        // memory strength, not the speaker's, or a forgetful signaller
        // imparts a stronger memory than a sharp one.
        let listener_mem_trait = organisms[ni].traits.memory_strength;
        Organism::remember(
            &mut organisms[ni].food_memory,
            bx,
            by,
            strength,
            listener_mem_trait,
        );

        organisms[ni].vocabulary.absorb_from(&my_vocab, rng);
        if recognizes {
            understood += 1;
        }
        reached += 1;
    }

    let spoken = signal_word.as_deref().unwrap_or("~");
    organisms[org_idx].think(&format!("\"{}\" ({}/{})", spoken, understood, reached), tick);
    push_event(
        events,
        tick,
        "signal",
        &organisms[org_idx].name.clone(),
        &format!("\"{}\" → {}/{} understood", spoken, understood, reached),
    );
    0.025 * (understood.min(4) as f32)
}

pub fn sound_alarm(
    org_idx: usize,
    organisms: &mut [Organism],
    spatial: &SpatialIndex,
    grid: &crate::world::grid::WorldGrid,
    tick: u64,
    events: &mut std::collections::VecDeque<Event>,
    rng: &mut impl Rng,
) -> f32 {
    let (ix, iy) = (organisms[org_idx].x as i32, organisms[org_idx].y as i32);
    let org_lineage = organisms[org_idx].lineage_id.clone();
    let on_fire = grid.get(ix, iy) == Tile::Fire;
    let concept = if on_fire { "fire" } else { "danger" };
    let signal_word = organisms[org_idx]
        .vocabulary
        .known_word(concept)
        .map(str::to_string);
    organisms[org_idx].vocabulary.touch_concept(concept, tick);

    let danger_loc = if on_fire {
        Some((ix, iy))
    } else {
        Organism::best_remembered(
            &organisms[org_idx].danger_memory,
            organisms[org_idx].x,
            organisms[org_idx].y,
        )
        .filter(|(cx, cy)| (cx - ix).abs() + (cy - iy).abs() <= 8)
    };

    let Some((dlx, dly)) = danger_loc else {
        organisms[org_idx].think("alarming (nothing)", tick);
        return 0.0;
    };

    let nearby_indices: Vec<usize> = spatial
        .ordered_nearby(organisms, organisms[org_idx].x, organisms[org_idx].y, 14)
        .filter(|(i, o)| *i != org_idx && o.alive)
        .filter(|(_, o)| (o.x - organisms[org_idx].x).abs() + (o.y - organisms[org_idx].y).abs() <= 14.0)
        .map(|(i, _)| i)
        .collect();

    if nearby_indices.is_empty() {
        organisms[org_idx].think(
            &format!("\"{}\" (silence)", signal_word.as_deref().unwrap_or("~")),
            tick,
        );
        return 0.0;
    }

    let my_vocab = organisms[org_idx].vocabulary.clone();
    let mut kin_warned = 0usize;

    for &ni in &nearby_indices {
        let recognizes =
            signal_word.is_some() && organisms[ni].vocabulary.known_word(concept) == signal_word.as_deref();
        organisms[ni].vocabulary.touch_concept(concept, tick);
        let is_kin = organisms[ni].lineage_id == org_lineage;

        let strength = match (is_kin, recognizes) {
            (true, true) => 0.70,
            (true, false) => 0.35,
            (false, true) => 0.30,
            (false, false) => 0.08,
        };

        let listener_mem_trait = organisms[ni].traits.memory_strength;
        Organism::remember(
            &mut organisms[ni].danger_memory,
            dlx,
            dly,
            strength,
            listener_mem_trait,
        );

        organisms[ni].vocabulary.absorb_from(&my_vocab, rng);
        if is_kin {
            kin_warned += 1;
        }
    }

    organisms[org_idx].think(
        &format!(
            "\"{}!\" ({} warned)",
            signal_word.as_deref().unwrap_or("~"),
            kin_warned
        ),
        tick,
    );
    push_event(
        events,
        tick,
        "alarm",
        &organisms[org_idx].name.clone(),
        &format!(
            "\"{}\" warned {}",
            signal_word.as_deref().unwrap_or("~"),
            kin_warned
        ),
    );
    0.022 * (kin_warned.min(4) as f32)
}
