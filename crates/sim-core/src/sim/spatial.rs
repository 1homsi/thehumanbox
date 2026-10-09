use crate::hashing::FxHashMap as HashMap;
use crate::organism::animal::Animal;
use crate::organism::organism::Organism;

/// More buckets than any real world needs (600x300 tiles in 10-tile buckets is
/// 1,800); beyond this a sparse map is used instead of a dense grid.
const MAX_DENSE_BUCKETS: i64 = 1 << 16;

pub struct SpatialIndex {
    buckets: Buckets,
    bucket_size: i32,
}

enum Buckets {
    /// Bucket `(kx, ky)` holds `items[starts[i]..starts[i + 1]]` with
    /// `i = (ky - min_y) * width + (kx - min_x)`; members are in ascending
    /// index order, as pushed during the build.
    Dense {
        min_x: i32,
        min_y: i32,
        width: i32,
        height: i32,
        starts: Vec<u32>,
        items: Vec<usize>,
    },
    Sparse(HashMap<(i32, i32), Vec<usize>>),
}

impl SpatialIndex {
    pub fn build(organisms: &[Organism], bucket_size: i32) -> Self {
        Self::from_points(
            organisms
                .iter()
                .enumerate()
                .filter(|(_, org)| org.alive)
                .map(|(i, org)| (i, org.x as i32 / bucket_size, org.y as i32 / bucket_size)),
            organisms.len(),
            bucket_size,
        )
    }

    pub fn build_animals(animals: &[Animal], bucket_size: i32) -> Self {
        Self::from_points(
            animals
                .iter()
                .enumerate()
                .filter(|(_, a)| a.alive)
                .map(|(i, a)| (i, a.x as i32 / bucket_size, a.y as i32 / bucket_size)),
            animals.len(),
            bucket_size,
        )
    }

