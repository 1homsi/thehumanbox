use super::*;

impl Organism {
    pub fn learn(&mut self, perception: &str, action: usize, reward: f32, next_perception: &str) {
        self.learn_with_available_actions(perception, action, reward, next_perception, None);
    }

    pub fn learn_with_available_actions(
        &mut self,
        perception: &str,
        action: usize,
        reward: f32,
        next_perception: &str,
        next_available: Option<&[usize]>,
    ) {
        self.learn_transition(
            perception,
            action,
            reward,
            next_perception,
            next_available,
            None,
            false,
        );
    }

    /// Q-learning with a bounded, replacing trace for recent decisions.
    /// The trace gives earlier actions part of the current temporal-difference
    /// error without allocating another Q table or changing action eligibility.
    #[allow(clippy::too_many_arguments)]
    pub fn learn_transition(
        &mut self,
        perception: &str,
        action: usize,
        reward: f32,
        next_perception: &str,
        next_available: Option<&[usize]>,
        action_succeeded: Option<bool>,
        terminal: bool,
    ) {
        let alpha = (0.08 + self.traits.memory_strength.clamp(0.0, 1.0) * 0.14).clamp(0.08, 0.22);
        let gamma = (0.82 + self.traits.curiosity.clamp(0.0, 1.0) * 0.12).clamp(0.82, 0.94);
        let action_u16 = action as u16;
        let first_attempt = !self
            .q_table
            .get(perception)
            .is_some_and(|row| row.iter().any(|&(known, _)| known == action_u16));

        let best_next = if terminal {
            0.0
        } else {
            self.q_table
                .get(next_perception)
                .map(|r| match next_available {
                    Some(actions) => r.max_q_for_actions(actions),
                    None => r.max_q(),
                })
                .unwrap_or(0.0)
        };

        // Novel choices carry a small intrinsic reward. Curious organisms
        // value that first attempt more, while repeating an unrewarding
        // choice still receives the normal inactivity penalty.
        let novelty_reward = if first_attempt && reward >= 0.0 {
            0.004 + self.traits.curiosity.clamp(0.0, 1.0) * 0.008
        } else {
            0.0
        };
        let observed_reward = reward + novelty_reward;
        let effective_reward = if observed_reward < 0.0 {
            let fear_weight = 1.0 + self.traits.fear.clamp(0.0, 1.0) * 0.45;
            let resilience_softening = 1.0 - self.traits.resilience.clamp(0.0, 1.0) * 0.20;
            observed_reward * fear_weight * resilience_softening
        } else if observed_reward < 0.006 && !(action_succeeded == Some(true) && reward > 0.0) {
            // NOTE: the 0.006 threshold is calibrated, not arbitrary. The
            // first-attempt novelty bonus is `0.004 + curiosity * 0.008`, so
            // a cautious organism (curiosity 0.1) gets 0.0048 — *below* the
            // threshold and therefore penalised — while a curious one
            // (0.9) gets 0.0112 and is not. `organism_tests.rs::
            // curious_organisms_value_genuinely_new_choices` pins exactly
            // that split. Do not "fix" this into a plain `== 0.0` test
            // without re-tuning: it would make every organism's first
            // attempt net-positive and collapse the curiosity gradient.
            //
            // A known successful action with a positive reward is exempt.
            observed_reward - 0.006
        } else {
            observed_reward
        };

        let old = self
            .q_table
            .get(perception)
            .map_or(0.0, |row| row.get_q(action_u16));
        let td_error = effective_reward + gamma * best_next - old;
        if let Some(row) = self.q_table.get_mut(perception) {
            row.set_q(action_u16, old + alpha * td_error);
        } else {
            let mut row = QRow::default();
            row.set_q(action_u16, old + alpha * td_error);
            self.q_table.insert(perception.to_string(), row);
        }

        // Share experience between similar perceptions. These coarse rows use
        // the existing sparse table and save format, and learn more slowly
        // than the exact row so contradictory situations can remain distinct.
        if let Some(key) = generalization_key(perception) {
            let row = self.q_table.entry(key).or_default();
            let prior = row.get_q(action_u16);
            let target = effective_reward + gamma * best_next;
            row.set_q(action_u16, prior + alpha * 0.25 * (target - prior));
        }

        // Replacing traces: each state/action receives the error only for its
        // most recent occurrence. Capped to four updates per tick and never
        // creates a new Q row if old experience has already been pruned.
        let mut weight = gamma * 0.45;
        for (state, previous_action) in self.learning_trace.iter().rev() {
            if state == perception && *previous_action == action_u16 {
                continue;
            }
            if let Some(row) = self.q_table.get_mut(state) {
                let old = row.get_q(*previous_action);
                row.set_q(*previous_action, old + alpha * td_error * weight);
            }
            weight *= gamma * 0.45;
        }
        if terminal {
            self.learning_trace.clear();
        } else {
            self.learning_trace
                .retain(|(s, a)| s != perception || *a != action_u16);
            if self.learning_trace.len() >= 4 {
                self.learning_trace.remove(0);
            }
            self.learning_trace.push((perception.to_string(), action_u16));
        }
    }
}
