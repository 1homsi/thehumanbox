//! How unequally a tribe's wealth is shared. Measured as the Gini
//! coefficient of its living members' wealth: 0 when everyone holds the same,
//! approaching 1 when one person holds almost all of it. It is worked out from
//! the people alive in each frame, so nothing is stored and saves are unaffected.

use crate::organism::organism::Organism;
use rustc_hash::FxHashMap as HashMap;

/// Tribes smaller than this are too few people for a share to mean much.
pub const MIN_TRIBE_FOR_GINI: usize = 4;

/// The Gini coefficient of `wealth` (0 to 1). Empty or wealthless groups are equal.
pub fn gini(wealth: &mut [u32]) -> f32 {
    let n = wealth.len();
    let total: u64 = wealth.iter().map(|&w| u64::from(w)).sum();
    if n < 2 || total == 0 {
        return 0.0;
    }
    wealth.sort_unstable();
    // G = (2 * sum(i * x_i)) / (n * sum(x)) - (n + 1) / n, with i counted from 1.
    let weighted: f64 = wealth
        .iter()
        .enumerate()
        .map(|(i, &w)| (i as f64 + 1.0) * f64::from(w))
        .sum();
    let n_f = n as f64;
    let g = 2.0 * weighted / (n_f * total as f64) - (n_f + 1.0) / n_f;
    (g.clamp(0.0, 1.0)) as f32
}

/// Per tribe: its Gini coefficient and how many living people it counts, for
/// every tribe with at least `MIN_TRIBE_FOR_GINI` members. Sorted by tribe id.
pub fn lineage_inequality(organisms: &[Organism]) -> Vec<(String, f32, usize)> {
    let mut wealth_by_lineage: HashMap<&str, Vec<u32>> = HashMap::default();
    for o in organisms.iter().filter(|o| o.alive && !o.lineage_id.is_empty()) {
        wealth_by_lineage
            .entry(o.lineage_id.as_str())
            .or_default()
            .push(o.wealth);
    }
    let mut rows: Vec<(String, f32, usize)> = wealth_by_lineage
        .into_iter()
        .filter(|(_, w)| w.len() >= MIN_TRIBE_FOR_GINI)
        .map(|(lid, mut w)| {
            let people = w.len();
            (lid.to_string(), gini(&mut w), people)
        })
        .collect();
    rows.sort_by(|a, b| a.0.cmp(&b.0));
    rows
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn equal_wealth_has_no_inequality() {
        assert_eq!(gini(&mut [5, 5, 5, 5]), 0.0);
    }

    #[test]
    fn one_person_holding_everything_is_the_extreme() {
        // Four people, one with all of it: G = 1 - 1/n = 0.75.
        let g = gini(&mut [0, 0, 0, 8]);
        assert!((g - 0.75).abs() < 1e-6, "gini {g}");
    }

    #[test]
    fn degenerate_groups_are_equal() {
        assert_eq!(gini(&mut []), 0.0);
        assert_eq!(gini(&mut [7]), 0.0);
        assert_eq!(gini(&mut [0, 0, 0]), 0.0);
    }

    #[test]
    fn small_tribes_are_left_out_and_order_is_fixed() {
        use crate::organism::traits::Traits;
        let mut orgs = Vec::new();
        for (lid, count) in [("b-tribe", 5usize), ("a-tribe", 4), ("tiny", 3)] {
            for i in 0..count {
                let mut o = Organism::new(
                    format!("{lid}{i}"),
                    "x".into(),
                    0.0,
                    0.0,
                    0,
                    String::new(),
                    lid.into(),
                    9000,
                    Traits::default(),
                );
                o.alive = true;
                o.wealth = if i == 0 { 10 } else { 1 };
                orgs.push(o);
            }
        }
        let rows = lineage_inequality(&orgs);
        let ids: Vec<&str> = rows.iter().map(|r| r.0.as_str()).collect();
        assert_eq!(ids, ["a-tribe", "b-tribe"]);
        assert!(rows.iter().all(|r| r.1 > 0.0));
    }
}
