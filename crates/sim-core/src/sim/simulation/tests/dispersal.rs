//! Founders, tribes, expeditions and how the population spreads out.

use super::*;

#[test]
fn curious_adults_choose_distant_land_expeditions() {
    let mut sim = Simulation::new(35);
    for x in 0..WIDTH as i32 {
        for y in 0..HEIGHT as i32 {
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].id = "curious-adult".to_string();
    sim.organisms[idx].x = (WIDTH / 2) as f32;
    sim.organisms[idx].y = (HEIGHT / 2) as f32;
    sim.organisms[idx].age = 2_000;
    sim.organisms[idx].energy = 0.95;
    sim.organisms[idx].hydration = 0.95;
    sim.organisms[idx].fear_level = 0.0;
    sim.organisms[idx].traits.curiosity = 0.9;
    let curiosity = sim.organisms[idx].traits.curiosity;
    let hash = sim.organisms[idx]
        .id
        .bytes()
        .fold(0u64, |a, b| a.wrapping_mul(31).wrapping_add(b as u64));
    let period = (450u64).saturating_sub((curiosity * 200.0) as u64).max(140);
    sim.tick_count = hash % period;

    sim.validate_or_assign_wander_target(idx, None);

    let target = sim.organisms[idx]
        .wander_target
        .expect("curious adult should choose a land expedition");
    let dist =
        (target.0 - sim.organisms[idx].x as i32).abs() + (target.1 - sim.organisms[idx].y as i32).abs();
    // Matches `find_distant_land_target`'s minimum for this curiosity.
    let expected_min = 30 + (curiosity * 40.0) as i32;
    assert!(
        dist >= expected_min,
        "dist={} curiosity={} period={} tick_count={} expected>={}",
        dist,
        curiosity,
        period,
        sim.tick_count,
        expected_min
    );
    assert_eq!(sim.grid.get(target.0, target.1), Tile::Grass);
}

#[test]
fn founders_spread_across_world_sectors() {
    for seed in [1u64, 7, 42, 99, 137] {
        let sim = Simulation::new(seed);
        let alive: Vec<_> = sim.organisms.iter().filter(|o| o.alive).collect();
        assert!(
            alive.len() >= 100,
            "seed {seed} fewer founders than expected: {}",
            alive.len()
        );

        let xs: Vec<f32> = alive.iter().map(|o| o.x).collect();
        let ys: Vec<f32> = alive.iter().map(|o| o.y).collect();
        let xmin = xs.iter().cloned().fold(f32::INFINITY, f32::min);
        let xmax = xs.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        let ymin = ys.iter().cloned().fold(f32::INFINITY, f32::min);
        let ymax = ys.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        let span_x = xmax - xmin;
        let span_y = ymax - ymin;

        assert!(
            span_x >= WIDTH as f32 * 0.40,
            "seed {seed} founders span only {} of {} tiles wide",
            span_x,
            WIDTH
        );
        assert!(
            span_y >= HEIGHT as f32 * 0.30,
            "seed {seed} founders span only {} of {} tiles tall",
            span_y,
            HEIGHT
        );

        use rustc_hash::FxHashMap as HashMap;
        let mut by_lid: HashMap<String, Vec<(f32, f32)>> = HashMap::default();
        for o in &alive {
            by_lid.entry(o.lineage_id.clone()).or_default().push((o.x, o.y));
        }
        let centroids: Vec<(f32, f32)> = by_lid
            .values()
            .map(|pts| {
                let n = pts.len() as f32;
                let cx = pts.iter().map(|p| p.0).sum::<f32>() / n;
                let cy = pts.iter().map(|p| p.1).sum::<f32>() / n;
                (cx, cy)
            })
            .collect();
        assert!(
            centroids.len() >= 6,
            "seed {seed} only produced {} lineages",
            centroids.len()
        );
        let cxmin = centroids.iter().map(|c| c.0).fold(f32::INFINITY, f32::min);
        let cxmax = centroids.iter().map(|c| c.0).fold(f32::NEG_INFINITY, f32::max);
        let cymin = centroids.iter().map(|c| c.1).fold(f32::INFINITY, f32::min);
        let cymax = centroids.iter().map(|c| c.1).fold(f32::NEG_INFINITY, f32::max);
        assert!(
            cxmax - cxmin >= WIDTH as f32 * 0.30,
            "seed {seed} lineage centroids only {} wide",
            cxmax - cxmin
        );
        assert!(
            cymax - cymin >= HEIGHT as f32 * 0.20,
            "seed {seed} lineage centroids only {} tall",
            cymax - cymin
        );
    }
}

#[test]
fn population_stays_dispersed_after_many_days() {
    for seed in [42u64, 99] {
        let mut sim = Simulation::new(seed);
        for _ in 0..9_000 {
            sim.tick();
        }
        let alive: Vec<_> = sim.organisms.iter().filter(|o| o.alive).collect();
        assert!(
            alive.len() >= 80,
            "seed {seed} population collapsed to {} after 3 days",
            alive.len()
        );

        let n = alive.len() as f32;
        let mx = alive.iter().map(|o| o.x).sum::<f32>() / n;
        let my = alive.iter().map(|o| o.y).sum::<f32>() / n;
        let varx = alive.iter().map(|o| (o.x - mx).powi(2)).sum::<f32>() / n;
        let vary = alive.iter().map(|o| (o.y - my).powi(2)).sum::<f32>() / n;
        let stdx = varx.sqrt();
        let stdy = vary.sqrt();

        // Anti-collapse guard: the world must stay meaningfully spread,
        // not clump to a single point. Threshold kept well below the
        // natural operating point (~0.20 of WIDTH on the test seeds) so
        // it (a) still catches a real collapse — which reads as <0.08 —
        // and (b) tolerates both cross-architecture float drift (arm
        // dev vs x86 CI diverge over 9000 chaotic ticks) and the
        // intended village-clustering from the social-gravitation ticks.
        assert!(
            stdx >= WIDTH as f32 * 0.12,
            "seed {seed} stdx {stdx} too small (clustered) - WIDTH={WIDTH}"
        );
        assert!(
            stdy >= HEIGHT as f32 * 0.08,
            "seed {seed} stdy {stdy} too small (clustered) - HEIGHT={HEIGHT}"
        );
    }
}

#[test]
fn population_does_not_reconverge_after_growth_window() {
    let mut sim = Simulation::new(7);
    for _ in 0..3_000 {
        sim.tick();
    }
    let alive: Vec<_> = sim.organisms.iter().filter(|o| o.alive).collect();
    assert!(
        alive.len() >= 60,
        "population collapsed to {} after growth window",
        alive.len()
    );

    let cw = 60i32;
    let ch = 60i32;
    let mut buckets: rustc_hash::FxHashMap<(i32, i32), u32> = Default::default();
    for o in &alive {
        let cx = (o.x as i32) / cw;
        let cy = (o.y as i32) / ch;
        *buckets.entry((cx, cy)).or_insert(0) += 1;
    }
    let max_bucket = buckets.values().copied().max().unwrap_or(0) as f32;
    let frac = max_bucket / alive.len() as f32;
    assert!(
        frac <= 0.65,
        "after 3k ticks {:.0}% of population sits in a single 60x60 cell ({})",
        frac * 100.0,
        max_bucket as u32
    );
}

/// Friend-seek must respect the 60-tile distance cap. A lonely
/// org with only far-away friends should NOT set a wander_target
/// that pulls them across the map (the one-island attractor bug).
#[test]
fn lonely_org_with_only_distant_friends_stays_put() {
    use crate::organism::organism::{apply_sex_traits, generate_name, Organism, Sex};
    use crate::organism::traits::Traits;
    let mut sim = Simulation::new(0xdef0);
    // Wipe founders so we control the cast.
    sim.organisms.clear();

    // Use a private RNG for the cast rather than `sim.rng`. The shared
    // stream is advanced by `Simulation::new` (and by every id minted during
    // founder spawn), so drawing traits from it made this test's fixture
    // silently change whenever unrelated spawn code consumed a different
    // number of values.
    let mut cast_rng = {
        use rand::SeedableRng;
        rand_chacha::ChaCha8Rng::seed_from_u64(0xdef0)
    };

    // Lonely main org at (50, 50).
    let mut traits = Traits::random(&mut cast_rng);
    apply_sex_traits(&mut traits, Sex::Female);
    let mut me = Organism::new(
        "me-id".into(),
        generate_name(&mut cast_rng, Sex::Female),
        50.0,
        50.0,
        1,
        "".into(),
        "lid-a".into(),
        20_000,
        traits,
    );
    me.alive = true;
    me.sex = Sex::Female;
    me.age = 1500;
    me.energy = 0.8;
    me.loneliness = 0.85;
    // Single named friend at (500, 250) - way past the 60-tile cap.
    me.friends.insert("far-id".into(), "FarFriend".into());
    sim.organisms.push(me);

    let mut friend_traits = Traits::random(&mut cast_rng);
    apply_sex_traits(&mut friend_traits, Sex::Male);
    let mut far = Organism::new(
        "far-id".into(),
        "FarFriend".into(),
        500.0,
        250.0,
        1,
        "".into(),
        "lid-b".into(),
        20_000,
        friend_traits,
    );
    far.alive = true;
    far.sex = Sex::Male;
    far.age = 1500;
    sim.organisms.push(far);

    sim.tick_count = 5_000;

    // Drive the per-org tick to exercise the friend-seek block.
    let alive_count = 2;
    let mut lineage_counts = FxHashMap::default();
    lineage_counts.insert("lid-a".into(), 1);
    lineage_counts.insert("lid-b".into(), 1);
    let spatial = SpatialIndex::build(&sim.organisms, 10);
    let animal_spatial = SpatialIndex::build_animals(&sim.animals, 10);
    let mut buffers = TickBuffers::new();
    let org_idx_by_id: FxHashMap<String, usize> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(_, o)| o.alive)
        .map(|(i, o)| (o.id.clone(), i))
        .collect();
    let mut lineage_members = lineage_member_index(&sim.organisms);
    sim.tick_organism(
        0,
        alive_count,
        &lineage_counts,
        &spatial,
        &animal_spatial,
        &mut buffers,
        &org_idx_by_id,
        &mut lineage_members,
    );

    assert!(
        sim.organisms[0].wander_target.is_none(),
        "lonely org with no in-range friends should NOT walk \
         toward a friend 600 tiles away - wander_target was {:?}",
        sim.organisms[0].wander_target
    );
}

