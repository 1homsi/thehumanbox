use super::*;

pub struct BattleInstitutions<'a> {
    pub lineage_eras: &'a HashMap<String, Era>,
    pub governments: &'a HashMap<String, Government>,
    pub buildings: &'a [Building],
    pub field_fortifications: &'a [FieldFortification],
    pub grid: &'a WorldGrid,
}

pub fn tick_battles(
    tick: u64,
    rng: &mut rand_chacha::ChaCha8Rng,
    battles: &mut Vec<Battle>,
    treaties: &mut Vec<Treaty>,
    organisms: &mut [crate::organism::organism::Organism],
    events: &mut std::collections::VecDeque<crate::sim::simulation::Event>,
    history_combat_deaths: &mut u64,
    institutions: BattleInstitutions<'_>,
) {
    use rand::RngExt;
    let mut signed: Vec<(String, String, TreatyKind)> = Vec::new();
    for battle in battles.iter_mut() {
        if battle.ended_tick.is_some() {
            continue;
        }

        let att_alive: Vec<usize> = battle
            .attacker_orgs
            .iter()
            .filter_map(|id| organism_index(organisms, id))
            .filter(|&i| organisms[i].alive)
            .collect();
        let def_alive: Vec<usize> = battle
            .defender_orgs
            .iter()
            .filter_map(|id| organism_index(organisms, id))
            .filter(|&i| organisms[i].alive)
            .collect();

        let defender_wall_bonus =
            nearby_operational_defense(institutions.buildings, &battle.defenders, battle.location)
                || nearby_field_fortification(
                    institutions.field_fortifications,
                    &battle.defenders,
                    battle.location,
                    institutions.grid,
                );

        let att_era = battle
            .attackers
            .first()
            .and_then(|lid| institutions.lineage_eras.get(lid).copied())
            .unwrap_or(Era::PreStone);
        let def_era = battle
            .defenders
            .first()
            .and_then(|lid| institutions.lineage_eras.get(lid).copied())
            .unwrap_or(Era::PreStone);
        let att_policy_bonus = battle
            .attackers
            .first()
            .map(|lid| military_policy_bonus(institutions.governments.get(lid)))
            .unwrap_or(0.0);
        let def_policy_bonus = battle
            .defenders
            .first()
            .map(|lid| military_policy_bonus(institutions.governments.get(lid)))
            .unwrap_or(0.0);

        let base_dmg = 0.06f32;

        // A combatant can die to fire, illness, or another system between
        // battle ticks. Resolve the empty side below instead of indexing an
        // empty force while trying to manufacture one combat pair.
        let pairs = att_alive.len().min(def_alive.len());
        for k in 0..pairs {
            let ai = att_alive[k];
            let di = def_alive[k % def_alive.len()];
            let att_style = combat_style_for(&organisms[ai], att_era);
            let def_style = combat_style_for(&organisms[di], def_era);
            let a_bonus = soldier_bonus(&organisms[ai]) + att_policy_bonus;
            let d_bonus = soldier_bonus(&organisms[di]) + def_policy_bonus;
            // A defender behind a completed wall/field fortification takes
            // reduced damage. This multiplier has to sit on `a_dmg` (the
            // damage dealt *to* the defender); putting it on `d_dmg` made a
            // defensive structure boost the defender's own output by 50%
            // while granting no mitigation at all.
            let a_dmg = base_dmg
                * damage_multiplier(att_style)
                * (1.0 + a_bonus)
                * (0.7 + rng.random::<f32>() * 0.6)
                * if defender_wall_bonus { 0.65 } else { 1.0 };
            let d_dmg =
                base_dmg * damage_multiplier(def_style) * (1.0 + d_bonus) * (0.7 + rng.random::<f32>() * 0.6);

            organisms[di].health = (organisms[di].health - a_dmg).max(0.0);
            organisms[di].mark_harm(crate::organism::organism::Harm::War, tick);
            if organisms[di].health <= 0.0 && organisms[di].alive {
                organisms[di].alive = false;
                battle.casualties_d += 1;
                *history_combat_deaths += 1;
            }
            organisms[ai].health = (organisms[ai].health - d_dmg).max(0.0);
            organisms[ai].mark_harm(crate::organism::organism::Harm::War, tick);
            if organisms[ai].health <= 0.0 && organisms[ai].alive {
                organisms[ai].alive = false;
                battle.casualties_a += 1;
                *history_combat_deaths += 1;
            }
        }

        let att_now = battle
            .attacker_orgs
            .iter()
            .filter_map(|id| organism_index(organisms, id))
            .filter(|&i| organisms[i].alive)
            .count() as f32;
        let def_now = battle
            .defender_orgs
            .iter()
            .filter_map(|id| organism_index(organisms, id))
            .filter(|&i| organisms[i].alive)
            .count() as f32;
        let a_frac = att_now / battle.initial_a.max(1) as f32;
        let d_frac = def_now / battle.initial_d.max(1) as f32;
        let elapsed = tick.saturating_sub(battle.started_tick);

        let timed_out = elapsed >= MAX_BATTLE_TICKS;
        let a_broken = a_frac < STRENGTH_BREAK_FRAC;
        let d_broken = d_frac < STRENGTH_BREAK_FRAC;
        if a_broken || d_broken || timed_out {
            let outcome = if a_broken && d_broken {
                BattleOutcome::Stalemate
            } else if d_broken {
                BattleOutcome::AttackerVictory
            } else if a_broken {
                BattleOutcome::DefenderVictory
            } else if a_frac > d_frac {
                BattleOutcome::AttackerVictory
            } else if d_frac > a_frac {
                BattleOutcome::DefenderVictory
            } else {
                BattleOutcome::Stalemate
            };
            battle.ended_tick = Some(tick);
            battle.outcome = Some(outcome);

            let a_lid = battle.attackers.first().cloned().unwrap_or_default();
            let b_lid = battle.defenders.first().cloned().unwrap_or_default();
            push_event(
                events,
                tick,
                "battle_ended",
                &battle.id,
                &format!(
                    "{} vs {}: {} (cas {}/{})",
                    a_lid,
                    b_lid,
                    outcome.name(),
                    battle.casualties_a,
                    battle.casualties_d
                ),
            );

            let loser = match outcome {
                BattleOutcome::AttackerVictory => Some((b_lid.clone(), a_lid.clone())),
                BattleOutcome::DefenderVictory => Some((a_lid.clone(), b_lid.clone())),
                BattleOutcome::Stalemate => None,
            };
            if let Some((loser_lid, winner_lid)) = loser {
                let dominance = if outcome == BattleOutcome::AttackerVictory {
                    a_frac
                } else {
                    d_frac
                };
                let kind = if dominance > 0.75 && rng.random::<f32>() < 0.35 {
                    TreatyKind::Vassalage
                } else if rng.random::<f32>() < 0.5 {
                    TreatyKind::NonAggression
                } else {
                    TreatyKind::Trade
                };
                signed.push((loser_lid, winner_lid, kind));
            }
        }
    }

    for (a, b, kind) in signed {
        let expires = tick.saturating_add(2000 + (rng.random::<u64>() % 4000));
        if !establish_treaty(treaties, organisms, &a, &b, kind, tick, expires) {
            continue;
        }
        push_event(
            events,
            tick,
            "treaty_signed",
            &a,
            &format!("{} signs {} with {}", a, kind.name(), b),
        );
        if matches!(kind, TreatyKind::Vassalage) {
            push_event(
                events,
                tick,
                "vassal_state",
                &a,
                &format!("{} becomes vassal of {}", a, b),
            );
        }
    }

    consolidate_treaties(treaties, tick);

    let mut active_finished: Vec<usize> = Vec::new();
    for (i, b) in battles.iter().enumerate() {
        if b.ended_tick.is_some() {
            active_finished.push(i);
        }
    }
    if battles.len() > 50 {
        let to_remove = battles.len() - 50;
        let mut removed = 0;
        let mut i = 0;
        while i < battles.len() && removed < to_remove {
            if battles[i].ended_tick.is_some() {
                battles.remove(i);
                removed += 1;
            } else {
                i += 1;
            }
        }
    }
    let _ = active_finished;
}

