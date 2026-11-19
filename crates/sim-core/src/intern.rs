use crate::hashing::FxHashSet;
use std::borrow::Borrow;
use std::cmp::Ordering;
use std::fmt;
use std::hash::{Hash, Hasher};
use std::ops::Deref;
use std::sync::{Mutex, OnceLock};

#[derive(Clone, Copy)]
pub struct Sym(&'static str);

fn table() -> &'static Mutex<FxHashSet<&'static str>> {
    static TABLE: OnceLock<Mutex<FxHashSet<&'static str>>> = OnceLock::new();
    TABLE.get_or_init(|| Mutex::new(FxHashSet::default()))
}

impl Sym {
    pub fn new(text: &str) -> Self {
        let mut table = table().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(&shared) = table.get(text) {
            return Sym(shared);
        }
        let shared: &'static str = Box::leak(text.to_owned().into_boxed_str());
        table.insert(shared);
        Sym(shared)
    }

    pub fn as_str(&self) -> &'static str {
        self.0
    }
}

impl Default for Sym {
    fn default() -> Self {
        Sym::new("")
    }
}

impl Deref for Sym {
    type Target = str;
    fn deref(&self) -> &str {
        self.0
    }
}

impl AsRef<str> for Sym {
    fn as_ref(&self) -> &str {
        self.0
    }
}

impl Borrow<str> for Sym {
    fn borrow(&self) -> &str {
        self.0
    }
}

impl PartialEq for Sym {
    #[inline]
    fn eq(&self, other: &Sym) -> bool {
        std::ptr::eq(self.0, other.0)
    }
}

impl Eq for Sym {}

impl PartialEq<str> for Sym {
    #[inline]
    fn eq(&self, other: &str) -> bool {
        std::ptr::eq(self.0, other) || self.0 == other
    }
}

impl PartialEq<&str> for Sym {
    #[inline]
    fn eq(&self, other: &&str) -> bool {
        *self == **other
    }
}

impl PartialEq<String> for Sym {
    fn eq(&self, other: &String) -> bool {
        self.0 == other.as_str()
    }
}

impl PartialEq<Sym> for str {
    #[inline]
    fn eq(&self, other: &Sym) -> bool {
        *other == *self
    }
}

impl PartialEq<Sym> for &str {
    #[inline]
    fn eq(&self, other: &Sym) -> bool {
        *other == **self
    }
}

impl PartialEq<Sym> for String {
    fn eq(&self, other: &Sym) -> bool {
        self.as_str() == other.0
    }
}

impl PartialOrd for Sym {
    fn partial_cmp(&self, other: &Sym) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Sym {
    #[inline]
    fn cmp(&self, other: &Sym) -> Ordering {
        if self == other {
            Ordering::Equal
        } else {
            self.0.cmp(other.0)
        }
    }
}

impl PartialOrd<String> for Sym {
    fn partial_cmp(&self, other: &String) -> Option<Ordering> {
        Some(self.0.cmp(other.as_str()))
    }
}

impl PartialOrd<Sym> for String {
    fn partial_cmp(&self, other: &Sym) -> Option<Ordering> {
        Some(self.as_str().cmp(other.0))
    }
}

impl Hash for Sym {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.0.hash(state)
    }
}

impl fmt::Display for Sym {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(self.0, f)
    }
}

impl fmt::Debug for Sym {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(self.0, f)
    }
}

impl From<&str> for Sym {
    fn from(text: &str) -> Self {
        Sym::new(text)
    }
}

impl From<&String> for Sym {
    fn from(text: &String) -> Self {
        Sym::new(text)
    }
}

impl From<String> for Sym {
    fn from(text: String) -> Self {
        Sym::new(&text)
    }
}

impl From<Sym> for String {
    fn from(name: Sym) -> Self {
        name.0.to_owned()
    }
}

impl serde::Serialize for Sym {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.0)
    }
}

impl<'de> serde::Deserialize<'de> for Sym {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let text = std::borrow::Cow::<'de, str>::deserialize(deserializer)?;
        Ok(Sym::new(&text))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::{BTreeMap, BTreeSet};

    #[test]
    fn equal_text_gives_the_same_name() {
        let a = Sym::new("lineage-7");
        let b = Sym::from(String::from("lineage-7"));
        assert_eq!(a, b);
        assert!(std::ptr::eq(a.as_str(), b.as_str()));
        assert_ne!(a, Sym::new("lineage-70"));
        assert_eq!(a, "lineage-7");
        assert_eq!(a, String::from("lineage-7"));
        assert_eq!(Sym::default(), Sym::new(""));
    }

    #[test]
    fn names_sort_and_hash_like_their_text() {
        let texts = ["b", "a", "lineage-10", "lineage-9", "", "Z", "lineage-1"];
        let by_text: BTreeSet<String> = texts.iter().map(|t| t.to_string()).collect();
        let by_name: BTreeSet<Sym> = texts.iter().map(|t| Sym::new(t)).collect();
        assert!(by_text
            .iter()
            .map(String::as_str)
            .eq(by_name.iter().map(Sym::as_str)));
        let map: BTreeMap<Sym, usize> = texts.iter().enumerate().map(|(i, t)| (Sym::new(t), i)).collect();
        assert_eq!(map.get("lineage-9"), Some(&3));
        let hash = |h: &dyn Fn(&mut crate::hashing::FxHasher)| {
            let mut s = crate::hashing::FxHasher::default();
            h(&mut s);
            s.finish()
        };
        for t in texts {
            assert_eq!(hash(&|s| Sym::new(t).hash(s)), hash(&|s| t.hash(s)));
            assert_eq!(hash(&|s| Sym::new(t).hash(s)), hash(&|s| t.to_string().hash(s)));
        }
    }

    #[test]
    fn names_round_trip_as_plain_text() {
        let name = Sym::new("lineage-42");
        let json = serde_json::to_string(&name).unwrap();
        assert_eq!(json, "\"lineage-42\"");
        let back: Sym = serde_json::from_str(&json).unwrap();
        assert_eq!(back, name);
        let packed = rmp_serde::to_vec(&name).unwrap();
        assert_eq!(packed, rmp_serde::to_vec("lineage-42").unwrap());
        let back: Sym = rmp_serde::from_slice(&packed).unwrap();
        assert_eq!(back, name);
    }
}
