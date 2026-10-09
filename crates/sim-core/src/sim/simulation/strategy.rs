use super::*;

impl Simulation {
    pub(crate) fn start_strategy_objective(&mut self, lineage_id: &str, strategy: &str, expires_tick: u64) {
        self.resolve_strategy_objective_expirations();
        let duration = expires_tick.saturating_sub(self.tick_count);
        let target = duration.div_ceil(2).clamp(30, 1_200) as u32;
        let continue_existing = self
            .lineage_strategy_objectives
            .get(lineage_id)
            .is_some_and(|objective| {
                objective.strategy == strategy
                    && objective.failed_tick.is_none()
                    && objective.expires_tick > self.tick_count
            });

        if continue_existing {
            if let Some(objective) = self.lineage_strategy_objectives.get_mut(lineage_id) {
                objective.expires_tick = expires_tick;
                if objective.completed_tick.is_none() {
                    objective.target = objective.target.max(target);
                }
            }
            return;
        }

        let redirected = self
            .lineage_strategy_objectives
            .get(lineage_id)
            .filter(|objective| {
                objective.completed_tick.is_none()
                    && objective.failed_tick.is_none()
                    && objective.expires_tick > self.tick_count
            })
            .cloned();
        if let Some(objective) = redirected {
            self.archive_strategy_campaign(
                lineage_id,
                &objective,
                "redirected",
                Some("player_redirected"),
                self.tick_count,
            );
            let lineage_name = self
                .lineage_names
                .get(lineage_id)
                .cloned()
                .unwrap_or_else(|| "A lineage".to_string());
            push_event(
                &mut self.events,
                self.tick_count,
                "strategy_redirected",
                &lineage_name,
                &format!(
                    "redirected from {} to {} after {}/{} effort",
                    objective.strategy, strategy, objective.progress, objective.target
                ),
            );
        }

        self.lineage_strategy_objectives.insert(
            lineage_id.to_string(),
            StrategyObjective {
                strategy: strategy.to_string(),
                started_tick: self.tick_count,
                expires_tick,
                progress: 0,
                target,
                completed_tick: None,
                failed_tick: None,
            },
        );
    }

    pub(super) fn archive_strategy_campaign(
        &mut self,
        lineage_id: &str,
        objective: &StrategyObjective,
        outcome: &str,
        reason: Option<&str>,
        ended_tick: u64,
    ) {
        let lineage_name = self
            .lineage_names
            .get(lineage_id)
            .cloned()
            .unwrap_or_else(|| lineage_id.chars().take(8).collect());
        self.lineage_strategy_history.push_back(StrategyCampaignRecord {
            lineage_id: lineage_id.to_string(),
            lineage_name,
            strategy: objective.strategy.clone(),
            started_tick: objective.started_tick,
            ended_tick,
            progress: objective.progress,
            target: objective.target,
            outcome: outcome.to_string(),
            reason: reason.map(str::to_string),
        });
        while self.lineage_strategy_history.len() > 40 {
            self.lineage_strategy_history.pop_front();
        }
    }

    pub(crate) fn record_strategy_progress(&mut self, lineage_id: &str, strategy: &str) {
        let completed_objective = {
            let Some(objective) = self.lineage_strategy_objectives.get_mut(lineage_id) else {
                return;
            };
            if objective.strategy != strategy
                || objective.expires_tick <= self.tick_count
                || objective.completed_tick.is_some()
                || objective.failed_tick.is_some()
            {
                return;
            }

            objective.target = objective.target.max(1);
            objective.progress = objective.progress.min(objective.target);
            objective.progress = objective.progress.saturating_add(1).min(objective.target);
            if objective.progress < objective.target {
                None
            } else {
                objective.completed_tick = Some(self.tick_count);
                Some(objective.clone())
            }
        };

        let Some(completed_objective) = completed_objective else {
            return;
        };

        let lineage_name = self
            .lineage_names
            .get(lineage_id)
            .cloned()
            .unwrap_or_else(|| "A lineage".to_string());
        let reward_description = match strategy {
            "hunt" => "stockpiled food after a successful hunt",
            "explore" => "returned with trail maps and renewed curiosity",
            "settle" => "gathered a communal reserve of building materials",
            "trade" => "shared the profits of a prosperous trade campaign",
            "defend" => "rallied behind stronger health and courage",
            _ => "completed its shared objective",
        };

        for organism in self
            .organisms
            .iter_mut()
            .filter(|organism| organism.alive && organism.lineage_id == lineage_id)
        {
            organism.hope = (organism.hope + 0.10).min(1.0);
            organism.joy_ticks = organism.joy_ticks.saturating_add(180).min(1_200);
            organism.attributes.insert(format!("campaign:{strategy}"));
            match strategy {
                "hunt" => organism.inv_food = organism.inv_food.saturating_add(1).min(9),
                "explore" => {
                    organism.curiosity_drive = (organism.curiosity_drive + 0.12).min(1.0);
                    let maps = organism.tools.entry("trail_map".to_string()).or_insert(0);
                    *maps = maps.saturating_add(1).min(3);
                }
                "settle" => {
                    organism.inv_wood = organism.inv_wood.saturating_add(1).min(9);
                    organism.inv_stone = organism.inv_stone.saturating_add(1).min(9);
                }
                "trade" => organism.wealth = organism.wealth.saturating_add(3),
                "defend" => {
                    organism.health = (organism.health + 0.10).min(1.0);
                    organism.fear_level = (organism.fear_level - 0.12).max(0.0);
                }
                _ => {}
            }
        }

        self.archive_strategy_campaign(
            lineage_id,
            &completed_objective,
            "completed",
            None,
            self.tick_count,
        );
        let story = format!("{lineage_name} {reward_description}");
        push_event(
            &mut self.events,
            self.tick_count,
            "strategy_complete",
            &lineage_name,
            reward_description,
        );
        self.story_history.push_back(StoryEntry {
            tick: self.tick_count,
            org_name: lineage_name,
            lineage_id: lineage_id.to_string(),
            story,
        });
        while self.story_history.len() > 80 {
            self.story_history.pop_front();
        }
    }

