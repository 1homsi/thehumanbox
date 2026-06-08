pub(crate) fn directive_aligns_action(directive: &str, action: usize) -> bool {
    match directive {
        "seek_food" | "forage" => {
            matches!(action, 8 | 19 | 26..=38 | 141..=150 | 336..=355 | 1140..=1189)
        }
        "seek_water" => matches!(action, 9 | 18 | 166..=180 | 1320..=1369),
        "explore" | "wander" | "migrate" => matches!(action, 0..=7 | 24 | 205 | 2160..=2212),
        "socialize" => matches!(action, 10 | 13 | 80..=95 | 181..=200 | 226..=245),
        "flee" => matches!(action, 0..=7 | 11 | 17),
        "fight" | "defend" | "hunt" => matches!(action, 0..=7 | 12 | 5820..=5869),
        "trade" => matches!(action, 13 | 90..=95 | 2700..=2749 | 5460..=5509),
        "rest" => matches!(action, 17 | 107..=116 | 221..=225),
        "isolate" => matches!(action, 0..=7 | 17),
        "seek_help" => matches!(action, 10 | 11 | 107..=116 | 181..=190),
        "settle" => matches!(action, 14 | 15 | 17 | 39..=50 | 146 | 147),
        _ => false,
    }
}

pub(crate) fn directive_action_boost(directive: &str, action: usize) -> f32 {
    if directive_aligns_action(directive, action) {
        0.08
    } else {
        0.0
    }
}

pub(crate) fn preferred_action_boost(preferred: Option<usize>, action: usize) -> f32 {
    if preferred == Some(action) {
        0.08
    } else {
        0.0
    }
}