    /// `points` are `(index, bucket x, bucket y)` in ascending index order.
    fn from_points(
        points: impl Iterator<Item = (usize, i32, i32)> + Clone,
        capacity: usize,
        bucket_size: i32,
    ) -> Self {
        let (mut min_x, mut min_y, mut max_x, mut max_y) = (i32::MAX, i32::MAX, i32::MIN, i32::MIN);
        let mut count = 0usize;
        for (_, kx, ky) in points.clone() {
            min_x = min_x.min(kx);
            max_x = max_x.max(kx);
            min_y = min_y.min(ky);
            max_y = max_y.max(ky);
            count += 1;
        }
        if count == 0 {
            return Self {
                buckets: Buckets::Dense {
                    min_x: 0,
                    min_y: 0,
                    width: 0,
                    height: 0,
                    starts: vec![0],
                    items: Vec::new(),
                },
                bucket_size,
            };
        }
        let width = i64::from(max_x) - i64::from(min_x) + 1;
        let height = i64::from(max_y) - i64::from(min_y) + 1;
        if width * height > MAX_DENSE_BUCKETS {
            let mut buckets: HashMap<(i32, i32), Vec<usize>> =
                HashMap::with_capacity_and_hasher(capacity / 4 + 8, Default::default());
            for (i, kx, ky) in points {
                buckets.entry((kx, ky)).or_default().push(i);
            }
            return Self {
                buckets: Buckets::Sparse(buckets),
                bucket_size,
            };
        }
        let cell = |kx: i32, ky: i32| ((ky - min_y) as i64 * width + i64::from(kx - min_x)) as usize;
        // Counting sort: sizes, then offsets, then members in index order.
        let mut starts = vec![0u32; (width * height) as usize + 1];
        for (_, kx, ky) in points.clone() {
            starts[cell(kx, ky) + 1] += 1;
        }
        for i in 1..starts.len() {
            starts[i] += starts[i - 1];
        }
        let mut fill = starts.clone();
        let mut items = vec![0usize; count];
        for (i, kx, ky) in points {
            let slot = &mut fill[cell(kx, ky)];
            items[*slot as usize] = i;
            *slot += 1;
        }
        Self {
            buckets: Buckets::Dense {
                min_x,
                min_y,
                width: width as i32,
                height: height as i32,
                starts,
                items,
            },
            bucket_size,
        }
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
        match &self.buckets {
            Buckets::Dense {
                min_x,
                min_y,
                width,
                height,
                starts,
                items,
            } => {
                // A row of buckets is contiguous, so each row is one slice.
                let first_x = (bx - br).max(*min_x);
                let last_x = (bx + br).min(min_x + width - 1);
                if first_x > last_x {
                    return;
                }
                for ky in (by - br).max(*min_y)..=(by + br).min(min_y + height - 1) {
                    let row = (ky - min_y) * width - min_x;
                    let from = starts[(row + first_x) as usize] as usize;
                    let to = starts[(row + last_x) as usize + 1] as usize;
                    out.extend_from_slice(&items[from..to]);
                }
            }
            Buckets::Sparse(buckets) => {
                for dy in -br..=br {
                    for dx in -br..=br {
                        if let Some(bucket) = buckets.get(&(bx + dx, by + dy)) {
                            out.extend_from_slice(bucket);
                        }
                    }
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
    // The lowest population index that qualifies; no need to sort to find it.
    let mut first: Option<usize> = None;
    for &i in candidates.iter() {
        if first.is_some_and(|best| best < i) {
            continue;
        }
        let other = &organisms[i];
        if (other.x - org.x).abs() + (other.y - org.y).abs() <= 5.0
            && other.alive
            && other.lineage_id != org.lineage_id
            && !org.lineage_attitudes.contains_key(&other.lineage_id)
        {
            first = Some(i);
        }
    }
    first.map(|i| organisms[i].lineage_id.clone())
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

    /// The bucket walk this index replaced: a hash map of buckets, probed in
    /// row-major order.
    fn reference_query(people: &[Organism], bucket_size: i32, x: i32, y: i32, radius: i32) -> Vec<usize> {
        let mut buckets: HashMap<(i32, i32), Vec<usize>> = HashMap::default();
        for (i, org) in people.iter().enumerate().filter(|(_, o)| o.alive) {
            buckets
                .entry((org.x as i32 / bucket_size, org.y as i32 / bucket_size))
                .or_default()
                .push(i);
        }
        let (bx, by, br) = (x / bucket_size, y / bucket_size, radius / bucket_size + 1);
        let mut out = Vec::new();
        for dy in -br..=br {
            for dx in -br..=br {
                if let Some(bucket) = buckets.get(&(bx + dx, by + dy)) {
                    out.extend_from_slice(bucket);
                }
            }
        }
        out
    }

    #[test]
    fn dense_and_sparse_layouts_answer_like_the_hash_map_walk() {
        let mut state = 0x2545_f491_4f6c_dd1du64;
        let mut next = move |modulus: u64| {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            state % modulus
        };
        // Ordinary world, a world with a stray far-away resident (sparse),
        // and one with negative coordinates.
        for (count, span, outlier, offset) in [
            (300, 600u64, false, 0.0),
            (300, 600, true, 0.0),
            (200, 400, false, -150.0),
        ] {
            let mut people: Vec<_> = (0..count)
                .map(|i| person(i, next(span) as f32 + offset, next(span / 2) as f32 + offset))
                .collect();
            if outlier {
                people[7].x = 90_000.0;
                people[7].y = -70_000.0;
            }
            for (i, p) in people.iter_mut().enumerate() {
                p.alive = i % 9 != 0;
            }
            for bucket_size in [10, 7] {
                let index = SpatialIndex::build(&people, bucket_size);
                assert_eq!(matches!(index.buckets, Buckets::Sparse(_)), outlier);
                for _ in 0..400 {
                    let (x, y) = (next(700) as i32 - 50, next(400) as i32 - 50);
                    let radius = next(12) as i32;
                    assert_eq!(
                        index.query(x, y, radius),
                        reference_query(&people, bucket_size, x, y, radius),
                        "bucket {bucket_size} at ({x}, {y}) radius {radius}"
                    );
                }
            }
        }
        let empty = SpatialIndex::build(&[], 10);
        assert!(empty.query(5, 5, 6).is_empty());
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
