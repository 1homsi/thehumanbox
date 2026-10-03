//! A set of action ids as a bit array: 768 bytes to clear per evaluation
//! instead of the 6 KiB a `[bool; ACTION_ID_SPACE]` costs.
use crate::organism::organism::ACTION_ID_SPACE;

const WORDS: usize = ACTION_ID_SPACE.div_ceil(64);

pub(super) struct ActionSet([u64; WORDS]);

impl ActionSet {
    pub(super) fn new() -> Self {
        Self([0; WORDS])
    }

    pub(super) fn contains(&self, action: usize) -> bool {
        self.0[action / 64] & (1 << (action % 64)) != 0
    }

    /// Adds `action`; true when it was not already present.
    pub(super) fn insert(&mut self, action: usize) -> bool {
        let word = &mut self.0[action / 64];
        let bit = 1 << (action % 64);
        let fresh = *word & bit == 0;
        *word |= bit;
        fresh
    }

    pub(super) fn insert_range(&mut self, start: usize, end: usize) {
        for action in start..=end {
            self.insert(action);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn behaves_like_a_bool_array() {
        let mut set = ActionSet::new();
        let mut reference = [false; ACTION_ID_SPACE];
        set.insert_range(60, 130);
        reference[60..=130].fill(true);
        set.insert_range(5930, ACTION_ID_SPACE - 1);
        reference[5930..].fill(true);
        assert!(!set.insert(130));
        assert!(set.insert(131));
        reference[131] = true;
        for (action, expected) in reference.iter().enumerate() {
            assert_eq!(set.contains(action), *expected, "action {action}");
        }
    }
}
