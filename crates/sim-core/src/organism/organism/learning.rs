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
        let alpha = (0.08 + self.traits.memory_strength.clamp(0.0, 1.0) * 0.14).clamp(0.08, 0.22);
        let gamma = (0.82 + self.traits.curiosity.clamp(0.0, 1.0) * 0.12).clamp(0.82, 0.94);
        let action_u16 = action as u16;
        let first_attempt = !self
            .q_table
            .get(perception)
            .is_some_and(|row| row.iter().any(|&(known, _)| known == action_u16));

        let best_next = self
            .q_table
            .get(next_perception)
            .map(|r| match next_available {
                Some(actions) => r.max_q_for_actions(actions),
                None => r.max_q(),
            })
            .unwrap_or(0.0);

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
        } else if observed_reward < 0.006 {
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
            // Known wart: because the same
            // threshold also catches small *positive* repeat rewards, ~16%
            // of all learning updates are negative and 98% of those are
            // repeats of actions that succeeded. Fixing that properly needs
            // an explicit success flag plumbed into `learn`, plus a
            // `--sweep-seeds` before/after, because it changes what the
            // world learns.
            observed_reward - 0.006
        } else {
            observed_reward
        };

        if let Some(row) = self.q_table.get_mut(perception) {
            let old = row.get_q(action_u16);
            let new_val = old + alpha * (effective_reward + gamma * best_next - old);
            row.set_q(action_u16, new_val);
        } else {
            let mut row = QRow::default();
            let old = row.get_q(action_u16);
            let new_val = old + alpha * (effective_reward + gamma * best_next - old);
            row.set_q(action_u16, new_val);
            self.q_table.insert(perception.to_string(), row);
        }
    }
}
