pub mod anoint_leader;
pub mod call_assembly;
pub mod conscript_warrior;
pub mod declare_war;
pub mod dissolve_council;
pub mod enforce_law;
pub mod establish_borders;
pub mod exile_member;
pub mod form_council;
pub mod grant_citizenship;
pub mod grant_land;
pub mod hold_election;
pub mod impeach_leader;
pub mod issue_decree;
pub mod levy_tax;
pub mod pardon_criminal;
pub mod pass_law;
pub mod revoke_privilege;
pub mod sign_treaty;
pub mod veto_decision;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        296 => hold_election::apply(ctx),
        297 => pass_law::apply(ctx),
        298 => enforce_law::apply(ctx),
        299 => exile_member::apply(ctx),
        300 => pardon_criminal::apply(ctx),
        301 => levy_tax::apply(ctx),
        302 => conscript_warrior::apply(ctx),
        303 => grant_land::apply(ctx),
        304 => call_assembly::apply(ctx),
        305 => form_council::apply(ctx),
        306 => dissolve_council::apply(ctx),
        307 => declare_war::apply(ctx),
        308 => sign_treaty::apply(ctx),
        309 => establish_borders::apply(ctx),
        310 => grant_citizenship::apply(ctx),
        311 => impeach_leader::apply(ctx),
        312 => anoint_leader::apply(ctx),
        313 => veto_decision::apply(ctx),
        314 => revoke_privilege::apply(ctx),
        315 => issue_decree::apply(ctx),
        _ => 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::age_stage::AgeStage;
    use crate::sim::era::Era;
    use crate::sim::government::{Government, GovernmentKind, Law, LawKind};
    use crate::sim::simulation::Simulation;
    use crate::sim::spatial::SpatialIndex;
    use crate::sim::warfare::{has_active_treaty, TreatyKind, RAID_ATTITUDE_THRESHOLD};
    use crate::world::tiles::Tile;

    const LINEAGE: &str = "institution-test-lineage";
    const FOREIGN_LINEAGE: &str = "neighboring-test-lineage";

    fn prepare_lineage(seed: u64) -> Simulation {
        let mut sim = Simulation::new(seed);
        sim.organisms.truncate(5);
        assert_eq!(sim.organisms.len(), 5, "simulation should seed five founders");
        for (index, organism) in sim.organisms.iter_mut().enumerate() {
            organism.alive = true;
            organism.lineage_id = LINEAGE.into();
            organism.x = 100.0 + index as f32;
            organism.y = 100.0;
            organism.age = organism.max_age / 2;
            organism.is_elder = false;
            organism.health = 1.0;
            organism.specialty = None;
        }
        sim.grid.set(100, 100, Tile::Grass);
        sim.governments.clear();
        sim.governments.insert(
            LINEAGE.into(),
            Government::new(LINEAGE.into(), GovernmentKind::Republic, 1),
        );
        sim
    }

    fn prepare_neighboring_lineages(seed: u64) -> Simulation {
        let mut sim = prepare_lineage(seed);
        for (index, organism) in sim.organisms.iter_mut().enumerate().skip(3) {
            organism.lineage_id = FOREIGN_LINEAGE.into();
            organism.x = 101.0 + index as f32;
        }
        sim
    }

    fn run_action(sim: &mut Simulation, action: usize) -> f32 {
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(sim, 0, 100, 100, &spatial);
        apply(action, &mut ctx)
    }

    #[test]
    fn pass_law_enacts_an_era_valid_law_on_the_real_government() {
        let mut sim = prepare_lineage(0x60_0001);
        sim.tick_count = 77;
        sim.organisms[0].is_elder = true;
        sim.lineage_eras.insert(LINEAGE.into(), Era::PreStone);

        assert!(run_action(&mut sim, 297) > 0.0);

        let government = &sim.governments[LINEAGE];
        assert_eq!(government.laws.len(), 1);
        assert_eq!(government.laws[0].kind, LawKind::NoMurder);
        assert_eq!(government.laws[0].enacted_tick, 77);
    }

    #[test]
    fn levy_tax_changes_public_policy_without_moving_food_to_the_actor() {
        let mut sim = prepare_lineage(0x60_0002);
        sim.governments.get_mut(LINEAGE).unwrap().laws.push(Law {
            kind: LawKind::Taxation,
            enacted_tick: 1,
        });
        sim.governments.get_mut(LINEAGE).unwrap().tax_rate = 0.10;
        for (index, organism) in sim.organisms.iter_mut().enumerate() {
            organism.inv_food = 2 + index as u8;
        }
        let food_before: Vec<u8> = sim.organisms.iter().map(|organism| organism.inv_food).collect();

        assert!(run_action(&mut sim, 301) > 0.0);

        assert!((sim.governments[LINEAGE].tax_rate - 0.12).abs() < f32::EPSILON);
        assert_eq!(
            sim.organisms
                .iter()
                .map(|organism| organism.inv_food)
                .collect::<Vec<_>>(),
            food_before
        );
    }

    #[test]
    fn conscription_skips_children_and_elders_and_funds_a_trained_equipped_soldier() {
        let mut sim = prepare_lineage(0x60_0003);
        sim.lineage_eras.insert(LINEAGE.into(), Era::Industrial);
        let government = sim.governments.get_mut(LINEAGE).unwrap();
        government.treasury = 10;
        government.laws.push(Law {
            kind: LawKind::MilitaryService,
            enacted_tick: 1,
        });

        sim.organisms[1].age = sim.organisms[1].max_age * 15 / 100;
        sim.organisms[2].age = sim.organisms[2].max_age * 80 / 100;
        sim.organisms[3].age = sim.organisms[3].max_age * 30 / 100;
        sim.organisms[4].health = 0.2;
        assert_eq!(sim.organisms[1].age_stage(), AgeStage::Child);
        assert_eq!(sim.organisms[2].age_stage(), AgeStage::Elder);
        assert_eq!(sim.organisms[3].age_stage(), AgeStage::Teen);

        assert!(run_action(&mut sim, 302) > 0.0);

        assert!(sim.organisms[1].specialty.is_none());
        assert!(sim.organisms[2].specialty.is_none());
        let recruit = &sim.organisms[3];
        assert_eq!(recruit.specialty.as_deref(), Some("soldier"));
        assert!(recruit.discoveries.contains("military_training"));
        assert!(recruit.has_tool("rifle"));
        assert_eq!(sim.governments[LINEAGE].treasury, 6);
        assert!(sim.governments[LINEAGE].conscription);
    }

    #[test]
    fn signing_treaty_creates_a_conflict_blocking_reciprocal_agreement() {
        let mut sim = prepare_neighboring_lineages(0x60_0004);
        sim.tick_count = 40;

        assert!(run_action(&mut sim, 308) > 0.0);

        assert_eq!(sim.treaties.len(), 1);
        let treaty = &sim.treaties[0];
        assert_eq!(treaty.kind, TreatyKind::NonAggression);
        assert_eq!(treaty.signed_tick, 40);
        assert!(treaty.expires_tick > sim.tick_count);
        assert!(has_active_treaty(
            &sim.treaties,
            LINEAGE,
            FOREIGN_LINEAGE,
            sim.tick_count
        ));
        for organism in sim.organisms.iter().filter(|organism| organism.alive) {
            let other = if organism.lineage_id == LINEAGE {
                FOREIGN_LINEAGE
            } else {
                LINEAGE
            };
            assert!(organism.attitude_toward(other) > 0.0);
        }
    }

    #[test]
    fn signing_again_renews_the_pair_without_creating_a_duplicate() {
        let mut sim = prepare_neighboring_lineages(0x60_0005);
        sim.tick_count = 40;
        assert!(run_action(&mut sim, 308) > 0.0);
        let first_expiry = sim.treaties[0].expires_tick;

        sim.tick_count = 400;
        assert!(run_action(&mut sim, 308) > 0.0);

        assert_eq!(sim.treaties.len(), 1);
        assert_eq!(sim.treaties[0].signed_tick, 400);
        assert!(sim.treaties[0].expires_tick > first_expiry);
    }

    #[test]
    fn declaring_war_invalidates_the_treaty_and_makes_both_lineages_hostile() {
        let mut sim = prepare_neighboring_lineages(0x60_0006);
        sim.tick_count = 40;
        assert!(run_action(&mut sim, 308) > 0.0);

        sim.tick_count = 41;
        assert!(run_action(&mut sim, 307) > 0.0);

        assert!(!has_active_treaty(
            &sim.treaties,
            LINEAGE,
            FOREIGN_LINEAGE,
            sim.tick_count
        ));
        for organism in sim.organisms.iter().filter(|organism| organism.alive) {
            let other = if organism.lineage_id == LINEAGE {
                FOREIGN_LINEAGE
            } else {
                LINEAGE
            };
            assert!(organism.attitude_toward(other) <= RAID_ATTITUDE_THRESHOLD);
        }
    }

    #[test]
    fn action_signed_treaty_survives_save_and_load() {
        let mut sim = prepare_neighboring_lineages(0x60_0007);
        sim.tick_count = 40;
        assert!(run_action(&mut sim, 308) > 0.0);
        let seed = sim.world_seed;

        let loaded = Simulation::from_save(seed, sim.to_save_state());

        assert_eq!(loaded.treaties.len(), 1);
        assert_eq!(loaded.treaties[0].kind, TreatyKind::NonAggression);
        assert!(has_active_treaty(
            &loaded.treaties,
            LINEAGE,
            FOREIGN_LINEAGE,
            loaded.tick_count
        ));
    }
}
