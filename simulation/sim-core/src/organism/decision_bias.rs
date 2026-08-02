pub(crate) fn directive_aligns_action(directive: &str, action: usize) -> bool {
    if protection_target_id(directive).is_some() {
        return directive_aligns_action("defend", action);
    }
    if area_guard_target(directive).is_some() {
        return directive_aligns_action("defend", action);
    }
    if fire_response_target(directive).is_some() {
        return matches!(action, 4621 | 4654 | 4665);
    }
    match directive {
        "seek_food" | "forage" => {
            matches!(action, 8 | 19 | 26..=38 | 141..=150 | 336..=355 | 1140..=1189)
        }
        "seek_water" => matches!(action, 9 | 18 | 166..=180 | 1320..=1369),
        "explore" | "wander" | "migrate" => matches!(
            action,
            0..=7
                | 24
                | 117..=123
                | 211..=220
                | 900..=949
                | 1440..=1489
                | 2168..=2169
                | 2198..=2202
                | 4200..=4249
                | 4440..=4609
        ),
        "socialize" => matches!(action, 10 | 13 | 80..=95 | 181..=200 | 226..=245),
        "flee" => matches!(action, 0..=7 | 11 | 17),
        "fight" => matches!(
            action,
            12
                | 96..=99
                | 102
                | 106
                | 193..=194
                | 198
                | 436..=439
                | 442..=446
                | 448
                | 451..=453
                | 455
                | 3660..=3709
        ),
        "hunt" => matches!(
            action,
            28 | 121..=123 | 2179..=2189 | 2203..=2208 | 5820..=5869
        ),
        "defend" => matches!(
            action,
            11
                | 39
                | 44
                | 48
                | 50
                | 100..=101
                | 103..=105
                | 169
                | 179
                | 191..=192
                | 195..=197
                | 199..=200
                | 440..=441
                | 447
                | 449..=450
                | 454
                | 537
                | 3660..=3709
        ),
        "trade" => matches!(
            action,
            94
                | 276..=295
                | 1680..=1729
                | 2700..=2749
                | 3180..=3229
                | 5100..=5149
                | 5220..=5269
                | 5460..=5509
        ),
        "rest" => matches!(action, 17 | 107..=116 | 221..=225),
        "isolate" => matches!(action, 0..=7 | 17),
        "seek_help" => matches!(action, 10 | 11 | 107..=116 | 181..=190),
        "settle" => matches!(
            action,
            14..=15
                | 17
                | 30..=31
                | 35..=50
                | 146..=147
                | 166..=180
                | 536..=537
                | 540..=589
                | 1620..=1668
                | 2580..=2629
                | 2880..=2989
                | 3300..=3349
                | 3540..=3589
                | 3720..=3829
        ),
        _ => false,
    }
}

pub(crate) fn protection_target_id(directive: &str) -> Option<&str> {
    directive
        .strip_prefix("protect:")
        .filter(|target| !target.is_empty())
}

pub(crate) fn area_guard_target(directive: &str) -> Option<(i32, i32)> {
    let coordinates = directive.strip_prefix("guard_area:")?;
    let (x, y) = coordinates.split_once(':')?;
    Some((x.parse().ok()?, y.parse().ok()?))
}

pub(crate) fn fire_response_target(directive: &str) -> Option<(i32, i32)> {
    let coordinates = directive.strip_prefix("fire_response:")?;
    let (x, y) = coordinates.split_once(':')?;
    Some((x.parse().ok()?, y.parse().ok()?))
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

#[cfg(test)]
mod tests {
    use super::{area_guard_target, directive_aligns_action, fire_response_target, protection_target_id};

    fn assert_range(strategy: &str, range: std::ops::RangeInclusive<usize>) {
        for action in range {
            assert!(
                directive_aligns_action(strategy, action),
                "{strategy} should align with action {action}"
            );
        }
    }

    #[test]
    fn exposed_strategies_cover_their_generated_action_families() {
        assert_range("hunt", 5820..=5869);
        assert_range("explore", 1440..=1489);
        assert_range("settle", 2580..=2629);
        assert_range("trade", 276..=295);
        assert_range("trade", 1680..=1729);
        assert_range("trade", 2700..=2749);
        assert_range("defend", 3660..=3709);
    }

    #[test]
    fn exposed_strategies_align_with_representative_base_actions() {
        assert!(directive_aligns_action("hunt", 121));
        assert!(directive_aligns_action("hunt", 2180));
        assert!(directive_aligns_action("explore", 117));
        assert!(directive_aligns_action("explore", 215));
        assert!(directive_aligns_action("settle", 49));
        assert!(directive_aligns_action("settle", 177));
        assert!(directive_aligns_action("trade", 94));
        assert!(directive_aligns_action("trade", 276));
        assert!(directive_aligns_action("defend", 11));
        assert!(directive_aligns_action("defend", 103));
        assert!(directive_aligns_action("defend", 447));
    }

    #[test]
    fn protection_duties_use_defensive_actions_and_preserve_the_ward_id() {
        assert_eq!(protection_target_id("protect:ward-42"), Some("ward-42"));
        assert_eq!(protection_target_id("protect:"), None);
        assert_eq!(protection_target_id("defend"), None);
        assert!(directive_aligns_action("protect:ward-42", 103));
        assert!(!directive_aligns_action("protect:ward-42", 121));
    }

    #[test]
    fn area_guard_duties_preserve_coordinates_and_use_defensive_actions() {
        assert_eq!(area_guard_target("guard_area:42:73"), Some((42, 73)));
        assert_eq!(area_guard_target("guard_area:42"), None);
        assert_eq!(area_guard_target("guard_area:x:73"), None);
        assert!(directive_aligns_action("guard_area:42:73", 101));
        assert!(!directive_aligns_action("guard_area:42:73", 121));
    }

    #[test]
    fn fire_response_duties_preserve_coordinates_and_only_use_real_response_actions() {
        assert_eq!(fire_response_target("fire_response:42:73"), Some((42, 73)));
        assert_eq!(fire_response_target("fire_response:42"), None);
        assert_eq!(fire_response_target("fire_response:x:73"), None);
        for action in [4621, 4654, 4665] {
            assert!(directive_aligns_action("fire_response:42:73", action));
        }
        assert!(!directive_aligns_action("fire_response:42:73", 4620));
        assert!(!directive_aligns_action("fire_response:42:73", 4653));
    }

    #[test]
    fn trade_guidance_excludes_non_trade_diplomacy_actions() {
        assert!(directive_aligns_action("trade", 94));
        for action in [90, 91, 92, 93, 95] {
            assert!(
                !directive_aligns_action("trade", action),
                "diplomacy action {action} is not trade"
            );
        }
    }

    #[test]
    fn hunt_and_defend_are_distinct_across_the_action_space() {
        for action in 0..=5929 {
            assert!(
                !(directive_aligns_action("hunt", action) && directive_aligns_action("defend", action)),
                "action {action} cannot be both hunting and defense"
            );
        }
        assert!(!directive_aligns_action("hunt", 103));
        assert!(!directive_aligns_action("hunt", 447));
        assert!(!directive_aligns_action("defend", 121));
        assert!(!directive_aligns_action("defend", 5820));
    }

    #[test]
    fn strategies_reject_unrelated_sibling_families() {
        assert!(!directive_aligns_action("explore", 5460));
        assert!(!directive_aligns_action("trade", 1440));
        assert!(!directive_aligns_action("settle", 4260));
        assert!(!directive_aligns_action("hunt", 1980));
        assert!(!directive_aligns_action("defend", 1980));
    }
}
