//! What a command did, sent back to the client so its status line can say so
//! ("healed 3 people", "no one to revive here") instead of only "applied".
//!
//! A handler records its result with `Simulation::report`. Handlers that do not
//! report get the generic `applied` or `failed` code.

use super::{Command, Simulation};

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

/// The people and buildings a disaster could hit, as they were just before it, so the report after it
/// can say whom it hit rather than only that it happened.
pub(crate) struct DisasterBefore {
    /// Index into `organisms`, with health, infection and stored food, for everyone alive.
    people: Vec<(usize, f32, f32, u8)>,
    /// Building id, damage and whether it already lay in ruins.
    buildings: Vec<(u32, f32, bool)>,
    /// Where the disaster lands and how far it reaches, when it lands somewhere.
    area: Option<(f32, f32, f32)>,
    /// Whether its handler's own report is the one to keep (smite and thunder name whom they struck).
    own_report: bool,
}

/// How far a nuke's own reach counts for the report (its crater and fallout reach further).
const NUKE_REACH: f32 = 8.0;

/// The tools that harm the world, where each lands and how far it reaches, as its handler works it out
/// (a radius of 0 means the handler's own default). `Some(None)` is a disaster with no one place (a
/// plague breaking out); `None` is any other command. Tornado, tsunami and locusts move along a path,
/// so their reach is only the fallback when nothing changed.
fn disaster_area(cmd: &Command) -> Option<Option<(f32, f32, f32)>> {
    let or = |radius: i32, default: i32, max: i32| if radius <= 0 { default } else { radius.min(max) } as f32;
    let orf = |radius: f32, default: f32, max: f32| if radius <= 0.0 { default } else { radius.min(max) };
    let at = |x: f32, y: f32, r: f32| Some(Some((x, y, r.max(1.0))));
    match *cmd {
        Command::Hail { x, y, radius } => at(x as f32, y as f32, radius.clamp(2, 24) as f32),
        Command::Freeze { x, y, radius } => at(x as f32, y as f32, or(radius, 4, 24)),
        Command::Ignite { x, y, radius } => at(x as f32, y as f32, radius.clamp(1, 21) as f32),
        Command::Earthquake { x, y, radius } => at(x as f32, y as f32, or(radius, 5, 16)),
        Command::Meteor { x, y, radius } => at(x as f32, y as f32, or(radius, 4, 12)),
        Command::Blight { x, y, radius } => at(x as f32, y as f32, or(radius, 5, 24)),
        Command::Flood { x, y, radius } => at(x as f32, y as f32, or(radius, 4, 20)),
        Command::Blizzard { x, y, radius } => at(x as f32, y as f32, or(radius, 6, 24)),
        Command::Volcano { x, y, radius } => at(x as f32, y as f32, or(radius, 6, 12)),
        Command::Tornado { x, y, radius } => at(x as f32, y as f32, radius.clamp(4, 24) as f32),
        Command::Tsunami { x, y, radius } => at(x as f32, y as f32, radius.clamp(4, 24) as f32),
        Command::Locusts { x, y, radius } => at(x as f32, y as f32, radius.clamp(6, 30) as f32),
        Command::Wildfire { x, y, radius } => at(x as f32, y as f32, radius.clamp(4, 20) as f32),
        Command::Smite { x, y, radius } | Command::Thunder { x, y, radius } => at(x, y, radius),
        Command::Poison { x, y, radius } => at(x, y, orf(radius, 3.0, 32.0)),
        Command::Frenzy { x, y, radius } => at(x, y, orf(radius, 4.0, 24.0)),
        Command::MeteorShower { x, y, radius } => at(x, y, orf(radius, 10.0, 40.0)),
        Command::Nuke { x, y } => at(x as f32, y as f32, NUKE_REACH),
        Command::Outbreak { .. } => Some(None),
        _ => None,
    }
}

impl Simulation {
    /// The state a disaster command will be judged against, or None for a command that is not one.
    pub(crate) fn disaster_before(&self, cmd: &Command) -> Option<DisasterBefore> {
        let area = disaster_area(cmd)?;
        Some(DisasterBefore {
            people: self
                .organisms
                .iter()
                .enumerate()
                .filter(|(_, o)| o.alive)
                .map(|(i, o)| (i, o.health, o.infection, o.inv_food))
                .collect(),
            buildings: self
                .buildings
                .iter()
                .filter(|b| !b.decorative)
                .map(|b| (b.id, b.damage, b.is_ruined()))
                .collect(),
            area,
            own_report: matches!(cmd, Command::Smite { .. } | Command::Thunder { .. }),
        })
    }

    /// Says whom a disaster hit: the people it killed, else those it hurt, else those it made sick,
    /// else those it took food from, else the buildings it damaged, else (for one that takes time, like
    /// a spreading fire or rising water) the people in its reach, else that nobody was in its way.
    /// Smite and thunder keep their own report; for the rest any report a nested strike left (a tornado
    /// smites each tile it crosses) is replaced by the whole disaster's count.
    pub(crate) fn report_disaster(&mut self, before: DisasterBefore) {
        if before.own_report && self.command_report.is_some() {
            return;
        }
        let (mut killed, mut hurt, mut sick, mut robbed) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
        for &(i, health, infection, food) in &before.people {
            let Some(o) = self.organisms.get(i) else { continue };
            // A handler can leave someone at no health for the next tick to bury: that is a death.
            if !o.alive || (health > 0.0 && o.health <= 0.0) {
                killed.push(i);
            } else if o.health < health - 0.001 {
                hurt.push(i);
            } else if o.infection > infection + 0.001 {
                sick.push(i);
            } else if o.inv_food < food {
                robbed.push(i);
            }
        }
        let name_of =
            |sim: &Simulation, list: &[usize]| (list.len() == 1).then(|| sim.organisms[list[0]].name.clone());
        for (code, list) in [
            ("disaster_killed", &killed),
            ("disaster_hurt", &hurt),
            ("disaster_sick", &sick),
            ("disaster_food", &robbed),
        ] {
            if !list.is_empty() {
                let name = name_of(self, list);
                return self.report(code, list.len() as u32, name.as_deref());
            }
        }
        let damaged = before
            .buildings
            .iter()
            .filter(|&&(id, damage, ruined)| {
                self.buildings
                    .iter()
                    .find(|b| b.id == id)
                    .is_none_or(|b| b.damage > damage + 0.001 || (b.is_ruined() && !ruined))
            })
            .count();
        if damaged > 0 {
            return self.report("disaster_buildings", damaged as u32, None);
        }
        let in_reach: Vec<usize> = match before.area {
            Some((x, y, r)) => self
                .organisms
                .iter()
                .enumerate()
                .filter(|(_, o)| o.alive && (o.x - x).hypot(o.y - y) <= r)
                .map(|(i, _)| i)
                .collect(),
            None => Vec::new(),
        };
        if !in_reach.is_empty() {
            let name = name_of(self, &in_reach);
            return self.report("disaster_in_reach", in_reach.len() as u32, name.as_deref());
        }
        self.report("disaster_none", 0, None);
    }
}
