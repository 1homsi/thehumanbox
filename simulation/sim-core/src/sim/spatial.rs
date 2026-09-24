use crate::organism::animal::Animal;
use crate::organism::organism::Organism;
use std::collections::HashMap;

pub struct SpatialIndex {
    buckets: HashMap<(i32, i32), Vec<usize>>,
    bucket_size: i32,
}

impl SpatialIndex {
    pub fn build(organisms: &[Organism], bucket_size: i32) -> Self {
        let mut buckets: HashMap<(i32, i32), Vec<usize>> = HashMap::with_capacity(organisms.len() / 4 + 8);
        for (i, org) in organisms.iter().enumerate() {
            if !org.alive {
                continue;
            }
            let key = (org.x as i32 / bucket_size, org.y as i32 / bucket_size);
            buckets.entry(key).or_default().push(i);
        }
        Self { buckets, bucket_size }
    }

    pub fn build_animals(animals: &[Animal], bucket_size: i32) -> Self {
        let mut buckets: HashMap<(i32, i32), Vec<usize>> = HashMap::with_capacity(animals.len() / 4 + 8);
        for (i, a) in animals.iter().enumerate() {
            if !a.alive {
                continue;
            }
            let key = (a.x as i32 / bucket_size, a.y as i32 / bucket_size);
            buckets.entry(key).or_default().push(i);
        }
        Self { buckets, bucket_size }
    }

    /// Population-ordered candidates including one tick of movement padding.
    /// Callers retain their exact current-position and state predicates.
    pub fn ordered_nearby<'a>(
        &self,
        organisms: &'a [Organism],
        x: f32,
        y: f32,
        radius: i32,
    ) -> impl Iterator<Item = (usize, &'a Organism)> {
        let mut candidates = self.query(x as i32, y as i32, radius + 2);
        candidates.sort_unstable();
        candidates.into_iter().map(move |i| (i, &organisms[i]))
    }

    pub fn query(&self, x: i32, y: i32, radius: i32) -> Vec<usize> {
        let mut out = Vec::new();
        self.query_into(x, y, radius, &mut out);
        out
    }

    /// Allocation-free query - caller owns the Vec, we just clear + extend.
    /// Cuts ~7 fresh Vec<usize> allocations per organism per tick at
    /// 10 Hz × 200 orgs, which adds up.
    pub fn query_into(&self, x: i32, y: i32, radius: i32, out: &mut Vec<usize>) {
        out.clear();
        let bs = self.bucket_size;
        let bx = x / bs;
        let by = y / bs;
        let br = radius / bs + 1;
        for dy in -br..=br {
            for dx in -br..=br {
                if let Some(bucket) = self.buckets.get(&(bx + dx, by + dy)) {
                    out.extend_from_slice(bucket);
                }
            }
        }
    }
}

/// Preserve the old population-order first match. The index is built before
/// movement, so allow a previous resident's one-tile diagonal step (L1 = 2),
/// then apply the exact radius to current positions.
pub(crate) fn first_unknown_nearby_lineage(
    organisms: &[Organism],
    idx: usize,
    spatial: &SpatialIndex,
    candidates: &mut Vec<usize>,
) -> Option<String> {
    let org = &organisms[idx];
    spatial.query_into(org.x as i32, org.y as i32, 7, candidates);
    candidates.sort_unstable();
    candidates
        .iter()
        .map(|&i| &organisms[i])
        .find(|other| {
            other.alive
                && other.lineage_id != org.lineage_id
                && (other.x - org.x).abs() + (other.y - org.y).abs() <= 5.0
                && !org.lineage_attitudes.contains_key(&other.lineage_id)
        })
        .map(|other| other.lineage_id.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organism::traits::Traits;
    fn person(id: usize, x: f32, y: f32) -> Organism {
        let mut org = Organism::new(
            format!("org-{id}"),
            "resident".into(),
            x,
            y,
            1,
            String::new(),
            format!("lineage-{id}"),
            10000,
            Traits::default(),
        );
        org.x = x;
        org.y = y;
        org
    }
    #[test]
    fn first_contact_matches_full_scan_across_bucket_boundaries_and_movement() {
        let mut people: Vec<_> = (0..100)
            .map(|i| person(i, (i % 10 * 3) as f32, (i / 10 * 3) as f32))
            .collect();
        let index = SpatialIndex::build(&people, 10);
        for (i, p) in people.iter_mut().enumerate() {
            p.x += if i % 2 == 0 { 1.0 } else { -1.0 };
            p.y += if i % 3 == 0 { 1.0 } else { -1.0 };
            p.alive = i % 11 != 0;
            p.lineage_attitudes.insert("lineage-1".into(), 0.5);
        }
        let mut buf = Vec::new();
        for i in 0..people.len() {
            let org = &people[i];
            let expected = people
                .iter()
                .find(|p| {
                    p.alive
                        && p.lineage_id != org.lineage_id
                        && (p.x - org.x).abs() + (p.y - org.y).abs() <= 5.0
                        && !org.lineage_attitudes.contains_key(&p.lineage_id)
                })
                .map(|p| p.lineage_id.clone());
            assert_eq!(
                first_unknown_nearby_lineage(&people, i, &index, &mut buf),
                expected
            );
        }
    }
    #[test]
    fn ordered_local_queries_match_population_scan_after_diagonal_steps() {
        let mut people: Vec<_> = (0..100)
            .map(|i| person(i, (i % 10 * 3) as f32, (i / 10 * 3) as f32))
            .collect();
        let index = SpatialIndex::build(&people, 10);
        for (i, p) in people.iter_mut().enumerate() {
            p.x += if i % 2 == 0 { 1.0 } else { -1.0 };
            p.y += if i % 3 == 0 { 1.0 } else { -1.0 };
            p.alive = i % 11 != 0;
        }
        for org in &people {
            for radius in 3..=8 {
                let eligible =
                    |p: &Organism| p.alive && (p.x - org.x).abs() + (p.y - org.y).abs() <= radius as f32;
                let expected: Vec<_> = people
                    .iter()
                    .enumerate()
                    .filter(|(_, p)| eligible(p))
                    .map(|(i, _)| i)
                    .collect();
                let actual: Vec<_> = index
                    .ordered_nearby(&people, org.x, org.y, radius)
                    .filter(|(_, p)| eligible(p))
                    .map(|(i, _)| i)
                    .collect();
                assert_eq!(actual, expected);
            }
        }
    }

    #[test]
    fn distant_population_is_not_scanned_for_first_contact() {
        let mut people = vec![person(0, 10.0, 10.0)];
        people.extend((1..5000).map(|i| person(i, 500.0, 200.0)));
        let index = SpatialIndex::build(&people, 10);
        let mut buf = Vec::new();
        assert_eq!(first_unknown_nearby_lineage(&people, 0, &index, &mut buf), None);
        assert_eq!(buf.len(), 1);
    }
}
