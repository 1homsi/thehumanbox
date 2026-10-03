use super::*;

/// Diseases progress and spread on this cadence.
pub(super) const DISEASE_STEP: u64 = 100;

/// Health a disease takes per step, per point of lethality, untreated.
pub(super) const DISEASE_HARM: f32 = 4.0;

/// Chance per step and contact, per point of contagion.
pub(super) const DISEASE_SPREAD: f32 = 0.25;

/// How often each disease turns up: colds all the time, plague rarely.
pub(super) fn introduction_weight(kind: DiseaseKind) -> u32 {
    match kind {
        DiseaseKind::Cold => 10,
        DiseaseKind::Flu | DiseaseKind::Fever => 6,
        DiseaseKind::Influenza | DiseaseKind::Scurvy => 3,
        DiseaseKind::Pox | DiseaseKind::Malaria => 2,
        DiseaseKind::Cholera | DiseaseKind::Tuberculosis => 2,
        DiseaseKind::Plague => 1,
    }
}

pub(super) fn disease_kind(name: &str) -> Option<DiseaseKind> {
    Some(match name {
        "cold" => DiseaseKind::Cold,
        "flu" => DiseaseKind::Flu,
        "fever" => DiseaseKind::Fever,
        "plague" => DiseaseKind::Plague,
        "cholera" => DiseaseKind::Cholera,
        "pox" => DiseaseKind::Pox,
        "tuberculosis" => DiseaseKind::Tuberculosis,
        "influenza" => DiseaseKind::Influenza,
        "malaria" => DiseaseKind::Malaria,
        "scurvy" => DiseaseKind::Scurvy,
        _ => return None,
    })
}

/// The share of a disease's harm the best treatment of an era removes.
pub(super) fn treatment_relief(era: Era, kind: DiseaseKind) -> f32 {
    use crate::sim::medicine::TreatmentKind::*;
    [
        Herbal,
        Bloodletting,
        Quinine,
        Antibiotics,
        Vaccine,
        Surgery,
        GeneTherapy,
    ]
    .into_iter()
    .filter(|t| t.era_unlock() <= era)
    .map(|t| t.effectiveness(kind))
    .fold(0.0f32, f32::max)
    .clamp(0.0, 0.98)
}

pub(super) fn tick_disease_introduce(sim: &mut Simulation) {
    let era = sim.lineage_eras.values().copied().max().unwrap_or(Era::PreStone);
    // Half the time nothing new turns up; when something does, mild
    // illnesses are far likelier than deadly ones.
    if sim.rng.random::<f32>() < 0.5 {
        return;
    }
    let candidates: Vec<DiseaseKind> = [
        DiseaseKind::Cold,
        DiseaseKind::Flu,
        DiseaseKind::Fever,
        DiseaseKind::Plague,
        DiseaseKind::Cholera,
        DiseaseKind::Pox,
        DiseaseKind::Tuberculosis,
        DiseaseKind::Influenza,
        DiseaseKind::Malaria,
        DiseaseKind::Scurvy,
    ]
    .into_iter()
    .filter(|k| k.era_appearance() <= era)
    .collect();
    let total: u32 = candidates.iter().map(|&k| introduction_weight(k)).sum();
    if total == 0 {
        return;
    }
    let mut roll = sim.rng.random_range(0..total);
    let Some(kind) = candidates.iter().copied().find(|&k| {
        let w = introduction_weight(k);
        if roll < w {
            true
        } else {
            roll -= w;
            false
        }
    }) else {
        return;
    };
    let alive: Vec<usize> = sim
        .organisms
        .iter()
        .enumerate()
        .filter_map(|(i, o)| if o.alive { Some(i) } else { None })
        .collect();
    if alive.is_empty() {
        return;
    }
    let pick = alive[sim.rng.random_range(0..alive.len())];
    // A warded place is spared the new sickness that comes out of nowhere.
    if sim.warded(sim.organisms[pick].x, sim.organisms[pick].y) {
        return;
    }
    let name = kind.name().to_string();
    let already = sim.organisms[pick].diseases.iter().any(|(d, _)| d == &name);
    let immune = sim.organisms[pick]
        .disease_immunity
        .get(&name)
        .copied()
        .unwrap_or(0)
        > sim.tick_count;
    if already || immune {
        return;
    }
    sim.organisms[pick].diseases.push((name.clone(), sim.tick_count));
    let org_name = sim.organisms[pick].name.clone();
    push_event(
        &mut sim.events,
        sim.tick_count,
        "got_sick",
        &org_name,
        &format!("contracted {}", kind.name()),
    );
}

#[cfg(test)]
pub(crate) fn tick_disease_spread_for_test(sim: &mut Simulation) {
    tick_disease_spread(sim);
}