/// And the opposite: a friend WITHIN the 60-tile cap should
/// produce a wander_target pointing at them.
#[test]
fn lonely_org_with_nearby_friend_walks_toward_them() {
    use crate::organism::organism::{apply_sex_traits, generate_name, Organism, Sex};
    use crate::organism::traits::Traits;
    let mut sim = Simulation::new(0xdef1);
    sim.organisms.clear();

    let mut traits = Traits::random(&mut sim.rng);
    apply_sex_traits(&mut traits, Sex::Female);
    let mut me = Organism::new(
        "me-id".into(),
        generate_name(&mut sim.rng, Sex::Female),
        50.0,
        50.0,
        1,
        "".into(),
        "lid-a".into(),
        20_000,
        traits,
    );
    me.alive = true;
    me.sex = Sex::Female;
    me.age = 1500;
    me.energy = 0.8;
    me.loneliness = 0.85;
    me.friends.insert("near-id".into(), "NearFriend".into());
    sim.organisms.push(me);

    let mut friend_traits = Traits::random(&mut sim.rng);
    apply_sex_traits(&mut friend_traits, Sex::Male);
    let mut near = Organism::new(
        "near-id".into(),
        "NearFriend".into(),
        70.0,
        70.0,
        1,
        "".into(),
        "lid-b".into(),
        20_000,
        friend_traits,
    );
    near.alive = true;
    near.sex = Sex::Male;
    near.age = 1500;
    sim.organisms.push(near);

    sim.tick_count = 5_000;

    let mut lineage_counts = FxHashMap::default();
    lineage_counts.insert("lid-a".into(), 1);
    lineage_counts.insert("lid-b".into(), 1);
    let spatial2 = SpatialIndex::build(&sim.organisms, 10);
    let animal_spatial2 = SpatialIndex::build_animals(&sim.animals, 10);
    let mut buffers2 = TickBuffers::new();
    let org_idx_by_id2: FxHashMap<String, usize> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(_, o)| o.alive)
        .map(|(i, o)| (o.id.clone(), i))
        .collect();
    let mut lineage_members = lineage_member_index(&sim.organisms);
    sim.tick_organism(
        0,
        2,
        &lineage_counts,
        &spatial2,
        &animal_spatial2,
        &mut buffers2,
        &org_idx_by_id2,
        &mut lineage_members,
    );

    let wt = sim.organisms[0].wander_target;
    assert!(wt.is_some(), "in-range friend should set wander_target, got None");
    // Should be roughly where NearFriend is.
    if let Some((tx, ty)) = wt {
        assert!(
            (tx - 70).abs() <= 5 && (ty - 70).abs() <= 5,
            "wander_target {:?} should point near (70,70)",
            wt
        );
    }
}

