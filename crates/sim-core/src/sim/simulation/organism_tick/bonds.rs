use super::*;

impl Simulation {
    /// Social effects of the tick: kin, crowding, attitudes toward neighbours, and the final shaped reward and next perception.
    pub(super) fn org_bonds(&mut self, f: &mut OrgFrame<'_>) {
        let action = f.action;
        let action_succeeded = f.action_succeeded;
        let animal_near = f.animal_near;
        let available_buf = &mut *f.available_buf;
        let idx = f.idx;
        let lineage_members = &mut *f.lineage_members;
        let movement_reward = f.movement_reward;
        let night = f.night;
        let perception_buf = &mut *f.perception_buf;
        let mut reward = f.reward;
        let signal_reward = f.signal_reward;
        let spatial = f.spatial;
        let spatial_buf = &mut *f.spatial_buf;

        let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
        let lineage = self.organisms[idx].lineage_id.clone();
        let soc = self.organisms[idx].traits.social_tendency;
        // One query serves every neighbour scan below: the index buckets are
        // wider than any of their radii, so each radius reaches the same
        // buckets, and every scan applies its own exact distance.
        spatial.query_into(ox as i32, oy as i32, 6, spatial_buf);
        spatial_buf.sort_unstable();
        let kin_count = spatial_buf
            .iter()
            .filter(|&&i| {
                if i == idx {
                    return false;
                }
                let o = &self.organisms[i];
                o.alive && o.lineage_id == lineage && (o.x - ox).abs() + (o.y - oy).abs() <= 4.0
            })
            .count();
        reward += 0.004 * (kin_count.min(1) as f32) * (0.5 + soc);

        let crowding = spatial_buf
            .iter()
            .filter(|&&i| {
                if i == idx {
                    return false;
                }
                let o = &self.organisms[i];
                o.alive && (o.x - ox).abs() + (o.y - oy).abs() <= 3.0
            })
            .count();
        if crowding > 2 {
            let excess = (crowding - 2) as f32;
            reward -= 0.006 * excess * excess;
        }

        if self.organisms[idx].infection < 0.10 && self.organisms[idx].health > 0.4 {
            let healer_bonus = if self.organisms[idx].specialty.as_deref() == Some("healer")
                || self.organisms[idx].specialty.as_deref() == Some("doctor")
                || self.organisms[idx].aspiration == "healer"
            {
                3.0
            } else {
                1.0
            };
            let resilience = self.organisms[idx].traits.resilience;
            if resilience > 0.4 || healer_bonus > 1.0 {
                let sick_kin: Vec<usize> = spatial_buf
                    .iter()
                    .copied()
                    .filter(|&i| {
                        if i == idx {
                            return false;
                        }
                        let o = &self.organisms[i];
                        o.alive
                            && o.lineage_id == lineage
                            && o.infection > 0.20
                            && (o.x - ox).abs() + (o.y - oy).abs() <= 2.5
                    })
                    .collect();
                if !sick_kin.is_empty() {
                    let care_strength = 0.004 * healer_bonus * (0.5 + resilience);
                    for &ki in &sick_kin {
                        self.organisms[ki].infection =
                            (self.organisms[ki].infection - care_strength).max(0.0);
                        self.organisms[ki].comfort = (self.organisms[ki].comfort + 0.002).min(1.0);
                    }
                    reward += 0.012 * healer_bonus;
                    if self.organisms[idx].thought.is_empty()
                        || self.organisms[idx].thought == "observing"
                        || self.organisms[idx].thought == "exploring"
                    {
                        self.organisms[idx].think("tending to the sick", self.tick_count);
                    }
                }
            }
        }

        let att_adjustments: Vec<(usize, f32)> = spatial_buf
            .iter()
            .copied()
            .filter(|&i| {
                let o = &self.organisms[i];
                i != idx && o.alive && o.lineage_id != lineage && (o.x - ox).abs() + (o.y - oy).abs() <= 4.0
            })
            .map(|i| {
                (
                    i,
                    self.organisms[idx].attitude_toward(&self.organisms[i].lineage_id),
                )
            })
            .collect();
        for (_, att) in &att_adjustments {
            if *att >= 0.25 {
                reward += 0.003;
            } else {
                reward -= 0.002;
            }
        }
        for (i, att) in att_adjustments {
            if att >= 0.25 {
                let lid = self.organisms[i].lineage_id.clone();
                self.organisms[idx].update_attitude(&lid, 0.001);
                if self.rng.random::<f32>() < 0.04 {
                    let to_share: Vec<((i32, i32), f32)> = self.organisms[i]
                        .food_memory
                        .iter()
                        .filter(|(_, &v)| v > 0.4)
                        .take(1)
                        .map(|(&k, &v)| (k, v))
                        .collect();
                    let ms = self.organisms[idx].traits.memory_strength;
                    for ((x, y), v) in to_share {
                        Organism::remember(&mut self.organisms[idx].food_memory, x, y, v * 0.12, ms);
                    }
                }
            }
        }

        // The wellbeing reward uses the tick-start lineage snapshot. Reading
        // every relative here makes dense lineages quadratic in population;
        // a shared snapshot also avoids making the reward depend on which
        // relative happened to act earlier in this tick. A lineage formed
        // mid-tick has no snapshot yet, so use its live members once.
        let (kin_sum, kin_count) = self
            .lineage_aggregates
            .get(&lineage)
            .map(|stats| (stats.energy_sum, stats.population))
            .unwrap_or_else(|| {
                living_lineage_members(&self.organisms, lineage_members, &lineage)
                    .fold((0.0f32, 0usize), |(sum, count), org| {
                        (sum + org.energy, count + 1)
                    })
            });
        if kin_count >= 3 && self.organisms[idx].energy > 0.4 {
            let avg = kin_sum / kin_count as f32;
            reward += 0.003 * (avg - 0.5).max(0.0);
        }

        reward += signal_reward;
        reward += movement_reward;

        let loneliness = self.organisms[idx].loneliness;
        let boredom = self.organisms[idx].boredom;
        let comfort = self.organisms[idx].comfort;
        if loneliness > 0.5 && signal_reward > 0.0 {
            reward += loneliness * 0.015;
        }
        if boredom > 0.4 && matches!(action, 14 | 15 | 16 | 0..=7) {
            reward += boredom * 0.008;
        }
        if comfort > 0.75 {
            reward += (comfort - 0.75) * 0.01;
        }

        let aligned_strategy = self
            .lineage_strategies
            .get(&lineage)
            .filter(|(strategy, expiry)| {
                action_succeeded
                    && !matches!(action, 287..=289 | 2704)
                    && *expiry > self.tick_count
                    && directive_aligns_action(strategy, action)
            })
            .map(|(strategy, _)| {
                let bonus = match strategy.as_str() {
                    "hunt" | "trade" | "defend" => 0.008,
                    "explore" | "settle" => 0.006,
                    _ => 0.0,
                };
                (lineage.clone(), strategy.clone(), bonus)
            });
        if let Some((lineage_id, strategy, bonus)) = aligned_strategy {
            reward += bonus;
            self.record_strategy_progress(&lineage_id, &strategy);
        }

        let next_perception = self.organisms[idx].perceive_into(
            &self.grid,
            &self.organisms,
            night,
            animal_near,
            spatial,
            perception_buf,
        );
        let next_ix = self.organisms[idx].x as i32;
        let next_iy = self.organisms[idx].y as i32;
        crate::sim::actions::available_actions_into(
            self,
            idx,
            next_ix,
            next_iy,
            spatial,
            available_buf,
            spatial_buf,
        );

        f.reward = reward;
        f.boredom = boredom;
        f.comfort = comfort;
        f.kin_count_2 = kin_count;
        f.kin_sum = kin_sum;
        f.lineage = lineage;
        f.loneliness = loneliness;
        f.next_perception = next_perception;
        f.ox_2 = ox;
        f.oy_2 = oy;
    }
}