pub(super) fn organism_index(organisms: &[crate::organism::organism::Organism], id: &str) -> Option<usize> {
    organisms.iter().position(|o| o.id == id)
}

pub(super) fn combat_style_for(org: &crate::organism::organism::Organism, era: Era) -> CombatStyle {
    if org.has_tool("rifle") {
        if era >= Era::Modern {
            CombatStyle::Modern
        } else {
            CombatStyle::Rifle
        }
    } else if org.has_tool("musket") {
        CombatStyle::Musket
    } else if org.has_tool("sword") || org.has_tool("iron_sword") || org.has_tool("bow") {
        CombatStyle::Sword
    } else if org.has_tool("spear") || org.has_tool("bronze_spear") || org.has_tool("stone_spear") {
        CombatStyle::Spear
    } else {
        CombatStyle::Brawl
    }
}

pub(super) fn military_policy_bonus(government: Option<&Government>) -> f32 {
    let Some(government) = government else {
        return 0.0;
    };
    if !government.has_law(LawKind::MilitaryService) {
        return 0.0;
    }
    // An enacted service law improves coordination. A funded treasury adds a
    // smaller logistics bonus, capped so equipment and individual skill still
    // decide battles.
    0.08 + (government.treasury as f32 / 500.0).min(0.12)
}

