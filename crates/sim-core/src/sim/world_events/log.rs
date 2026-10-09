pub(super) const MAX_RECENT_EVENTS: usize = 600;

pub fn is_news(etype: &str) -> bool {
    matches!(
        etype,
        "prayer"
            | "answered"
            | "forsaken"
            | "outbreak"
            | "building_ruined"
            | "meteor"
            | "era"
            | "era_advance"
            | "disease_death"
            | "smite"
            | "war_declared"
            | "battle"
            | "treaty"
            | "weather"
            | "drought"
            | "milestone"
            | "eruption"
            | "danger"
            | "theft"
            | "murder"
    )
}

pub fn push_event(
    events: &mut std::collections::VecDeque<crate::sim::simulation::Event>,
    tick: u64,
    etype: &str,
    actor: &str,
    detail: &str,
) {
    events.push_back(crate::sim::simulation::Event {
        tick,
        etype: etype.to_string(),
        actor: actor.to_string(),
        detail: detail.to_string(),
        news: is_news(etype),
    });
    if events.len() > MAX_RECENT_EVENTS {
        // Everyday chatter makes room first, so prayers, ruins, plagues and
        // new ages stay in the log long after the small talk has scrolled
        // away. If the log is all news, the oldest goes.
        let chatter = events
            .iter()
            .take(MAX_RECENT_EVENTS / 2)
            .position(|e| !is_news(&e.etype));
        match chatter {
            Some(i) => {
                events.remove(i);
            }
            None => {
                events.pop_front();
            }
        }
    }
}
