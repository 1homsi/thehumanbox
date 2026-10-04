use super::*;
use std::collections::VecDeque;

#[test]
fn news_is_flagged_on_the_event_itself() {
    let mut events = std::collections::VecDeque::new();
    push_event(&mut events, 1, "prayer", "a tribe", "prays for rain");
    push_event(&mut events, 2, "died", "someone", "old age");
    assert!(events[0].news);
    assert!(!events[1].news);
    let json = serde_json::to_value(&events[1]).unwrap();
    assert!(json.get("news").is_none(), "chatter carries no flag on the wire");
}

#[test]
fn recent_events_keep_enough_context_for_debugging() {
    let mut events = VecDeque::new();
    for i in 0..40 {
        push_event(&mut events, i, "test", "world", "event");
    }

    assert_eq!(events.len(), 40);
    assert_eq!(events.front().unwrap().tick, 0);
}

#[test]
fn drought_never_dries_ocean_or_border() {
    use crate::world::grid::{WorldGrid, HEIGHT, WIDTH};
    use rand::SeedableRng;
    let mut grid = WorldGrid::new(42);
    let mut drought = DroughtState::default();
    let mut history = super::super::simulation::History::default();
    let mut events = VecDeque::new();
    let mut rng = rand::rngs::StdRng::seed_from_u64(7);

    for _ in 0..40 {
        start_drought(&mut drought, &mut grid, 0, &mut history, &mut events, &mut rng);
        end_drought(&mut drought, &mut grid, 0, &mut events);
    }

    for y in 0..HEIGHT as i32 {
        for x in 0..WIDTH as i32 {
            if WorldGrid::is_edge_border(x, y) {
                assert_eq!(grid.get(x, y), Tile::Water, "border tile ({x},{y}) was dried");
            }
        }
    }
}

#[test]
fn news_outlasts_a_flood_of_everyday_chatter() {
    let mut events = std::collections::VecDeque::new();
    push_event(&mut events, 1, "prayer", "Ashari", "pray for food");
    for t in 0..5_000 {
        push_event(&mut events, t, "social", "someone", "said hello");
    }
    assert_eq!(events.len(), MAX_RECENT_EVENTS);
    assert!(events.iter().any(|e| e.etype == "prayer"));
    // Order stays chronological.
    assert!(events
        .iter()
        .zip(events.iter().skip(1))
        .all(|(a, b)| a.tick <= b.tick || a.etype == "prayer"));
}

#[test]
fn a_log_full_of_news_drops_the_oldest() {
    let mut events = std::collections::VecDeque::new();
    for t in 0..(MAX_RECENT_EVENTS as u64 + 10) {
        push_event(&mut events, t, "weather", "the sky", "rain");
    }
    assert_eq!(events.len(), MAX_RECENT_EVENTS);
    assert_eq!(events.front().unwrap().tick, 10);
}
