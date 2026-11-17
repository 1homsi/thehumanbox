use crate::hashing::FxHashMap;

use super::organism::Organism;

pub struct PeopleIndex<'a> {
    by_id: FxHashMap<&'a str, usize>,
    by_lineage: FxHashMap<&'a str, Vec<usize>>,
}

impl<'a> PeopleIndex<'a> {
    pub fn build(organisms: &'a [Organism]) -> Option<Self> {
        let mut by_id: FxHashMap<&'a str, usize> =
            FxHashMap::with_capacity_and_hasher(organisms.len(), Default::default());
        let mut by_lineage: FxHashMap<&'a str, Vec<usize>> = FxHashMap::default();
        for (i, o) in organisms.iter().enumerate() {
            if !o.alive {
                continue;
            }
            if by_id.insert(o.id.as_str(), i).is_some() {
                return None;
            }
            by_lineage.entry(o.lineage_id.as_str()).or_default().push(i);
        }
        Some(Self { by_id, by_lineage })
    }

    pub fn alive_with_id(&self, id: &str) -> Option<usize> {
        self.by_id.get(id).copied()
    }

    pub fn kin(&self, lineage_id: &str) -> &[usize] {
        self.by_lineage.get(lineage_id).map_or(&[], Vec::as_slice)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organism::traits::Traits;

    fn person(id: &str, lineage: &str, alive: bool) -> Organism {
        let mut o = Organism::new(
            id.into(),
            "Resident".into(),
            1.0,
            1.0,
            1,
            String::new(),
            lineage.into(),
            5000,
            Traits::default(),
        );
        o.alive = alive;
        o
    }

    #[test]
    fn lists_the_living_in_population_order() {
        let people = vec![
            person("a", "x", true),
            person("b", "y", true),
            person("c", "x", false),
            person("d", "x", true),
            person("c", "y", true),
        ];
        let index = PeopleIndex::build(&people).expect("ids are unique among the living");
        assert_eq!(index.kin("x"), &[0, 3]);
        assert_eq!(index.kin("y"), &[1, 4]);
        assert!(index.kin("z").is_empty());
        assert_eq!(index.alive_with_id("c"), Some(4));
        assert_eq!(index.alive_with_id("e"), None);
    }

    #[test]
    fn declines_when_two_living_people_share_an_id() {
        let people = vec![person("a", "x", true), person("a", "y", true)];
        assert!(PeopleIndex::build(&people).is_none());
    }
}
