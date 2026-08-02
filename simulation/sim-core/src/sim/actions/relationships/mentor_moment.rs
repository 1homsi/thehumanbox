use super::super::ctx::ActionCtx;
use crate::sim::{age_stage::AgeStage, simulation::Simulation, spatial::SpatialIndex};

const MENTORSHIP_COOLDOWN: u64 = 180;
const SPECIALTY_SESSIONS_REQUIRED: usize = 3;

fn recently_mentored(mentor: &crate::organism::organism::Organism, pupil_id: &str, tick: u64) -> bool {
    mentor.life_log.iter().rev().any(|entry| {
        entry.category == "mentorship"
            && entry.related_id.as_deref() == Some(pupil_id)
            && tick.saturating_sub(entry.tick) < MENTORSHIP_COOLDOWN
    })
}

fn prior_sessions(pupil: &crate::organism::organism::Organism, mentor_id: &str) -> usize {
    pupil
        .life_log
        .iter()
        .filter(|entry| entry.category == "mentorship" && entry.related_id.as_deref() == Some(mentor_id))
        .count()
}

fn is_close_relationship(sim: &Simulation, mentor_idx: usize, pupil_idx: usize) -> bool {
    let mentor = &sim.organisms[mentor_idx];
    let pupil = &sim.organisms[pupil_idx];
    pupil.lineage_id == mentor.lineage_id
        || mentor.friends.contains_key(&pupil.id)
        || mentor.org_trust.get(&pupil.id).copied().unwrap_or(0.0) >= 0.35
}

fn has_teachable_progress(sim: &Simulation, mentor_idx: usize, pupil_idx: usize) -> bool {
    let mentor = &sim.organisms[mentor_idx];
    let pupil = &sim.organisms[pupil_idx];
    mentor
        .discoveries
        .iter()
        .any(|discovery| !pupil.discoveries.contains(discovery))
        || mentor.literacy > pupil.literacy + 0.03
        || (mentor.specialty.is_some()
            && pupil.specialty.is_none()
            && matches!(pupil.age_stage(), AgeStage::Teen | AgeStage::Adult))
}

fn choose_pupil(sim: &Simulation, mentor_idx: usize, nearby: &[usize]) -> Option<usize> {
    let mentor = &sim.organisms[mentor_idx];
    let mentor_stage = mentor.age_stage();
    if !mentor_stage.can_teach() {
        return None;
    }
    let mut best: Option<(usize, bool, usize, f32, u32, f32)> = None;
    for &index in nearby {
        let pupil = &sim.organisms[index];
        let pupil_stage = pupil.age_stage();
        if index == mentor_idx
            || !pupil.alive
            || pupil_stage == AgeStage::Infant
            || pupil_stage.as_u8() >= mentor_stage.as_u8()
            || !is_close_relationship(sim, mentor_idx, index)
            || !has_teachable_progress(sim, mentor_idx, index)
            || recently_mentored(mentor, &pupil.id, sim.tick_count)
            || (pupil.x - mentor.x).abs() + (pupil.y - mentor.y).abs() > 6.0
        {
            continue;
        }
        let specialty = mentor.specialty.is_some() && pupil.specialty.is_none();
        let missing = mentor
            .discoveries
            .iter()
            .filter(|discovery| !pupil.discoveries.contains(*discovery))
            .count();
        let literacy_gap = (mentor.literacy - pupil.literacy).max(0.0);
        let trust = mentor.org_trust.get(&pupil.id).copied().unwrap_or(0.0);
        let replace = best.is_none_or(
            |(best_idx, best_specialty, best_missing, best_gap, best_age, best_trust)| {
                (specialty && !best_specialty)
                    || (specialty == best_specialty && missing > best_missing)
                    || (specialty == best_specialty && missing == best_missing && literacy_gap > best_gap)
                    || (specialty == best_specialty
                        && missing == best_missing
                        && literacy_gap == best_gap
                        && pupil.age < best_age)
                    || (specialty == best_specialty
                        && missing == best_missing
                        && literacy_gap == best_gap
                        && pupil.age == best_age
                        && trust > best_trust)
                    || (specialty == best_specialty
                        && missing == best_missing
                        && literacy_gap == best_gap
                        && pupil.age == best_age
                        && trust == best_trust
                        && pupil.id < sim.organisms[best_idx].id)
            },
        );
        if replace {
            best = Some((index, specialty, missing, literacy_gap, pupil.age, trust));
        }
    }
    best.map(|(index, _, _, _, _, _)| index)
}

