//! Family names: children take their father's, derived names are stable.

use super::*;

fn person(id: &str, surname: &str) -> Organism {
    let mut rng = StdRng::seed_from_u64(7);
    let mut o = Organism::new(
        id.into(),
        "Ama".into(),
        0.0,
        0.0,
        0,
        String::new(),
        "lin".into(),
        9000,
        Traits::random(&mut rng),
    );
    o.surname = surname.into();
    o
}

#[test]
fn derived_surnames_are_stable_capitalised_and_varied() {
    assert_eq!(surname_for_id("abc"), surname_for_id("abc"));
    let name = surname_for_id("abc");
    assert!(name.chars().next().unwrap().is_uppercase());
    assert!(name.len() >= 4);
    let distinct: std::collections::HashSet<String> =
        (0..300).map(|i| surname_for_id(&format!("person{i}"))).collect();
    assert!(
        distinct.len() > 150,
        "only {} distinct surnames in 300 people",
        distinct.len()
    );
}

#[test]
fn a_child_takes_the_fathers_family_name() {
    let mother = person("mum", "Tavaki");
    let father = person("dad", "Osuri");
    assert_eq!(child_surname(Some(&father), &mother), "Osuri");
}

#[test]
fn a_child_of_an_unknown_father_takes_the_mothers_name() {
    let mother = person("mum", "Tavaki");
    assert_eq!(child_surname(None, &mother), "Tavaki");
}

#[test]
fn people_without_a_surname_get_one_from_their_id() {
    let plain = person("ghost", "");
    assert_eq!(plain.family_name(), surname_for_id("ghost"));
    assert_eq!(person("ghost", "Lunde").family_name(), "Lunde");
}

#[test]
fn the_surname_reaches_the_wire_view() {
    let o = person("kid", "Osuri");
    let json = o.to_json_value_with(true);
    assert_eq!(json.get("surname").and_then(|v| v.as_str()), Some("Osuri"));
}
