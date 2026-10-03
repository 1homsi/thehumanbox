use std::collections::BTreeSet;
use std::ops::Deref;

/// 256 distinct band discovery names; `actions::resolved` asserts this holds.
pub const DISCOVERY_MASK_WORDS: usize = 4;
pub type DiscoveryMask = [u64; DISCOVERY_MASK_WORDS];

/// What an organism has discovered. Reads go through `Deref` to the ordered
/// set; writes go through the methods here so a bit mask of the names that
/// action gates care about stays in step. Eligibility checks run for every
/// organism every tick and use the mask instead of looking each name up.
#[derive(Clone, Debug, Default)]
pub struct Discoveries {
    set: BTreeSet<String>,
    mask: DiscoveryMask,
}

impl Discoveries {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn mask(&self) -> &DiscoveryMask {
        &self.mask
    }

    pub fn insert(&mut self, name: String) -> bool {
        let bit = crate::sim::actions::discovery_bit(&name);
        let inserted = self.set.insert(name);
        if let Some(bit) = bit {
            self.mask[bit / 64] |= 1 << (bit % 64);
        }
        inserted
    }

    pub fn remove(&mut self, name: &str) -> bool {
        let removed = self.set.remove(name);
        if removed {
            if let Some(bit) = crate::sim::actions::discovery_bit(name) {
                self.mask[bit / 64] &= !(1 << (bit % 64));
            }
        }
        removed
    }

    pub fn clear(&mut self) {
        self.set.clear();
        self.mask = DiscoveryMask::default();
    }
}

impl Deref for Discoveries {
    type Target = BTreeSet<String>;

    fn deref(&self) -> &BTreeSet<String> {
        &self.set
    }
}

impl serde::Serialize for Discoveries {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.set.serialize(serializer)
    }
}

impl FromIterator<String> for Discoveries {
    fn from_iter<I: IntoIterator<Item = String>>(iter: I) -> Self {
        let mut discoveries = Self::new();
        for name in iter {
            discoveries.insert(name);
        }
        discoveries
    }
}

impl<'a> IntoIterator for &'a Discoveries {
    type Item = &'a String;
    type IntoIter = std::collections::btree_set::Iter<'a, String>;

    fn into_iter(self) -> Self::IntoIter {
        self.set.iter()
    }
}

impl Extend<String> for Discoveries {
    fn extend<I: IntoIterator<Item = String>>(&mut self, iter: I) {
        for name in iter {
            self.insert(name);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn recomputed(discoveries: &Discoveries) -> DiscoveryMask {
        let mut mask = DiscoveryMask::default();
        for name in discoveries.iter() {
            if let Some(bit) = crate::sim::actions::discovery_bit(name) {
                mask[bit / 64] |= 1 << (bit % 64);
            }
        }
        mask
    }

    #[test]
    fn the_mask_follows_every_kind_of_change() {
        let mut discoveries = Discoveries::new();
        assert_eq!(*discoveries.mask(), DiscoveryMask::default());

        discoveries.insert("foraging".to_string());
        discoveries.insert("not-a-band-discovery".to_string());
        discoveries.extend(["pottery".to_string(), "dog".to_string()]);
        assert_eq!(*discoveries.mask(), recomputed(&discoveries));
        assert!(discoveries.mask().iter().any(|word| *word != 0));

        assert!(discoveries.remove("pottery"));
        assert!(!discoveries.remove("pottery"));
        assert_eq!(*discoveries.mask(), recomputed(&discoveries));

        let rebuilt: Discoveries = discoveries.iter().cloned().collect();
        assert_eq!(rebuilt.mask(), discoveries.mask());

        discoveries.clear();
        assert_eq!(*discoveries.mask(), DiscoveryMask::default());
        assert!(discoveries.is_empty());
    }
}