pub(crate) fn can_apply_with_nearby(sim: &Simulation, mentor_idx: usize, nearby: &[usize]) -> bool {
    choose_pupil(sim, mentor_idx, nearby).is_some()
}

pub(crate) fn can_apply(sim: &Simulation, mentor_idx: usize, spatial: &SpatialIndex) -> bool {
    let mentor = &sim.organisms[mentor_idx];
    let nearby = spatial.query(mentor.x as i32, mentor.y as i32, 6);
    can_apply_with_nearby(sim, mentor_idx, &nearby)
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(pupil_idx) = choose_pupil(ctx.sim, ctx.idx, &ctx.near) else {
        ctx.think("no pupil ready for what I can teach");
        return 0.0;
    };

    let mentor_id = ctx.sim.organisms[ctx.idx].id.clone();
    let mentor_name = ctx.sim.organisms[ctx.idx].name.clone();
    let mentor_lineage = ctx.sim.organisms[ctx.idx].lineage_id.clone();
    let mentor_literacy = ctx.sim.organisms[ctx.idx].literacy;
    let mentor_specialty = ctx.sim.organisms[ctx.idx].specialty.clone();
    let pupil_id = ctx.sim.organisms[pupil_idx].id.clone();
    let pupil_name = ctx.sim.organisms[pupil_idx].name.clone();
    let pupil_lineage = ctx.sim.organisms[pupil_idx].lineage_id.clone();
    let taught_discovery = ctx.sim.organisms[ctx.idx]
        .discoveries
        .iter()
        .filter(|discovery| !ctx.sim.organisms[pupil_idx].discoveries.contains(*discovery))
        .min()
        .cloned();
    let sessions_after = prior_sessions(&ctx.sim.organisms[pupil_idx], &mentor_id) + 1;

    let mut specialty_gained = None;
    {
        let pupil = &mut ctx.sim.organisms[pupil_idx];
        if let Some(discovery) = &taught_discovery {
            pupil.discoveries.insert(discovery.clone());
        }
        if mentor_literacy > pupil.literacy {
            let gain = (0.02 + (mentor_literacy - pupil.literacy) * 0.08).min(0.06);
            pupil.literacy = (pupil.literacy + gain).min(mentor_literacy).min(1.0);
        }
        pupil.schooling_ticks = pupil.schooling_ticks.saturating_add(60);
        if sessions_after >= SPECIALTY_SESSIONS_REQUIRED
            && pupil.specialty.is_none()
            && matches!(pupil.age_stage(), AgeStage::Teen | AgeStage::Adult)
        {
            if let Some(specialty) = &mentor_specialty {
                pupil.specialty = Some(specialty.clone());
                specialty_gained = Some(specialty.clone());
            }
        }
        let trust = pupil.org_trust.entry(mentor_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.10).min(1.0);
        pupil.curiosity_drive = (pupil.curiosity_drive + 0.06).min(1.0);
        pupil.boredom = (pupil.boredom - 0.10).max(0.0);
        pupil.comfort = (pupil.comfort + 0.05).min(1.0);
        if mentor_lineage != pupil_lineage {
            pupil.update_attitude(&mentor_lineage, 0.025);
        }
        pupil.think(&format!("learning from {mentor_name}"), ctx.tick);
        let lesson = taught_discovery.as_deref().map_or_else(
            || "practical wisdom".to_string(),
            |discovery| discovery.replace('_', " "),
        );
        pupil.log_life_rel(
            ctx.tick,
            "mentorship",
            format!("learned {lesson} from {mentor_name}"),
            Some(mentor_id.clone()),
            Some(mentor_name.clone()),
        );
        if let Some(specialty) = &specialty_gained {
            pupil.log_life_rel(
                ctx.tick,
                "specialty",
                format!("became a {specialty} under {mentor_name}'s mentorship"),
                Some(mentor_id.clone()),
                Some(mentor_name.clone()),
            );
        }
    }
    {
        let mentor = &mut ctx.sim.organisms[ctx.idx];
        let trust = mentor.org_trust.entry(pupil_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.05).min(1.0);
        mentor.comfort = (mentor.comfort + 0.05).min(1.0);
        mentor.hope = (mentor.hope + 0.035).min(1.0);
        if mentor_lineage != pupil_lineage {
            mentor.update_attitude(&pupil_lineage, 0.015);
        }
        mentor.log_life_rel(
            ctx.tick,
            "mentorship",
            format!("mentored {pupil_name}"),
            Some(pupil_id.clone()),
            Some(pupil_name.clone()),
        );
    }

    if ctx.sim.organisms[pupil_idx]
        .org_trust
        .get(&mentor_id)
        .copied()
        .unwrap_or(0.0)
        >= 0.55
    {
        ctx.sim.organisms[pupil_idx].add_friend(&mentor_id, &mentor_name, ctx.tick);
    }
    if ctx.sim.organisms[ctx.idx]
        .org_trust
        .get(&pupil_id)
        .copied()
        .unwrap_or(0.0)
        >= 0.55
    {
        ctx.sim.organisms[ctx.idx].add_friend(&pupil_id, &pupil_name, ctx.tick);
    }

    let lesson = specialty_gained.as_deref().unwrap_or_else(|| {
        taught_discovery
            .as_deref()
            .map_or("shared experience", |discovery| discovery)
    });
    ctx.think(&format!("teaching {lesson} to {pupil_name}"));
    ctx.event("social", &format!("passed {lesson} on to {pupil_name}"));
    if specialty_gained.is_some() {
        0.024
    } else if taught_discovery.is_some() {
        0.016
    } else {
        0.010
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mentorship_world() -> (Simulation, usize, usize, usize) {
        let mut sim = Simulation::new(0x0A93_1701);
        for organism in &mut sim.organisms {
            organism.alive = false;
        }
        let mentor = 0;
        let advanced_pupil = 1;
        let novice_pupil = 2;
        for (index, x) in [(mentor, 90.0), (advanced_pupil, 91.0), (novice_pupil, 92.0)] {
            sim.organisms[index].alive = true;
            sim.organisms[index].x = x;
            sim.organisms[index].y = 90.0;
        }
        sim.organisms[mentor].age = sim.organisms[mentor].max_age * 4 / 5;
        sim.organisms[advanced_pupil].age = sim.organisms[advanced_pupil].max_age * 3 / 10;
        sim.organisms[novice_pupil].age = sim.organisms[novice_pupil].max_age * 3 / 10;
        sim.tick_count = 3_000;
        (sim, mentor, advanced_pupil, novice_pupil)
    }

    #[test]
    fn mentorship_targets_the_largest_gap_and_transfers_real_knowledge() {
        let (mut sim, mentor, advanced_pupil, novice_pupil) = mentorship_world();
        let mentor_id = sim.organisms[mentor].id.clone();
        let novice_id = sim.organisms[novice_pupil].id.clone();
        sim.organisms[mentor].discoveries = ["fire", "writing"].into_iter().map(String::from).collect();
        sim.organisms[mentor].literacy = 0.80;
        sim.organisms[advanced_pupil].discoveries.insert("fire".into());
        sim.organisms[advanced_pupil].literacy = 0.60;
        sim.organisms[novice_pupil].literacy = 0.10;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, mentor, 90, 90, &spatial);

        assert!(apply(&mut ctx) > 0.0);

        assert!(sim.organisms[novice_pupil].discoveries.contains("fire"));
        assert!(!sim.organisms[advanced_pupil].discoveries.contains("writing"));
        assert!(sim.organisms[novice_pupil].literacy > 0.10);
        assert_eq!(sim.organisms[novice_pupil].schooling_ticks, 60);
        assert_eq!(sim.organisms[novice_pupil].org_trust[&mentor_id], 0.10);

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_pupil = loaded
            .organisms
            .iter()
            .find(|organism| organism.id == novice_id)
            .unwrap();
        assert!(loaded_pupil.discoveries.contains("fire"));
        assert_eq!(loaded_pupil.schooling_ticks, 60);
        assert!(loaded_pupil
            .life_log
            .iter()
            .any(|entry| entry.category == "mentorship"));
    }

    #[test]
    fn repeated_sessions_pass_down_the_mentors_profession() {
        let (mut sim, mentor, advanced_pupil, novice_pupil) = mentorship_world();
        sim.organisms[advanced_pupil].alive = false;
        sim.organisms[mentor].specialty = Some("smith".into());
        for session in 0..SPECIALTY_SESSIONS_REQUIRED {
            let spatial = SpatialIndex::build(&sim.organisms, 10);
            assert!(crate::sim::actions::try_apply(&mut sim, mentor, 243, 90, 90, &spatial).is_some());
            if session + 1 < SPECIALTY_SESSIONS_REQUIRED {
                assert_eq!(sim.organisms[novice_pupil].specialty, None);
            }
            sim.tick_count += MENTORSHIP_COOLDOWN;
        }

        assert_eq!(sim.organisms[novice_pupil].specialty.as_deref(), Some("smith"));
        assert!(sim.organisms[novice_pupil]
            .life_log
            .iter()
            .any(|entry| entry.category == "specialty" && entry.text.contains("mentorship")));
    }

    #[test]
    fn action_requires_a_teachable_younger_person_and_enforces_cooldown() {
        let (mut sim, mentor, advanced_pupil, _novice_pupil) = mentorship_world();
        sim.organisms[advanced_pupil].alive = false;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, mentor, 90, 90, &spatial).contains(&243));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, mentor, 243, 90, 90, &spatial),
            None
        );

        sim.organisms[mentor].discoveries.insert("fire".into());
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(crate::sim::actions::available_actions(&sim, mentor, 90, 90, &spatial).contains(&243));
        assert!(crate::sim::actions::try_apply(&mut sim, mentor, 243, 90, 90, &spatial).is_some());
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, mentor, 90, 90, &spatial).contains(&243));

        sim.tick_count += MENTORSHIP_COOLDOWN;
        sim.organisms[mentor].discoveries.insert("writing".into());
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(crate::sim::actions::available_actions(&sim, mentor, 90, 90, &spatial).contains(&243));
    }

    #[test]
    fn trusted_cross_lineage_pupil_can_be_mentored() {
        let (mut sim, mentor, advanced_pupil, novice_pupil) = mentorship_world();
        sim.organisms[advanced_pupil].alive = false;
        let mentor_lineage = sim.organisms[mentor].lineage_id.clone();
        let pupil_lineage = "apprentice-lineage".to_string();
        let pupil_id = sim.organisms[novice_pupil].id.clone();
        sim.organisms[novice_pupil].lineage_id.clone_from(&pupil_lineage);
        sim.organisms[mentor].org_trust.insert(pupil_id, 0.40);
        sim.organisms[mentor].discoveries.insert("writing".into());
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, mentor, 90, 90, &spatial);

        assert!(apply(&mut ctx) > 0.0);
        assert!(sim.organisms[mentor].attitude_toward(&pupil_lineage) > 0.0);
        assert!(sim.organisms[novice_pupil].attitude_toward(&mentor_lineage) > 0.0);
    }
}
