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
    Axe => "axe",
    Borders => "borders",
    Cartography => "cartography",
    FoodPreservation => "food_preservation",
    Forestry => "forestry",
    Herbalism => "herbalism",
    Knife => "knife",
    Leatherwork => "leatherwork",
    Masonry => "masonry",
    Ritual => "ritual",
    RitualDance => "ritual_dance",
    SaltHarvesting => "salt_harvesting",
    Spear => "spear",
    StarCharts => "star_charts",
    StoneTools => "stone_tools",
    Territory => "territory",
    Textiles => "textiles",
    ToolMaking => "tool_making",
    Torch => "torch",
    Trap => "trap",
    Medicine => "medicine",
    Farm => "farm",
    Cooking => "cooking",
    Antibiotics => "antibiotics",
    Alchemy => "alchemy",
    MedicineLore => "medicine_lore",
    Poultice => "poultice",
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
    known: Vec<u64>,
}

#[derive(Clone, Copy)]
struct NameInfo {
    id: u32,
    mask: Option<u16>,
    hot: Option<u8>,
}

struct Names {
    by_name: crate::hashing::FxHashMap<&'static str, NameInfo>,
    names: Vec<&'static str>,
}

fn names() -> &'static std::sync::Mutex<Names> {
    static NAMES: std::sync::OnceLock<std::sync::Mutex<Names>> = std::sync::OnceLock::new();
    NAMES.get_or_init(|| {
        std::sync::Mutex::new(Names {
            by_name: Default::default(),
            names: Vec::new(),
        })
    })
}

fn lock_names() -> std::sync::MutexGuard<'static, Names> {
    names().lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn name_info(name: &str) -> NameInfo {
    if let Some(&info) = lock_names().by_name.get(name) {
        return info;
    }
    let mask = crate::sim::actions::discovery_bit(name).map(|bit| bit as u16);
    let hot = HOT_NAMES.iter().position(|hot| *hot == name).map(|bit| bit as u8);
    let mut table = lock_names();
    if let Some(&info) = table.by_name.get(name) {
        return info;
    }
    let shared: &'static str = Box::leak(name.to_owned().into_boxed_str());
    let info = NameInfo {
        id: table.names.len() as u32,
        mask,
        hot,
    };
    table.names.push(shared);
    table.by_name.insert(shared, info);
    info
}

pub fn discovery_id(name: &str) -> u32 {
    name_info(name).id
}

pub fn discovery_name(id: u32) -> &'static str {
    lock_names().names[id as usize]
}

pub fn known_ids(bits: &[u64]) -> impl Iterator<Item = u32> + '_ {
    bits.iter().enumerate().flat_map(|(word, &w)| {
        let mut rest = w;
        std::iter::from_fn(move || {
            if rest == 0 {
                return None;
            }
            let bit = rest.trailing_zeros();
            rest &= rest - 1;
            Some(word as u32 * 64 + bit)
        })
    })
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

    pub fn insert(&mut self, name: String) -> bool {
        let info = name_info(&name);
        let inserted = self.set.insert(name);
        if let Some(bit) = info.mask {
            self.mask[bit as usize / 64] |= 1 << (bit % 64);
        }
        if let Some(bit) = info.hot {
            self.hot |= 1 << bit;
        }
        let word = info.id as usize / 64;
        if self.known.len() <= word {
            self.known.resize(word + 1, 0);
        }
        self.known[word] |= 1 << (info.id % 64);
        inserted
    }

    pub fn remove(&mut self, name: &str) -> bool {
        let removed = self.set.remove(name);
        if removed {
            let info = name_info(name);
            if let Some(bit) = info.mask {
                self.mask[bit as usize / 64] &= !(1 << (bit % 64));
            }
            if let Some(bit) = info.hot {
                self.hot &= !(1 << bit);
            }
            self.known[info.id as usize / 64] &= !(1 << (info.id % 64));
        }
        removed
    }

    pub fn clear(&mut self) {
        self.set.clear();
        self.mask = DiscoveryMask::default();
        self.hot = 0;
        self.known.clear();
    }

    pub fn known(&self) -> &[u64] {
        &self.known
    }

    #[inline]
    pub fn has_id(&self, id: u32) -> bool {
        self.known
            .get(id as usize / 64)
            .is_some_and(|word| word & (1 << (id % 64)) != 0)
    }

    pub fn knows_all_of(&self, other: &Discoveries) -> bool {
        other
            .known
            .iter()
            .enumerate()
            .all(|(i, &theirs)| theirs & !self.known.get(i).copied().unwrap_or(0) == 0)
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
                let id = discovery_id(hot.name());
                assert_eq!(discoveries.has_id(id), discoveries.contains(hot.name()));
                assert_eq!(discovery_name(id), hot.name());
            }
            for name in ["foraging", "pottery", "fire", "not-a-band-discovery"] {
                assert_eq!(discoveries.has_id(discovery_id(name)), discoveries.contains(name));
            }
            let listed: Vec<&str> = known_ids(discoveries.known()).map(discovery_name).collect();
            let mut listed = listed;
            listed.sort_unstable();
            assert!(listed.iter().copied().eq(discoveries.iter().map(String::as_str)));
            assert!(discoveries.knows_all_of(&discoveries.iter().cloned().collect()));
            assert!(Discoveries::new().knows_all_of(discoveries) == discoveries.is_empty());
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