pub(super) fn tick_disease_spread(sim: &mut Simulation) {
    // A contact only depends on current positions. Keep population order for
    // contagion RNG while avoiding a full-population pass per infected person.
    let spatial = SpatialIndex::build(&sim.organisms, 8);
    let infected: Vec<(usize, Vec<String>)> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(_, o)| o.alive && !o.diseases.is_empty())
        .map(|(i, o)| (i, o.diseases.iter().map(|(k, _)| k.clone()).collect()))
        .collect();
    let mut new_infections: Vec<(usize, String)> = Vec::new();
    for (i, ds) in &infected {
        let (x, y) = (sim.organisms[*i].x, sim.organisms[*i].y);
        for (j, target) in spatial.ordered_nearby(&sim.organisms, x, y, 3) {
            if *i == j || !target.alive {
                continue;
            }
            let dx = x - target.x;
            let dy = y - target.y;
            if dx * dx + dy * dy > 6.0 {
                continue;
            }
            // Under the gods' ward no one catches what a neighbour carries.
            if sim.warded(target.x, target.y) {
                continue;
            }
            for d in ds {
                let Some(kind) = disease_kind(d) else { continue };
                // Healers keep their distance and wash; they catch less.
                let care = if target.discoveries.contains("medicine") {
                    0.6
                } else {
                    1.0
                };
                if sim.rng.random::<f32>() < kind.contagion() * DISEASE_SPREAD * care {
                    new_infections.push((j, d.clone()));
                }
            }
        }
    }
    for (idx, name) in new_infections {
        let already = sim.organisms[idx].diseases.iter().any(|(d, _)| d == &name);
        let immune = sim.organisms[idx]
            .disease_immunity
            .get(&name)
            .copied()
            .unwrap_or(0)
            > sim.tick_count;
        if already || immune {
            continue;
        }
        sim.organisms[idx].diseases.push((name, sim.tick_count));
    }

    let tick = sim.tick_count;
    let eras = sim.lineage_eras.clone();
    let mut deaths: Vec<String> = Vec::new();
    for o in sim.organisms.iter_mut() {
        if !o.alive {
            continue;
        }
        let era = eras.get(&o.lineage_id).copied().unwrap_or(Era::PreStone);
        let healer = if o.discoveries.contains("medicine") {
            0.6
        } else {
            1.0
        };
        let mut to_remove: Vec<usize> = Vec::new();
        for (idx, (kind_name, started)) in o.diseases.iter().enumerate() {
            let Some(kind) = disease_kind(kind_name) else {
                continue;
            };
            // Untreated, a plague usually kills; a cold never does. Medicine
            // and the treatments of later eras take most of the harm away.
            let harm = kind.lethality() * DISEASE_HARM * healer * (1.0 - treatment_relief(era, kind));
            o.health -= harm;
            o.last_harm = Some((crate::organism::organism::Harm::Sickness, tick));
            o.infection = o.infection.max((kind.lethality() * 8.0).min(0.7));
            if o.health <= 0.0 {
                // Below zero hands the death to the person's own tick, after
                // this tick's rest and healing, and records it as sickness.
                o.health = -1.0;
                o.infection = o.infection.max(0.31);
            }
            if tick - started > kind.duration_ticks() as u64 {
                to_remove.push(idx);
                o.disease_immunity.insert(kind_name.clone(), tick + 50000);
            }
        }
        for &i in to_remove.iter().rev() {
            o.diseases.remove(i);
        }
        if o.health <= 0.0 && o.alive {
            deaths.push(o.name.clone());
        }
    }
    for n in deaths.iter().take(5) {
        push_event(&mut sim.events, tick, "disease_death", n, "succumbed to illness");
    }
    announce_outbreaks(sim);
}

/// Once a disease takes hold of five people in a tribe, it is news.
pub(super) fn announce_outbreaks(sim: &mut Simulation) {
    let tick = sim.tick_count;
    let mut cases: std::collections::BTreeMap<(String, String), (u32, f32, f32)> = Default::default();
    for o in sim.organisms.iter().filter(|o| o.alive) {
        for (d, _) in &o.diseases {
            let e = cases.entry((o.lineage_id.clone(), d.clone())).or_default();
            e.0 += 1;
            e.1 += o.x;
            e.2 += o.y;
        }
    }
    for ((lineage, disease), (n, sx, sy)) in cases {
        let Some(kind) = disease_kind(&disease) else {
            continue;
        };
        if n < 5 || kind.lethality() < 0.01 {
            continue;
        }
        let ongoing = sim.outbreaks.iter().any(|ob| {
            ob.kind == kind && tick.saturating_sub(ob.started_tick) < u64::from(kind.duration_ticks())
        });
        if ongoing {
            continue;
        }
        let at = [(sx / n as f32) as i32, (sy / n as f32) as i32];
        sim.outbreaks.push(crate::sim::medicine::Outbreak {
            kind,
            epicenter: at,
            started_tick: tick,
            affected_count: n,
            deaths: 0,
        });
        if sim.outbreaks.len() > 40 {
            sim.outbreaks.remove(0);
        }
        let tribe = sim
            .lineage_names
            .get(&lineage)
            .cloned()
            .unwrap_or_else(|| "a tribe".into());
        let line = format!(
            "\u{1F912} {} spreads among the {}.",
            capitalize(kind.name()),
            tribe
        );
        push_event(
            &mut sim.events,
            tick,
            "outbreak",
            &tribe,
            &format!("{} spreads", kind.name()),
        );
        sim.headlines.push_back((tick, line));
        while sim.headlines.len() > 80 {
            sim.headlines.pop_front();
        }
    }
}
