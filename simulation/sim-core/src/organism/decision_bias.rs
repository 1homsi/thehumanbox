pub(crate) fn directive_aligns_action(directive: &str, action: usize) -> bool {
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
    use super::directive_aligns_action;

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
