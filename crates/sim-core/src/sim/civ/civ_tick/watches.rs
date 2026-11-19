use super::*;

pub(super) fn tick_plague_watch(sim: &mut Simulation) {
    let mut alive = 0u32;
    let mut sick = 0u32;
    for o in sim.organisms.iter().filter(|o| o.alive) {
        alive += 1;
        if o.infection > 0.3 {
            sick += 1;
        }
    }
    if alive >= 20 && (sick as f32) / (alive as f32) > 0.15 {
        let tick = sim.tick_count;
        let line = format!(
            "\u{1F912} A plague spreads — {} of {} are gravely ill.",
            sick, alive
        );
        push_event(&mut sim.events, tick, "outbreak", "world", &line);
        sim.headlines.push_back((tick, line));
        while sim.headlines.len() > 80 {
            sim.headlines.pop_front();
        }
    }
}
