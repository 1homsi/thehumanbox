use super::*;

pub(super) fn tick_milestones(sim: &mut Simulation) {
    let tick = sim.tick_count;
    let max_era = sim.lineage_eras.values().copied().max().unwrap_or(Era::PreStone);
    let alive_count = sim.organisms.iter().filter(|o| o.alive).count();
    let mut new_ms: Vec<Milestone> = Vec::new();

    let any_discoveries = |key: &str| {
        sim.organisms
            .iter()
            .any(|o| o.alive && o.discoveries.contains(key))
    };

    if any_discoveries("fire") {
        new_ms.push(Milestone::FirstFire);
    }
    if any_discoveries("stone_tools") {
        new_ms.push(Milestone::FirstTool);
    }
    if any_discoveries("shelter") {
        new_ms.push(Milestone::FirstShelter);
    }
    if any_discoveries("writing") {
        new_ms.push(Milestone::FirstWriting);
    }
    if !sim.books.is_empty() {
        new_ms.push(Milestone::FirstBook);
    }
    if !sim.religions.is_empty() {
        new_ms.push(Milestone::FirstReligion);
    }
    if !sim.battles.is_empty() {
        new_ms.push(Milestone::FirstWar);
    }
    if !sim.treaties.is_empty() {
        new_ms.push(Milestone::FirstTreaty);
    }

    if sim
        .buildings
        .iter()
        .any(|b| b.is_operational() && matches!(b.kind, BuildingKind::School))
    {
        new_ms.push(Milestone::FirstSchool);
    }
    if sim
        .buildings
        .iter()
        .any(|b| b.is_operational() && matches!(b.kind, BuildingKind::University))
    {
        new_ms.push(Milestone::FirstUniversity);
    }
    if sim
        .buildings
        .iter()
        .any(|b| b.is_operational() && matches!(b.kind, BuildingKind::Factory))
    {
        new_ms.push(Milestone::FirstFactory);
    }
    if sim
        .buildings
        .iter()
        .any(|b| b.is_operational() && matches!(b.kind, BuildingKind::Hospital))
    {
        new_ms.push(Milestone::FirstHospital);
    }
    if sim
        .buildings
        .iter()
        .any(|b| b.is_operational() && matches!(b.kind, BuildingKind::TrainStation))
    {
        new_ms.push(Milestone::FirstTrain);
    }
    if sim
        .buildings
        .iter()
        .any(|b| b.is_operational() && matches!(b.kind, BuildingKind::Airport))
    {
        new_ms.push(Milestone::FirstPlane);
    }

    if alive_count >= 100 {
        new_ms.push(Milestone::Pop100);
    }
    if alive_count >= 500 {
        new_ms.push(Milestone::Pop500);
    }
    if alive_count >= 1000 {
        new_ms.push(Milestone::Pop1000);
    }
    if alive_count >= 5000 {
        new_ms.push(Milestone::Pop5000);
    }

    if max_era >= Era::Renaissance {
        new_ms.push(Milestone::Renaissance);
    }
    if max_era >= Era::Industrial {
        new_ms.push(Milestone::Enlightenment);
    }
    if max_era >= Era::Information {
        new_ms.push(Milestone::InternetAge);
    }

    if sim
        .governments
        .values()
        .any(|g| matches!(g.kind, GovernmentKind::Republic))
    {
        new_ms.push(Milestone::RepublicBorn);
    }
    if sim
        .governments
        .values()
        .any(|g| matches!(g.kind, GovernmentKind::Democracy | GovernmentKind::Federation))
    {
        new_ms.push(Milestone::DemocracyBorn);
    }
    if sim
        .governments
        .values()
        .any(|g| matches!(g.kind, GovernmentKind::Empire))
    {
        new_ms.push(Milestone::EmpireBorn);
    }

    if !sim.outbreaks.is_empty() {
        new_ms.push(Milestone::FirstPlague);
    }

    let mut headlines: Vec<(u64, String)> = Vec::new();
    for ms in new_ms {
        let key = ms.name().to_string();
        if sim.milestones_achieved.insert(key.clone()) {
            push_event(&mut sim.events, tick, "milestone", "the world", ms.description());
            headlines.push((tick, format!("{}: {}", ms.name(), ms.description())));
        }
    }
    for h in headlines {
        sim.headlines.push_back(h);
        while sim.headlines.len() > 80 {
            sim.headlines.pop_front();
        }
    }
}
