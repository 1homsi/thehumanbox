use std::collections::BTreeSet;
use std::ops::Deref;

/// 256 distinct band discovery names; `actions::resolved` asserts this holds.
pub const DISCOVERY_MASK_WORDS: usize = 4;
pub type DiscoveryMask = [u64; DISCOVERY_MASK_WORDS];

/// Discoveries that the per-tick body, mood and hunting code asks about by
/// name for every organism every tick. Looking each one up in the ordered
/// set costs a string comparison per tree level, so `Discoveries` keeps one
/// bit per name here and [`Discoveries::has`] reads the bit instead.
macro_rules! hot_discoveries {
    ($($variant:ident => $name:literal),+ $(,)?) => {
        #[derive(Clone, Copy, Debug, PartialEq, Eq)]
        #[repr(u8)]
        pub enum Hot {
            $($variant),+
        }

        /// Names indexed by [`Hot`]; the bit of a name is its index here.
        const HOT_NAMES: &[&str] = &[$($name),+];

        impl Hot {
            #[cfg(test)]
            const ALL: &'static [Hot] = &[$(Hot::$variant),+];

            /// The discovery name this bit stands for.
            #[cfg(test)]
            fn name(self) -> &'static str {
                HOT_NAMES[self as usize]
            }
        }
    };
}

hot_discoveries! {
    AnimalHides => "animal_hides",
    Borders => "borders",
    Cartography => "cartography",
    FoodPreservation => "food_preservation",
    Herbalism => "herbalism",
    Leatherwork => "leatherwork",
    Masonry => "masonry",
    Ritual => "ritual",
    RitualDance => "ritual_dance",
    SaltHarvesting => "salt_harvesting",
    StarCharts => "star_charts",
    Territory => "territory",
    Textiles => "textiles",
    Torch => "torch",
    Trap => "trap",
    Medicine => "medicine",
}

/// What an organism has discovered. Reads go through `Deref` to the ordered
/// set; writes go through the methods here so a bit mask of the names that
/// action gates care about stays in step. Eligibility checks run for every
/// organism every tick and use the mask instead of looking each name up.
/// A second, smaller mask covers the names in [`Hot`].
#[derive(Clone, Debug, Default)]
pub struct Discoveries {
    set: BTreeSet<String>,
    mask: DiscoveryMask,
    hot: u64,
}

impl Discoveries {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn mask(&self) -> &DiscoveryMask {
        &self.mask
    }

    /// Whether a name from [`Hot`] is known; the same answer as `contains`
    /// on its name, without walking the ordered set.
    #[inline]
    pub fn has(&self, name: Hot) -> bool {
        self.hot & (1 << name as u8) != 0
    }

    fn hot_bit(name: &str) -> Option<u32> {
        HOT_NAMES
            .iter()
            .position(|hot| *hot == name)
            .map(|bit| bit as u32)
    }

    pub fn insert(&mut self, name: String) -> bool {
        let bit = crate::sim::actions::discovery_bit(&name);
        let hot = Self::hot_bit(&name);
        let inserted = self.set.insert(name);
        if let Some(bit) = bit {
            self.mask[bit / 64] |= 1 << (bit % 64);
        }
        if let Some(bit) = hot {
            self.hot |= 1 << bit;
        }
        inserted
    }

    pub fn remove(&mut self, name: &str) -> bool {
        let removed = self.set.remove(name);
        if removed {
            if let Some(bit) = crate::sim::actions::discovery_bit(name) {
                self.mask[bit / 64] &= !(1 << (bit % 64));
            }
            if let Some(bit) = Self::hot_bit(name) {
                self.hot &= !(1 << bit);
            }
        }
        removed
    }

    pub fn clear(&mut self) {
        self.set.clear();
        self.mask = DiscoveryMask::default();
        self.hot = 0;
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

    /// The bit for every hot name must agree with an ordered-set lookup of
    /// the same name after any mix of inserts, removals and clears.
    #[test]
    fn hot_bits_match_set_lookups_through_every_change() {
        let agrees = |discoveries: &Discoveries| {
            for &hot in Hot::ALL {
                assert_eq!(
                    discoveries.has(hot),
                    discoveries.contains(hot.name()),
                    "{} disagrees",
                    hot.name()
                );
            }
        };
        let mut discoveries = Discoveries::new();
        agrees(&discoveries);
        // Cheap deterministic shuffle over every hot name plus unrelated ones.
        let mut names: Vec<&str> = Hot::ALL.iter().map(|hot| hot.name()).collect();
        names.extend(["foraging", "pottery", "fire", "not-a-band-discovery"]);
        let mut state = 0x2545_F491_4F6C_DD1Du64;
        for _ in 0..2000 {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            let name = names[(state >> 8) as usize % names.len()];
            match (state >> 40) % 8 {
                0..=3 => {
                    discoveries.insert(name.to_string());
                }
                4..=6 => {
                    discoveries.remove(name);
                }
                _ => {
                    if (state >> 50).is_multiple_of(16) {
                        discoveries.clear();
                    }
                }
            }
            agrees(&discoveries);
        }
        let rebuilt: Discoveries = discoveries.iter().cloned().collect();
        agrees(&rebuilt);
        agrees(&discoveries.clone());
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
