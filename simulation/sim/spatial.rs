use std::collections::HashMap;
use crate::organism::organism::Organism;

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

    pub fn query(&self, x: i32, y: i32, radius: i32) -> Vec<usize> {
        let bs = self.bucket_size;
        let bx = x / bs;
        let by = y / bs;
        let br = radius / bs + 1;
        let mut result = Vec::new();
        for dy in -br..=br {
            for dx in -br..=br {
                if let Some(bucket) = self.buckets.get(&(bx + dx, by + dy)) {
                    result.extend_from_slice(bucket);
                }
            }
        }
        result
    }
}
