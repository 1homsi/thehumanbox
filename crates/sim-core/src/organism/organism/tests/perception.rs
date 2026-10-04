//! The perception key and remembered resources.

use super::*;

#[test]
fn remembered_resource_selection_avoids_known_danger() {
    let mut water = FxHashMap::default();
    water.insert((80, 5), 1.0);
    water.insert((40, 5), 0.55);
    let mut danger = FxHashMap::default();
    danger.insert((80, 5), 0.9);

    let target = Organism::best_remembered_with_danger(&water, 5.0, 5.0, &danger, 0.8);

    assert_eq!(target, Some((40, 5)));
}

#[test]
fn remembered_resource_selection_still_uses_strong_safe_memory() {
    let mut food = FxHashMap::default();
    food.insert((80, 5), 1.0);
    food.insert((40, 5), 0.55);
    let danger = FxHashMap::default();

    let target = Organism::best_remembered_with_danger(&food, 5.0, 5.0, &danger, 0.8);

    assert_eq!(target, Some((80, 5)));
}

#[test]
fn perception_encodes_remembered_resource_direction() {
    let mut rng = StdRng::seed_from_u64(0);
    let traits = Traits::random(&mut rng);
    let grid = WorldGrid::new(3);
    let spatial = crate::sim::spatial::SpatialIndex::build(&[], 10);
    let mut org = Organism::new(
        "id".into(),
        "Rememberer".into(),
        50.0,
        50.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        traits,
    );
    org.energy = 0.30;
    org.food_memory.insert((80, 50), 0.8);

    let perception = org.perceive(&grid, &[], false, false, &spatial);

    assert_eq!(perception.chars().nth(2), Some('X'), "no visible food");
    assert_eq!(perception.chars().nth(4), Some('E'), "remembered food is east");
}

#[test]
fn perception_ignores_dangerous_remembered_resource() {
    let mut rng = StdRng::seed_from_u64(0);
    let traits = Traits::random(&mut rng);
    let grid = WorldGrid::new(4);
    let spatial = crate::sim::spatial::SpatialIndex::build(&[], 10);
    let mut org = Organism::new(
        "id".into(),
        "Cautious".into(),
        50.0,
        50.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        traits,
    );
    org.energy = 0.30;
    org.food_memory.insert((80, 50), 0.9);
    org.danger_memory.insert((80, 50), 0.9);

    assert_eq!(
        Organism::best_remembered_with_danger(&org.food_memory, org.x, org.y, &org.danger_memory, 0.5),
        None
    );

    let perception = org.perceive(&grid, &[], false, false, &spatial);

    assert_eq!(perception.chars().nth(4), Some('X'), "{perception}");
}

#[test]
fn perception_encodes_carried_food_and_water_reserves() {
    let mut rng = StdRng::seed_from_u64(0);
    let traits = Traits::random(&mut rng);
    let grid = WorldGrid::new(5);
    let spatial = crate::sim::spatial::SpatialIndex::build(&[], 10);
    let mut org = Organism::new(
        "id".into(),
        "Prepared".into(),
        50.0,
        50.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        traits,
    );
    org.inv_food = 3;
    org.inv_water = 1;

    let perception = org.perceive(&grid, &[], false, false, &spatial);

    assert_eq!(perception.chars().nth(16), Some('2'), "stocked food reserve");
    assert_eq!(perception.chars().nth(17), Some('1'), "light water reserve");
}

#[test]
fn shared_perception_query_preserves_social_and_attitude_fields() {
    use crate::sim::spatial::SpatialIndex;

    fn previous_fields(
        actor: &Organism,
        people: &[Organism],
        spatial: &SpatialIndex,
        scan: i32,
    ) -> (char, char, char) {
        let mut nearby = Vec::new();
        spatial.query_into(actor.x as i32, actor.y as i32, 5, &mut nearby);
        let mut org_near = false;
        let mut kin_near = false;
        for &index in &nearby {
            let other = &people[index];
            if std::ptr::eq(other, actor) || !other.alive {
                continue;
            }
            if (other.x - actor.x).abs() + (other.y - actor.y).abs() <= 5.0 {
                org_near = true;
                if other.lineage_id == actor.lineage_id {
                    kin_near = true;
                    break;
                }
            }
        }

        spatial.query_into(actor.x as i32, actor.y as i32, scan, &mut nearby);
        let mut nearest: Option<&str> = None;
        let mut nearest_distance = 999.0f32;
        for &index in &nearby {
            let other = &people[index];
            if std::ptr::eq(other, actor) || !other.alive || other.lineage_id == actor.lineage_id {
                continue;
            }
            let distance = (other.x - actor.x).abs() + (other.y - actor.y).abs();
            if distance < nearest_distance {
                nearest_distance = distance;
                nearest = Some(&other.lineage_id);
            }
        }
        let attitude = match nearest {
            Some(lineage) if nearest_distance <= scan as f32 => {
                let value = actor.attitude_toward(lineage);
                if value >= 0.25 {
                    'A'
                } else if value <= -0.25 {
                    'H'
                } else {
                    'N'
                }
            }
            _ => 'X',
        };
        (
            if org_near { '1' } else { '0' },
            if kin_near { '1' } else { '0' },
            attitude,
        )
    }

    let grid = WorldGrid::new(0x5a11);
    let mut reusable = Vec::new();
    for shift in [0.0, 3.0, 10.0] {
        let positions = [
            (49.5, 49.5, "home", true),
            (54.0, 49.5, "home", true),
            (56.0, 49.5, "ally", true),
            (49.5, 57.0, "enemy", true),
            (50.0, 50.0, "enemy", false),
            (42.0, 49.5, "neutral", true),
            (65.0, 65.0, "enemy", true),
        ];
        let mut people: Vec<Organism> = positions
            .iter()
            .enumerate()
            .map(|(index, &(x, y, lineage, alive))| {
                let mut person = Organism::new(
                    format!("resident-{index}"),
                    "Resident".into(),
                    x + shift,
                    y + shift,
                    1,
                    String::new(),
                    lineage.into(),
                    10_000,
                    Traits::default(),
                );
                person.x = x + shift;
                person.y = y + shift;
                person.alive = alive;
                person
            })
            .collect();
        people[0].lineage_attitudes.insert("ally".into(), 0.8);
        people[0].lineage_attitudes.insert("enemy".into(), -0.8);

        for bucket_size in [3, 5, 10, 16] {
            let spatial = SpatialIndex::build(&people, bucket_size);
            for (night, curiosity, scan) in [(false, 0.2, 8), (true, 0.2, 6), (true, 0.8, 8)] {
                people[0].traits.curiosity = curiosity;
                let expected = previous_fields(&people[0], &people, &spatial, scan);
                let fresh = people[0].perceive(&grid, &people, night, false, &spatial);
                reusable.push(usize::MAX);
                let perception =
                    people[0].perceive_into(&grid, &people, night, false, &spatial, &mut reusable);
                assert_eq!(perception, fresh);
                assert!(!reusable.contains(&usize::MAX));
                let fields: Vec<char> = perception.chars().collect();
                assert_eq!(
                    (fields[7], fields[10], fields[11]),
                    expected,
                    "shift={shift}, bucket={bucket_size}, night={night}"
                );
            }
        }
    }
}