    pub(crate) fn resolve_strategy_objective_expirations(&mut self) {
        let expired_lineages: Vec<String> = self
            .lineage_strategy_objectives
            .iter()
            .filter(|(_, objective)| {
                objective.expires_tick <= self.tick_count
                    && objective.completed_tick.is_none()
                    && objective.failed_tick.is_none()
            })
            .map(|(lineage_id, _)| lineage_id.clone())
            .collect();

        for lineage_id in expired_lineages {
            let expired_objective = {
                let Some(objective) = self.lineage_strategy_objectives.get_mut(&lineage_id) else {
                    continue;
                };
                objective.failed_tick = Some(self.tick_count);
                objective.clone()
            };

            for organism in self
                .organisms
                .iter_mut()
                .filter(|organism| organism.alive && organism.lineage_id == lineage_id)
            {
                organism.hope = (organism.hope - 0.04).max(0.0);
                organism.boredom = (organism.boredom + 0.03).min(1.0);
            }

            self.archive_strategy_campaign(
                &lineage_id,
                &expired_objective,
                "expired",
                Some("deadline"),
                self.tick_count,
            );
            let lineage_name = self
                .lineage_names
                .get(&lineage_id)
                .cloned()
                .unwrap_or_else(|| "A lineage".to_string());
            let detail = format!(
                "fell short of the {} objective at {}/{} effort",
                expired_objective.strategy, expired_objective.progress, expired_objective.target
            );
            push_event(
                &mut self.events,
                self.tick_count,
                "strategy_failed",
                &lineage_name,
                &detail,
            );
            self.story_history.push_back(StoryEntry {
                tick: self.tick_count,
                org_name: lineage_name.clone(),
                lineage_id: lineage_id.clone(),
                story: format!("{lineage_name} {detail}"),
            });
            while self.story_history.len() > 80 {
                self.story_history.pop_front();
            }
        }

        let current_tick = self.tick_count;
        self.lineage_strategies
            .retain(|_, (_, expires_tick)| *expires_tick > current_tick);
        self.lineage_strategy_objectives.retain(|_, objective| {
            objective.expires_tick > current_tick
                || objective
                    .completed_tick
                    .or(objective.failed_tick)
                    .is_some_and(|ended_tick| current_tick.saturating_sub(ended_tick) <= 30)
        });
    }

    pub(super) fn resolve_extinct_strategy_objectives(&mut self) {
        let living_lineages: HashSet<String> = self
            .organisms
            .iter()
            .filter(|organism| organism.alive || growth::is_pending_birth(organism))
            .map(|organism| organism.lineage_id.clone())
            .collect();
        let extinct_objectives: Vec<(String, StrategyObjective)> = self
            .lineage_strategy_objectives
            .iter()
            .filter(|(lineage_id, _)| !living_lineages.contains(*lineage_id))
            .map(|(lineage_id, objective)| (lineage_id.clone(), objective.clone()))
            .collect();

        for (lineage_id, mut objective) in extinct_objectives {
            self.lineage_strategy_objectives.swap_remove(&lineage_id);
            self.lineage_strategies.swap_remove(&lineage_id);
            if objective.completed_tick.is_some() || objective.failed_tick.is_some() {
                continue;
            }

            objective.failed_tick = Some(self.tick_count);
            self.archive_strategy_campaign(
                &lineage_id,
                &objective,
                "failed",
                Some("lineage_extinct"),
                self.tick_count,
            );
            let lineage_name = self
                .lineage_names
                .get(&lineage_id)
                .cloned()
                .unwrap_or_else(|| lineage_id.chars().take(8).collect());
            push_event(
                &mut self.events,
                self.tick_count,
                "strategy_failed",
                &lineage_name,
                &format!(
                    "the {} objective ended when the lineage vanished",
                    objective.strategy
                ),
            );
        }
    }
}