#[test]
fn a_new_tribe_leaves_as_a_band_on_one_journey() {
    let mut sim = Simulation::new(5);
    let founder = sim.organisms.iter().position(|o| o.alive).unwrap();
    let old = sim.organisms[founder].lineage_id.clone();
    let (fx, fy) = (sim.organisms[founder].x, sim.organisms[founder].y);
    let kin: Vec<usize> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|&(i, o)| i != founder && o.alive)
        .map(|(i, _)| i)
        .take(6)
        .collect();
    for (n, &i) in kin.iter().enumerate() {
        let o = &mut sim.organisms[i];
        o.lineage_id = old.clone();
        o.age = 1200;
        o.x = fx + n as f32;
        o.y = fy;
    }
    sim.organisms[founder].age = 1200;

    sim.fork_new_tribe(founder, 40, 40);

    let new = sim.organisms[founder].lineage_id.clone();
    assert_ne!(new, old);
    let band: Vec<_> = sim
        .organisms
        .iter()
        .filter(|o| o.alive && o.lineage_id == new)
        .collect();
    assert_eq!(band.len(), 5, "founder plus four followers");
    for o in band {
        assert_eq!(o.journey.as_ref().map(|j| j.target), Some((40, 40)));
        assert_eq!((o.home_x, o.home_y), (40.0, 40.0));
    }
}