pub(super) fn soldier_bonus(o: &crate::organism::organism::Organism) -> f32 {
    let training: f32 = match o.specialty.as_deref() {
        Some("officer") => 0.38,
        Some("soldier") => 0.24,
        _ => 0.0,
    };
    let equipment: f32 = if o.has_tool("rifle") {
        0.34
    } else if o.has_tool("musket") {
        0.25
    } else if o.has_tool("sword") || o.has_tool("bow") {
        0.16
    } else if o.has_tool("spear") || o.discoveries.contains("spear") {
        0.10
    } else {
        0.0
    };
    let readiness = (0.55 + 0.25 * o.energy + 0.20 * o.health).clamp(0.4, 1.0);
    (training + equipment) * readiness
}

pub(super) fn is_defensive_building(kind: BuildingKind) -> bool {
    matches!(
        kind,
        BuildingKind::Wall
            | BuildingKind::Tower
            | BuildingKind::Watchtower
            | BuildingKind::Barracks
            | BuildingKind::Castle
            | BuildingKind::Gate
            | BuildingKind::Fence
    )
}

pub(super) fn nearby_operational_defense(
    buildings: &[Building],
    defenders: &[String],
    loc: (i32, i32),
) -> bool {
    buildings.iter().any(|building| {
        if !building.is_operational() || !is_defensive_building(building.kind) {
            return false;
        }
        let Some(owner) = building.owner_lineage.as_deref() else {
            return false;
        };
        if !defenders.iter().any(|lineage| lineage == owner) {
            return false;
        }
        let (width, height) = building.footprint();
        let nearest_x = loc.0.clamp(building.x, building.x + i32::from(width) - 1);
        let nearest_y = loc.1.clamp(building.y, building.y + i32::from(height) - 1);
        (loc.0 - nearest_x).abs() <= 3 && (loc.1 - nearest_y).abs() <= 3
    })
}

pub(super) fn nearby_field_fortification(
    fortifications: &[FieldFortification],
    defenders: &[String],
    loc: (i32, i32),
    grid: &WorldGrid,
) -> bool {
    fortifications.iter().any(|fortification| {
        grid.structure_at(fortification.x, fortification.y) > 0.0
            && defenders
                .iter()
                .any(|lineage| lineage == &fortification.lineage_id)
            && (loc.0 - fortification.x).abs() <= 3
            && (loc.1 - fortification.y).abs() <= 3
    })
}
