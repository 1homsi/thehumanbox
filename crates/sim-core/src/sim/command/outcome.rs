//! What a command did, sent back to the client so its status line can say so
//! ("healed 3 people", "no one to revive here") instead of only "applied".
//!
//! A handler records its result with `Simulation::report`. Handlers that do not
//! report get the generic `applied` or `failed` code.

use super::Simulation;

/// A handler's own note on what it did. `code` is a fixed word the client maps to a sentence.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Report {
    pub code: &'static str,
    pub count: u32,
    pub name: Option<String>,
}

/// The result of one command, as the client receives it.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
pub struct CommandOutcome {
    /// Whether the command changed the world (the same answer `apply_command` gives).
    pub applied: bool,
    /// What happened: a result code such as `healed`, `none_hurt` or `revived`, or `applied` / `failed`.
    pub code: &'static str,
    /// How many people or animals it touched, where that makes sense.
    pub count: u32,
    /// The one person it touched, when it touched exactly one.
    pub name: Option<String>,
}

impl CommandOutcome {
    pub(crate) fn failed() -> Self {
        Self {
            applied: false,
            code: "failed",
            count: 0,
            name: None,
        }
    }
}

impl Simulation {
    /// Record what the command in progress did. The last report wins.
    pub(crate) fn report(&mut self, code: &'static str, count: u32, name: Option<&str>) {
        self.command_report = Some(Report {
            code,
            count,
            name: name.map(str::to_owned),
        });
    }

    /// Reports a result that touched `count` people. `name` is the person's name, given only when
    /// exactly one was touched; nobody touched reports `none_here`.
    pub(crate) fn report_people(&mut self, code: &'static str, count: u32, name: Option<&str>) {
        if count == 0 {
            self.report("none_here", 0, None);
        } else {
            self.report(code, count, if count == 1 { name } else { None });
        }
    }
}
