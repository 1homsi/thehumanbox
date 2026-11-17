use crate::organism::animal::{Animal, AnimalKind, PREDATOR_HUNGRY_ENERGY};

pub(super) const PACK_LINK: f32 = 4.0;
const PACK_SIGHT: f32 = 20.0;
pub(super) const SWITCH_RATIO: f32 = 0.7;

fn hunts(a: &Animal) -> bool {
    a.alive
        && a.kind == AnimalKind::Wolf
        && !a.sleeping
        && !a.away
        && !a.is_kept()
        && a.bonded_org.is_none()
        && (a.energy <= PREDATOR_HUNGRY_ENERGY || a.hunting)
}

fn is_game(a: &Animal, raid: bool) -> bool {
    a.alive && !a.away && !a.sleeping && a.kind.is_prey() && (raid || !a.is_kept())
}

pub(super) fn assign_pack_quarries(animals: &mut [Animal]) {
    let wolves: Vec<usize> = (0..animals.len()).filter(|&i| hunts(&animals[i])).collect();
    let mut previous: Vec<Option<usize>> = Vec::with_capacity(wolves.len());
    for &w in &wolves {
        previous.push(animals[w].pack_quarry.map(|(id, _, _)| id));
    }
    for a in animals.iter_mut() {
        a.pack_quarry = None;
    }

    let mut seen = vec![false; wolves.len()];
    let mut pack: Vec<usize> = Vec::new();
    for start in 0..wolves.len() {
        if seen[start] {
            continue;
        }
        pack.clear();
        pack.push(start);
        seen[start] = true;
        let mut next = 0;
        while next < pack.len() {
            let a = &animals[wolves[pack[next]]];
            for (j, seen_j) in seen.iter_mut().enumerate() {
                let b = &animals[wolves[j]];
                if !*seen_j && (a.x - b.x).abs() + (a.y - b.y).abs() <= PACK_LINK {
                    *seen_j = true;
                    pack.push(j);
                }
            }
            next += 1;
        }
        if pack.len() < 2 {
            continue;
        }
        pack.sort_unstable();

        let n = pack.len() as f32;
        let cx = pack.iter().map(|&p| animals[wolves[p]].x).sum::<f32>() / n;
        let cy = pack.iter().map(|&p| animals[wolves[p]].y).sum::<f32>() / n;
        let raid = pack.iter().all(|&p| animals[wolves[p]].hunting);
        let dist = |a: &Animal| (a.x - cx).abs() + (a.y - cy).abs();

        let best = animals
            .iter()
            .filter(|a| is_game(a, raid))
            .map(|a| (dist(a), a.id, a.x, a.y))
            .filter(|&(d, ..)| d < PACK_SIGHT)
            .min_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)));
        let Some(best) = best else {
            continue;
        };
        let current = pack.iter().filter_map(|&p| previous[p]).find_map(|id| {
            animals
                .iter()
                .find(|a| a.id == id && is_game(a, raid))
                .map(|a| (dist(a), a.id, a.x, a.y))
                .filter(|&(d, ..)| d < PACK_SIGHT)
        });
        let (_, id, x, y) = match current {
            Some(cur) if best.0 >= cur.0 * SWITCH_RATIO => cur,
            _ => best,
        };
        for &p in &pack {
            animals[wolves[p]].pack_quarry = Some((id, x, y));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wolf(id: usize, x: f32, y: f32) -> Animal {
        let mut a = Animal::new(id, x, y, AnimalKind::Wolf);
        a.energy = 0.5;
        a
    }

    fn rabbit(id: usize, x: f32, y: f32) -> Animal {
        Animal::new(id, x, y, AnimalKind::Rabbit)
    }

    #[test]
    fn wolves_in_range_share_one_quarry() {
        let mut animals = vec![
            wolf(1, 100.0, 100.0),
            wolf(2, 103.0, 100.0),
            rabbit(10, 95.0, 100.0),
            rabbit(11, 109.0, 100.0),
        ];
        assign_pack_quarries(&mut animals);
        let q1 = animals[0].pack_quarry.expect("a pack picks a quarry");
        assert_eq!(animals[1].pack_quarry, Some(q1));
        assert_eq!(q1.0, 10);
        assert!(animals[2].pack_quarry.is_none() && animals[3].pack_quarry.is_none());
    }

    #[test]
    fn a_lone_or_fed_wolf_keeps_its_own_hunt() {
        let mut animals = vec![
            wolf(1, 100.0, 100.0),
            wolf(2, 140.0, 100.0),
            rabbit(10, 105.0, 100.0),
        ];
        assign_pack_quarries(&mut animals);
        assert!(animals[0].pack_quarry.is_none() && animals[1].pack_quarry.is_none());

        let mut animals = vec![
            wolf(1, 100.0, 100.0),
            wolf(2, 102.0, 100.0),
            rabbit(10, 105.0, 100.0),
        ];
        animals[1].energy = 1.0;
        assign_pack_quarries(&mut animals);
        assert!(
            animals[0].pack_quarry.is_none(),
            "a fed wolf does not hunt, so no pack"
        );
    }

    #[test]
    fn a_pack_keeps_its_quarry_until_another_is_clearly_nearer() {
        let mut animals = vec![
            wolf(1, 100.0, 100.0),
            wolf(2, 102.0, 100.0),
            rabbit(10, 111.0, 100.0),
        ];
        assign_pack_quarries(&mut animals);
        assert_eq!(animals[0].pack_quarry.map(|q| q.0), Some(10));

        animals.push(rabbit(11, 93.0, 100.0));
        assign_pack_quarries(&mut animals);
        assert_eq!(animals[0].pack_quarry.map(|q| q.0), Some(10));
        assert_eq!(animals[1].pack_quarry.map(|q| q.0), Some(10));

        animals.push(rabbit(12, 98.0, 100.0));
        assign_pack_quarries(&mut animals);
        assert_eq!(animals[0].pack_quarry.map(|q| q.0), Some(12));
        assert_eq!(animals[1].pack_quarry.map(|q| q.0), Some(12));

        animals[4].alive = false;
        assign_pack_quarries(&mut animals);
        assert_eq!(animals[0].pack_quarry.map(|q| q.0), Some(11));
    }

    #[test]
    fn packs_join_by_chains() {
        let mut animals = vec![
            wolf(1, 100.0, 100.0),
            wolf(2, 104.0, 100.0),
            wolf(3, 108.0, 100.0),
            rabbit(10, 112.0, 100.0),
        ];
        assign_pack_quarries(&mut animals);
        let q = animals[0].pack_quarry;
        assert!(q.is_some());
        assert_eq!(animals[1].pack_quarry, q);
        assert_eq!(animals[2].pack_quarry, q);
    }
}
