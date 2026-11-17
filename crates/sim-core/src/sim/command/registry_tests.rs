use super::registry::{lookup, ALIASES, COMMANDS};
use super::Command;
use crate::sim::simulation::Simulation;
use serde_json::Value;
use std::collections::HashSet;

const DOCK_COMMANDS: &str = include_str!("dock_commands.json");

const SENT_OUTSIDE_THE_DOCK: &[(&str, &str)] = &[
    ("set_difficulty", "the goals dialog"),
    ("teach", "the tribe card"),
    ("rename_tribe", "the tribe card"),
    ("rename_person", "the rename form"),
    ("guide", "the tribe card"),
];

fn dock_commands() -> Vec<Value> {
    let entries: Vec<Value> = serde_json::from_str(DOCK_COMMANDS).expect("dock_commands.json reads");
    entries.into_iter().map(|e| e["cmd"].clone()).collect()
}

#[test]
fn every_command_id_is_registered_once() {
    let ids: Vec<&str> = COMMANDS.iter().map(|spec| spec.id).collect();
    let unique: HashSet<&str> = ids.iter().copied().collect();
    assert_eq!(
        unique.len(),
        ids.len(),
        "a command id is registered twice: {ids:?}"
    );
    for spec in COMMANDS {
        assert_eq!(lookup(spec.id).map(|found| found.id), Some(spec.id));
    }
}

#[test]
fn every_dock_command_parses_to_the_handler_its_name_selects() {
    for json in dock_commands() {
        let name = json["cmd"].as_str().expect("cmd is a name");
        let cmd: Command = serde_json::from_value(json.clone()).expect("dock command parses");
        let spec = lookup(name).unwrap_or_else(|| panic!("{name} has no handler"));
        assert_eq!(cmd.id(), spec.id, "{json}");
    }
}

#[test]
fn aliases_parse_to_the_command_they_name() {
    let samples = [
        r#"{"cmd":"time_of_day","phase":"dawn"}"#,
        r#"{"cmd":"set_strategy","lineage":"a","strategy":"trade"}"#,
    ];
    for ((alias, id), json) in ALIASES.iter().zip(samples) {
        assert!(json.contains(alias));
        let cmd: Command = serde_json::from_str(json).expect("alias parses");
        assert_eq!(cmd.id(), *id);
        assert_eq!(lookup(alias).map(|spec| spec.id), Some(*id));
    }
}

#[test]
fn every_registered_command_is_sent_by_the_dock_or_named_here() {
    let dock: HashSet<&'static str> = dock_commands()
        .iter()
        .map(|json| lookup(json["cmd"].as_str().unwrap()).expect("registered").id)
        .collect();
    let outside: HashSet<&str> = SENT_OUTSIDE_THE_DOCK.iter().map(|(id, _)| *id).collect();
    for spec in COMMANDS {
        assert!(
            dock.contains(spec.id) != outside.contains(spec.id),
            "{} must be either in dock_commands.json or in SENT_OUTSIDE_THE_DOCK, not both or neither",
            spec.id
        );
    }
    assert_eq!(COMMANDS.len(), dock.len() + outside.len());
    for id in outside {
        assert!(lookup(id).is_some(), "{id} is not a registered command");
    }
}

#[test]
fn an_unknown_command_changes_nothing() {
    assert!(lookup("no_such_command").is_none());
    let mut sim = Simulation::new(5);
    let before = serde_json::to_vec(&sim.to_save_state()).unwrap();
    let outcome = sim.apply_command_json_reported(r#"{"cmd":"no_such_command","x":1,"y":1}"#);
    assert!(!outcome.applied);
    assert_eq!(serde_json::to_vec(&sim.to_save_state()).unwrap(), before);
}
