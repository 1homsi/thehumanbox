use std::collections::HashMap;
use crate::organism::organism::Organism;
use crate::organism::animal::Animal;

pub struct SpatialIndex {
    buckets:     HashMap<(i32, i32), Vec<usize>>,
    bucket_size: i32,
}

impl SpatialIndex {
    pub fn build(organisms: &[Organism], bucket_size: i32) -> Self {
        let mut buckets: HashMap<(i32, i32), Vec<usize>> = HashMap::new();
        for (i, org) in organisms.iter().enumerate() {
            if !org.alive { continue; }
            let key = (org.x as i32 / bucket_size, org.y as i32 / bucket_size);
            buckets.entry(key).or_default().push(i);
        }
        Self { buckets, bucket_size }
    }

    pub fn build_animals(animals: &[Animal], bucket_size: i32) -> Self {
        let mut buckets: HashMap<(i32, i32), Vec<usize>> = HashMap::new();
        for (i, a) in animals.iter().enumerate() {
            if !a.alive { continue; }
            let key = (a.x as i32 / bucket_size, a.y as i32 / bucket_size);
            buckets.entry(key).or_default().push(i);
        }
        Self { buckets, bucket_size }
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
