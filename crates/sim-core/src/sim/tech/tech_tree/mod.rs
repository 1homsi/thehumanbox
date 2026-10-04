//! The technology table: every discovery, its era, what it needs, what it opens
//! and how readily it is found.
//!
//! The table is split by era span into child modules; `TECH` joins them, in
//! this order, into one slice. The order matters: discovery rolls walk the
//! table front to back and draw from the shared RNG per candidate.

use crate::sim::era::Era;

mod ancient;
mod branches;
mod cosmic;
mod historic;
mod near_future;
#[cfg(test)]
mod reachability_tests;

#[derive(Clone, Copy)]
pub struct TechNode {
    pub name: &'static str,
    pub era: Era,
    pub prerequisites: &'static [&'static str],
    pub unlocks: &'static [&'static str],
    pub discovery_rate: f32,
}

const PARTS: [&[TechNode]; 5] = [
    ancient::ANCIENT,
    historic::HISTORIC,
    near_future::NEAR_FUTURE,
    cosmic::COSMIC,
    branches::BRANCHES,
];

const COUNT: usize = {
    let mut total = 0;
    let mut part = 0;
    while part < PARTS.len() {
        total += PARTS[part].len();
        part += 1;
    }
    total
};

const fn assemble() -> [TechNode; COUNT] {
    let mut table = [PARTS[0][0]; COUNT];
    let mut next = 0;
    let mut part = 0;
    while part < PARTS.len() {
        let mut node = 0;
        while node < PARTS[part].len() {
            table[next] = PARTS[part][node];
            next += 1;
            node += 1;
        }
        part += 1;
    }
    table
}

static TECH: [TechNode; COUNT] = assemble();

pub fn all_tech() -> &'static [TechNode] {
    &TECH
}
