//! What a person's family called common things, for the person panel: their
//! own word beside their parents' and grandparents' words, so drift shows
//! inside one family. Read only: nothing here changes the world.

use std::collections::BTreeMap;

use serde::Serialize;

use super::organism::Organism;

/// The everyday things the panel compares a family's words for. Kept short:
/// the panel asks again every few seconds while it is open.
pub const FAMILY_WORD_CONCEPTS: &[&str] = &[
    "food", "water", "fire", "home", "friend", "sun", "river", "danger",
];

/// One relative in a person's word history.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct FamilyWordsJson {
    pub id: String,
    /// The name they go by. Empty when `remembered` is false.
    pub name: String,
    /// Whether they are alive. Only meaningful when `remembered` is true.
    pub alive: bool,
    /// Whose words these are: `mother`, `father`, or a grandparent on one
    /// side, such as `maternal_grandmother` (the mother's mother).
    pub relation: &'static str,
    /// False when the link is known but the relative's record is gone (it was
    /// archived away). Their own parents are then unknown and not listed.
    pub remembered: bool,
    /// Their words for `FAMILY_WORD_CONCEPTS` that they know, by concept.
    pub vocabulary: BTreeMap<String, String>,
}

/// The parents of `org`, and each parent's parents, with their words.
/// Mothers come before fathers; each parent's relatives follow that parent.
pub fn family_words(org: &Organism, organisms: &[Organism]) -> Vec<FamilyWordsJson> {
    let find = |id: &str| organisms.iter().find(|o| o.id == id);
    let parents = [
        (
            non_empty(&org.parent_id),
            "mother",
            "maternal_grandmother",
            "maternal_grandfather",
        ),
        (
            org.father_id.as_deref().and_then(non_empty),
            "father",
            "paternal_grandmother",
            "paternal_grandfather",
        ),
    ];
    let mut out = Vec::new();
    for (parent_id, relation, grandmother, grandfather) in parents {
        let Some(parent_id) = parent_id else { continue };
        let parent = find(parent_id);
        out.push(entry(parent_id, relation, parent));
        let Some(parent) = parent else { continue };
        if let Some(id) = non_empty(&parent.parent_id) {
            out.push(entry(id, grandmother, find(id)));
        }
        if let Some(id) = parent.father_id.as_deref().and_then(non_empty) {
            out.push(entry(id, grandfather, find(id)));
        }
    }
    out
}

fn non_empty(id: &str) -> Option<&str> {
    (!id.is_empty()).then_some(id)
}

fn entry(id: &str, relation: &'static str, found: Option<&Organism>) -> FamilyWordsJson {
    match found {
        Some(o) => FamilyWordsJson {
            id: o.id.clone(),
            name: o
                .custom_name
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .unwrap_or(&o.name)
                .to_string(),
            alive: o.alive,
            relation,
            remembered: true,
            vocabulary: FAMILY_WORD_CONCEPTS
                .iter()
                .filter_map(|&concept| {
                    o.vocabulary
                        .known_word(concept)
                        .map(|word| (concept.to_string(), word.to_string()))
                })
                .collect(),
        },
        None => FamilyWordsJson {
            id: id.to_string(),
            name: String::new(),
            alive: false,
            relation,
            remembered: false,
            vocabulary: BTreeMap::new(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hashing::FxHashMap;
    use crate::organism::traits::Traits;
    use crate::organism::vocabulary::Vocabulary;
    use rand::rngs::StdRng;
    use rand::SeedableRng;

    fn person(
        id: &str,
        name: &str,
        parent_id: &str,
        father_id: Option<&str>,
        words: &[(&str, &str)],
    ) -> Organism {
        let mut rng = StdRng::seed_from_u64(7);
        let mut o = Organism::new(
            id.into(),
            name.into(),
            0.0,
            0.0,
            0,
            parent_id.into(),
            "lin".into(),
            5000,
            Traits::random(&mut rng),
        );
        o.father_id = father_id.map(str::to_string);
        let map: FxHashMap<String, String> = words
            .iter()
            .map(|(c, w)| (c.to_string(), w.to_string()))
            .collect();
        o.vocabulary = Vocabulary::from_hashmap(&map);
        o
    }

    fn relations(rows: &[FamilyWordsJson]) -> Vec<&'static str> {
        rows.iter().map(|r| r.relation).collect()
    }

    #[test]
    fn lists_both_parents_and_all_four_grandparents_with_their_words() {
        let child = person("c", "Ora", "m", Some("f"), &[("food", "ula")]);
        let mother = person("m", "Vesi", "mm", Some("mf"), &[("food", "ula"), ("water", "pi")]);
        let father = person("f", "Ketu", "fm", Some("ff"), &[("food", "ko")]);
        let mm = person("mm", "Nari", "", None, &[("food", "ula")]);
        let mf = person("mf", "Sotu", "", None, &[("food", "tek")]);
        let fm = person("fm", "Eloa", "", None, &[("food", "ko")]);
        let ff = person("ff", "Dobo", "", None, &[("food", "ko")]);
        let all = [child, mother, father, mm, mf, fm, ff];

        let rows = family_words(&all[0], &all);

        assert_eq!(
            relations(&rows),
            vec![
                "mother",
                "maternal_grandmother",
                "maternal_grandfather",
                "father",
                "paternal_grandmother",
                "paternal_grandfather",
            ]
        );
        assert!(rows.iter().all(|r| r.remembered));
        assert_eq!(rows[0].name, "Vesi");
        assert_eq!(rows[0].vocabulary.get("water").map(String::as_str), Some("pi"));
        assert_eq!(rows[2].vocabulary.get("food").map(String::as_str), Some("tek"));
    }

    #[test]
    fn an_archived_parent_is_listed_as_not_remembered_with_no_relatives() {
        let child = person("c", "Ora", "m", Some("f"), &[]);
        let father = person("f", "Ketu", "", None, &[("food", "ko")]);

        let people = [child, father];
        let rows = family_words(&people[0], &people);

        assert_eq!(relations(&rows), vec!["mother", "father"]);
        assert!(!rows[0].remembered);
        assert!(rows[0].name.is_empty());
        assert!(rows[0].vocabulary.is_empty());
        assert!(rows[1].remembered);
    }

    #[test]
    fn a_remembered_parent_whose_own_parents_are_archived_lists_only_the_parent() {
        let child = person("c", "Ora", "m", None, &[]);
        let mother = person("m", "Vesi", "gone", None, &[("food", "ula")]);

        let people = [child, mother];
        let rows = family_words(&people[0], &people);

        assert_eq!(relations(&rows), vec!["mother", "maternal_grandmother"]);
        assert!(rows[0].remembered);
        assert!(!rows[1].remembered);
    }

    #[test]
    fn a_person_with_no_parents_has_no_family_words() {
        let child = person("c", "Ora", "", None, &[("food", "ula")]);
        let people = [child];
        assert!(family_words(&people[0], &people).is_empty());
    }

    #[test]
    fn only_the_common_concepts_are_sent_and_a_custom_name_is_used() {
        let child = person("c", "Ora", "m", None, &[]);
        let mut mother = person("m", "Vesi", "", None, &[("food", "ula"), ("grief", "mo")]);
        mother.custom_name = Some("  Auntie  ".into());

        let people = [child, mother];
        let rows = family_words(&people[0], &people);

        assert_eq!(rows[0].name, "Auntie");
        let keys: Vec<&str> = rows[0].vocabulary.keys().map(String::as_str).collect();
        assert_eq!(keys, vec!["food"]);
    }
}
