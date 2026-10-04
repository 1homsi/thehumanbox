//! Q-learning: values, learning rate, novelty and bootstrapping.

use super::*;

fn max_q_for_actions_reference(row: &QRow, actions: &[usize]) -> f32 {
    let m = actions
        .iter()
        .map(|&a| row.get_q(a as u16))
        .fold(f32::NEG_INFINITY, f32::max);
    if m.is_finite() {
        m
    } else {
        0.0
    }
}

#[test]
fn max_q_for_actions_matches_reference_semantics() {
    const ID_TEST_SPACE: usize = 7000;
    let mut rng = StdRng::seed_from_u64(99);
    for _ in 0..500 {
        let row_len = rng.random_range(0..60);
        let mut row: QRow = Vec::new();
        for _ in 0..row_len {
            let a = rng.random_range(0..ID_TEST_SPACE) as u16;
            let v = rng.random_range(-2.0f32..2.0);
            row.set_q(a, v);
        }
        let n_avail = rng.random_range(0..200);
        let mut actions: Vec<usize> = Vec::new();
        let mut seen = vec![false; ID_TEST_SPACE];
        for _ in 0..n_avail {
            let a = rng.random_range(0..ID_TEST_SPACE);
            if !seen[a] {
                seen[a] = true;
                actions.push(a);
            }
        }
        let expected = max_q_for_actions_reference(&row, &actions);
        let got = row.max_q_for_actions(&actions);
        assert!(
            (expected - got).abs() < 1e-6,
            "mismatch: expected {expected} got {got} (row {row:?}, actions {actions:?})"
        );
    }
}

#[test]
fn learning_rate_scales_with_memory_strength() {
    let mut slow = learning_test_org(0.1, 0.5, 0.5, 0.5);
    let mut fast = learning_test_org(0.9, 0.5, 0.5, 0.5);

    slow.learn("state", 1, 0.2, "next");
    fast.learn("state", 1, 0.2, "next");

    let slow_q = slow.q_table.get("state").unwrap().get_q(1);
    let fast_q = fast.q_table.get("state").unwrap().get_q(1);
    assert!(fast_q > slow_q, "fast_q={fast_q} slow_q={slow_q}");
}

#[test]
fn curious_organisms_value_future_reward_more() {
    let mut cautious = learning_test_org(0.5, 0.1, 0.5, 0.5);
    let mut curious = learning_test_org(0.5, 0.9, 0.5, 0.5);

    cautious.learn("state", 1, 0.0, "next");
    curious.learn("state", 1, 0.0, "next");

    let cautious_q = cautious.q_table.get("state").unwrap().get_q(1);
    let curious_q = curious.q_table.get("state").unwrap().get_q(1);
    assert!(
        curious_q > cautious_q,
        "curious_q={curious_q} cautious_q={cautious_q}"
    );
}

#[test]
fn curious_organisms_value_genuinely_new_choices() {
    let mut cautious = learning_test_org(0.5, 0.1, 0.5, 0.5);
    let mut curious = learning_test_org(0.5, 0.9, 0.5, 0.5);

    cautious.learn("new-state", 7, 0.0, "missing");
    curious.learn("new-state", 7, 0.0, "missing");

    let cautious_q = cautious.q_table.get("new-state").unwrap().get_q(7);
    let curious_q = curious.q_table.get("new-state").unwrap().get_q(7);
    assert!(cautious_q < 0.0, "cautious_q={cautious_q}");
    assert!(curious_q > 0.0, "curious_q={curious_q}");
    assert!(curious_q > cautious_q);
}

#[test]
fn repeating_an_unrewarding_choice_loses_the_novelty_bonus() {
    let mut org = learning_test_org(0.5, 0.9, 0.5, 0.5);

    org.learn("state", 7, 0.0, "missing");
    let after_first = org.q_table.get("state").unwrap().get_q(7);
    org.learn("state", 7, 0.0, "missing");
    let after_repeat = org.q_table.get("state").unwrap().get_q(7);

    assert!(after_first > 0.0);
    assert!(
        after_repeat < after_first,
        "after_first={after_first} after_repeat={after_repeat}"
    );
}

#[test]
fn fearful_low_resilience_organisms_learn_stronger_negative_signal() {
    let mut resilient = learning_test_org(0.5, 0.5, 0.1, 0.9);
    let mut fearful = learning_test_org(0.5, 0.5, 0.9, 0.1);

    resilient.learn("state", 1, -0.2, "missing");
    fearful.learn("state", 1, -0.2, "missing");

    let resilient_q = resilient.q_table.get("state").unwrap().get_q(1);
    let fearful_q = fearful.q_table.get("state").unwrap().get_q(1);
    assert!(
        fearful_q < resilient_q,
        "fearful_q={fearful_q} resilient_q={resilient_q}"
    );
}

#[test]
fn learning_bootstrap_respects_available_next_actions() {
    let mut unrestricted = learning_test_org(0.5, 0.5, 0.5, 0.5);
    let mut restricted = learning_test_org(0.5, 0.5, 0.5, 0.5);
    unrestricted
        .q_table
        .insert("next".into(), vec![(10, 8.0), (2, 1.0)]);
    restricted
        .q_table
        .insert("next".into(), vec![(10, 8.0), (2, 1.0)]);

    unrestricted.learn("state", 1, 0.0, "next");
    restricted.learn_with_available_actions("state", 1, 0.0, "next", Some(&[2]));

    let unrestricted_q = unrestricted.q_table.get("state").unwrap().get_q(1);
    let restricted_q = restricted.q_table.get("state").unwrap().get_q(1);
    assert!(
        restricted_q < unrestricted_q,
        "restricted_q={restricted_q} unrestricted_q={unrestricted_q}"
    );
}

#[test]
fn q_row_available_action_max_treats_unseen_actions_as_zero() {
    let row = vec![(3, -0.5), (4, -0.2)];

    assert_eq!(row.max_q_for_actions(&[3, 99]), 0.0);
}
