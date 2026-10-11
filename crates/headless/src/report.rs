use super::*;

pub(super) fn print_history(sim: &Simulation, thought_freq: HashMap<String, u64>) {
    let h = &sim.history;
    println!(
        "births:      {}  |  deaths: old={} starv={} dehy={} sick={} combat={} beasts={} drowned={} fire={} disaster={}",
        h.births,
        h.deaths_old_age,
        h.deaths_starvation,
        h.deaths_dehydration,
        h.deaths_sickness,
        h.deaths_combat,
        h.deaths_beasts,
        h.deaths_drowning,
        h.deaths_fire,
        h.deaths_disaster
    );
    println!(
        "alliances:   {}  challenges: {}  gifts: {}",
        h.alliances_formed, h.challenges_total, h.gifts_total
    );
    println!("droughts:    {}  outbreaks: {}", h.droughts, h.outbreaks);

    let mut freq_vec: Vec<(String, u64)> = thought_freq.into_iter().collect();
    freq_vec.sort_by_key(|e| std::cmp::Reverse(e.1));
    println!("\nTop behaviors (thought frequency across all organism-ticks):");
    for (thought, count) in freq_vec.iter().take(10) {
        println!("  {:>10}  {}", count, thought);
    }
}

pub(super) fn print_economy(sim: &Simulation) {
    let fire_disc = sim
        .organisms
        .iter()
        .filter(|o| o.discoveries.contains("fire"))
        .count();
    let shelter_disc = sim
        .organisms
        .iter()
        .filter(|o| o.discoveries.contains("shelter"))
        .count();
    let hunt_disc = sim
        .organisms
        .iter()
        .filter(|o| o.discoveries.contains("hunt"))
        .count();
    let medicine_disc = sim
        .organisms
        .iter()
        .filter(|o| o.discoveries.contains("medicine"))
        .count();
    let barter_disc = sim
        .organisms
        .iter()
        .filter(|o| o.discoveries.contains("barter"))
        .count();
    let currency_disc = sim
        .organisms
        .iter()
        .filter(|o| o.discoveries.contains("currency"))
        .count();
    let wood_disc = sim
        .organisms
        .iter()
        .filter(|o| o.discoveries.contains("woodcutting"))
        .count();
    let forestry_disc = sim
        .organisms
        .iter()
        .filter(|o| o.discoveries.contains("forestry"))
        .count();
    let rich_n = sim
        .organisms
        .iter()
        .filter(|o| o.alive && o.discoveries.contains("rich"))
        .count();
    let poor_n = sim
        .organisms
        .iter()
        .filter(|o| o.alive && o.discoveries.contains("poor"))
        .count();
    println!(
        "\nDiscoveries (ever, alive+dead):  fire={}  shelter={}  hunt={}  medicine={}  woodcutting={}  forestry={}  barter={}  currency={}",
        fire_disc, shelter_disc, hunt_disc, medicine_disc, wood_disc, forestry_disc, barter_disc, currency_disc
    );
    println!(
        "Wealth split (alive):  rich={}  poor={}  trades_log={}",
        rich_n,
        poor_n,
        sim.trades.len()
    );

    let mut goods_totals: HashMap<String, u64> = HashMap::new();
    let mut goods_holders: HashMap<String, u64> = HashMap::new();
    for o in sim.organisms.iter().filter(|o| o.alive) {
        for (k, n) in &o.tools {
            if *n == 0 {
                continue;
            }
            *goods_totals.entry(k.clone()).or_insert(0) += *n as u64;
            *goods_holders.entry(k.clone()).or_insert(0) += 1;
        }
    }
    if !goods_totals.is_empty() {
        let mut goods_vec: Vec<(String, u64)> = goods_totals.into_iter().collect();
        goods_vec.sort_by_key(|e| std::cmp::Reverse(e.1));
        println!("\nGoods in circulation (alive holders):");
        for (good, total) in goods_vec.iter().take(20) {
            let holders = goods_holders.get(good).copied().unwrap_or(0);
            println!("  {:>4} total  {:>3} holders  {}", total, holders, good);
        }
    }
    let mut trade_goods: HashMap<String, u64> = HashMap::new();
    for t in &sim.trades {
        *trade_goods.entry(t.good.clone()).or_insert(0) += t.amount as u64;
    }
    if !trade_goods.is_empty() {
        let mut tg: Vec<(String, u64)> = trade_goods.into_iter().collect();
        tg.sort_by_key(|e| std::cmp::Reverse(e.1));
        println!("Trade volume by good:");
        for (g, n) in tg.iter().take(15) {
            println!("  {:>4}  {}", n, g);
        }
    }
}

pub(super) fn print_coverage(sim: &Simulation) {
    if !sim.action_counts.is_empty() {
        let mut rows: Vec<(&'static str, u64)> = sim.action_counts.iter().map(|(k, v)| (*k, *v)).collect();
        rows.sort_by_key(|e| std::cmp::Reverse(e.1));
        println!("\nRound-9 category coverage (action firings):");
        for (cat, n) in rows {
            println!("  {:>7}  {}", n, cat);
        }
    }
    if !sim.decision_counts.is_empty() {
        let total: u64 = sim.decision_counts.values().sum();
        let mut rows: Vec<(&'static str, u64)> = sim.decision_counts.iter().map(|(k, v)| (*k, *v)).collect();
        rows.sort_by_key(|e| std::cmp::Reverse(e.1));
        println!("\nDecision origin coverage:");
        for (origin, n) in rows {
            let pct = if total > 0 {
                (n as f64 / total as f64) * 100.0
            } else {
                0.0
            };
            println!("  {:>7}  {:>5.1}%  {}", n, pct, origin);
        }
    }
    let mut era_counts: HashMap<String, usize> = HashMap::new();
    for era in sim.lineage_eras.values() {
        *era_counts.entry(era.name().to_string()).or_insert(0) += 1;
    }
    let mut era_pairs: Vec<(String, usize)> = era_counts.into_iter().collect();
    era_pairs.sort_by_key(|e| std::cmp::Reverse(e.1));
    print!("Lineage eras:");
    for (e, c) in era_pairs.iter() {
        print!(" {}={}", e, c)
    }
    println!();
    if !sim.lineage_eras.is_empty() {
        let mut lineage_discoveries: HashMap<String, HashSet<String>> = HashMap::new();
        let mut lineage_pop: HashMap<String, usize> = HashMap::new();
        for org in sim.organisms.iter().filter(|o| o.alive) {
            *lineage_pop.entry(org.lineage_id.clone()).or_insert(0) += 1;
            let entry = lineage_discoveries.entry(org.lineage_id.clone()).or_default();
            for d in &org.discoveries {
                entry.insert(d.clone());
            }
        }
        let mut blockers: Vec<(String, String, usize, usize, Vec<&str>)> = sim
            .lineage_eras
            .iter()
            .filter_map(|(lid, era)| {
                let next = era.advance()?;
                let pop = *lineage_pop.get(lid).unwrap_or(&0);
                let required_pop = next.pop_threshold();
                let known = lineage_discoveries.get(lid);
                let missing: Vec<&str> = next
                    .required_discoveries()
                    .iter()
                    .copied()
                    .filter(|d| !known.is_some_and(|set| set.contains(*d)))
                    .collect();
                if missing.is_empty() && pop >= required_pop {
                    return None;
                }
                Some((lid.clone(), next.name().to_string(), pop, required_pop, missing))
            })
            .collect();
        blockers.sort_by(|a, b| b.2.cmp(&a.2).then_with(|| a.1.cmp(&b.1)));
        if !blockers.is_empty() {
            println!("Era advancement blockers:");
            for (lid, next, pop, required_pop, missing) in blockers.into_iter().take(8) {
                let name = sim
                    .lineage_names
                    .get(&lid)
                    .cloned()
                    .unwrap_or_else(|| lid.chars().take(8).collect());
                let pop_gate = if pop < required_pop {
                    format!(" pop {pop}/{required_pop}")
                } else {
                    String::new()
                };
                let missing_gate = if missing.is_empty() {
                    String::new()
                } else {
                    format!(" missing {}", missing.join(","))
                };
                println!("  {} -> {}{}{}", name, next, pop_gate, missing_gate);
            }
        }
    }
}

pub(super) fn print_mood(sim: &Simulation) {
    let mut aspirations: HashMap<String, usize> = HashMap::new();
    let mut joy_count = 0usize;
    let mut grief_count = 0usize;
    let mut joy_total = 0u64;
    let mut witnessed_count = 0usize;
    let mut life_log_total = 0usize;
    for o in sim.organisms.iter().filter(|o| o.alive) {
        if !o.aspiration.is_empty() {
            *aspirations.entry(o.aspiration.clone()).or_insert(0) += 1;
        }
        if o.joy_ticks > 0 {
            joy_count += 1;
            joy_total += o.joy_ticks as u64;
        }
        if o.grief_ticks > 0 {
            grief_count += 1;
        }
        for entry in &o.life_log {
            life_log_total += 1;
            if entry.category == "witnessed" {
                witnessed_count += 1;
            }
        }
    }
    println!("\n=== ALIVE SYSTEMS ===");
    println!(
        "Aspirations assigned: {} (across {} types)",
        aspirations.values().sum::<usize>(),
        aspirations.len()
    );
    let mut asp_pairs: Vec<(String, usize)> = aspirations.into_iter().collect();
    asp_pairs.sort_by_key(|e| std::cmp::Reverse(e.1));
    for (asp, n) in asp_pairs.iter() {
        println!("  {:>4}  {}", n, asp);
    }
    let joy_avg = if joy_count > 0 {
        joy_total / joy_count as u64
    } else {
        0
    };
    println!(
        "Joy ticks active: {} orgs (avg {} ticks each)",
        joy_count, joy_avg
    );
    println!("Grief ticks active: {} orgs", grief_count);
    println!(
        "Witnessed life_log entries: {} (of {} total life-log)",
        witnessed_count, life_log_total
    );

    {
        let mut by_kind: HashMap<String, u64> = HashMap::new();
        let mut total_mem = 0u64;
        let mut sal_sum = 0.0f64;
        let mut alive_with_mem = 0u64;
        let mut most_recalled: Option<(String, u32, String)> = None;
        for o in sim.organisms.iter().filter(|o| o.alive) {
            if !o.memories.is_empty() {
                alive_with_mem += 1;
            }
            for m in o.memories.entries.iter() {
                *by_kind.entry(m.kind.label().to_string()).or_insert(0) += 1;
                total_mem += 1;
                sal_sum += m.salience as f64;
                if m.recall_count > 0 {
                    let take = match &most_recalled {
                        None => true,
                        Some((_, rc, _)) => m.recall_count > *rc,
                    };
                    if take {
                        most_recalled = Some((o.name.clone(), m.recall_count, m.text.clone()));
                    }
                }
            }
        }
        let avg_sal = if total_mem > 0 {
            sal_sum / total_mem as f64
        } else {
            0.0
        };
        println!(
            "\nMemory store: {} entries across {} living orgs (avg salience {:.2})",
            total_mem, alive_with_mem, avg_sal
        );
        let mut pairs: Vec<(String, u64)> = by_kind.into_iter().collect();
        pairs.sort_by_key(|e| std::cmp::Reverse(e.1));
        for (k, n) in pairs.iter() {
            println!("  {:>6} {}", n, k);
        }
        if let Some((name, rc, text)) = most_recalled {
            let preview = if text.len() > 64 {
                format!("{}…", &text[..64])
            } else {
                text
            };
            println!("  most-recalled: {} ({}x) — {}", name, rc, preview);
        }

        let mut deepest_grief: Option<(String, String)> = None;
        let mut greatest_joy: Option<(String, String)> = None;
        let mut deepest_grief_score: f32 = 0.0;
        let mut greatest_joy_score: f32 = 0.0;
        for o in sim.organisms.iter().filter(|o| o.alive) {
            for m in o.memories.entries.iter() {
                if m.emotion <= -2 {
                    let score = (-m.emotion as f32) * m.salience;
                    if score > deepest_grief_score {
                        deepest_grief_score = score;
                        deepest_grief = Some((o.name.clone(), m.text.clone()));
                    }
                }
                if m.emotion >= 2 {
                    let score = m.emotion as f32 * m.salience;
                    if score > greatest_joy_score {
                        greatest_joy_score = score;
                        greatest_joy = Some((o.name.clone(), m.text.clone()));
                    }
                }
            }
        }
        if let Some((name, text)) = greatest_joy {
            let preview = if text.len() > 64 {
                format!("{}…", &text[..64])
            } else {
                text
            };
            println!("  greatest joy: {} — {}", name, preview);
        }
        if let Some((name, text)) = deepest_grief {
            let preview = if text.len() > 64 {
                format!("{}…", &text[..64])
            } else {
                text
            };
            println!("  deepest grief: {} — {}", name, preview);
        }
    }
}

pub(super) fn print_institutions(sim: &Simulation) {
    if !sim.workshop_hits.is_empty() {
        println!("\n=== WORKSHOP BONUS ===");
        let mut rows: Vec<(&str, (u64, u64))> = sim.workshop_hits.iter().map(|(k, v)| (*k, *v)).collect();
        rows.sort_by_key(|e| std::cmp::Reverse(e.1 .0 + e.1 .1));
        let (mut h, mut m) = (0u64, 0u64);
        for (cat, (hit, miss)) in &rows {
            let total = hit + miss;
            let pct = if total > 0 {
                *hit as f64 * 100.0 / total as f64
            } else {
                0.0
            };
            println!(
                "  {:<18} {:>6} hit / {:>6} miss  ({:.1}% near workshop)",
                cat, hit, miss, pct
            );
            h += hit;
            m += miss;
        }
        let total = h + m;
        let pct = if total > 0 {
            h as f64 * 100.0 / total as f64
        } else {
            0.0
        };
        println!(
            "  {:<18} {:>6} hit / {:>6} miss  ({:.1}% overall)",
            "TOTAL", h, m, pct
        );
    }

    println!("\n=== CIVILIZATION ===");
    let total_adherents: u32 = sim.religions.iter().map(|r| r.adherents).sum();
    let milestones_hit: usize = sim
        .religions
        .iter()
        .filter(|r| r.last_milestone.is_some())
        .count();
    println!(
        "Religions: {}   total_adherents={}   milestone_crossings={}",
        sim.religions.len(),
        total_adherents,
        milestones_hit
    );
    if !sim.religions.is_empty() {
        let mut religions_sorted: Vec<_> = sim.religions.iter().collect();
        religions_sorted.sort_by_key(|r| std::cmp::Reverse(r.adherents));
        for r in religions_sorted.iter().take(5) {
            let last = r
                .last_milestone
                .map(|m| format!(" peaked@{}", m))
                .unwrap_or_default();
            println!(
                "  {:<20} kind={:<14} adherents={}{}",
                r.name,
                format!("{:?}", r.kind),
                r.adherents,
                last
            );
        }
    }

    let total_treasury: u64 = sim.governments.values().map(|g| g.treasury).sum();
    let mut gov_kinds: HashMap<String, usize> = HashMap::new();
    for g in sim.governments.values() {
        *gov_kinds.entry(g.kind.name().to_string()).or_insert(0) += 1;
    }
    println!(
        "Governments: {}   total_treasury={}",
        sim.governments.len(),
        total_treasury
    );
    if !gov_kinds.is_empty() {
        let mut gk: Vec<(String, usize)> = gov_kinds.into_iter().collect();
        gk.sort_by_key(|e| std::cmp::Reverse(e.1));
        print!("  kinds:");
        for (k, n) in gk.iter() {
            print!(" {}={}", k, n);
        }
        println!();
    }
    let leader_count = sim.organisms.iter().filter(|o| o.alive && o.is_leader).count();
    println!("  leaders alive: {}", leader_count);
}

pub(super) fn print_society(sim: &Simulation) {
    let mut bldg_by_kind: HashMap<String, usize> = HashMap::new();
    for b in &sim.buildings {
        *bldg_by_kind.entry(b.kind.name().to_string()).or_insert(0) += 1;
    }
    println!("Buildings: {} total", sim.buildings.len());
    let mut bbk: Vec<(String, usize)> = bldg_by_kind.into_iter().collect();
    bbk.sort_by_key(|e| std::cmp::Reverse(e.1));
    for (k, n) in bbk.iter().take(12) {
        println!("  {:>4}  {}", n, k);
    }

    println!(
        "Books: {}   Artworks: {}   Festivals: {}",
        sim.books.len(),
        sim.artworks.len(),
        sim.festivals.len()
    );
    if !sim.books.is_empty() {
        let total_copies: u32 = sim.books.iter().map(|b| b.copies).sum();
        println!("  total book copies: {}", total_copies);
    }

    let mut spec_counts: HashMap<String, usize> = HashMap::new();
    let mut partnered = 0usize;
    let mut total_children = 0u64;
    let mut adult_count = 0usize;
    let mut friendship_total = 0u64;
    let mut age_at_death_sum = 0u64;
    let mut age_at_death_n = 0u64;
    for o in sim.organisms.iter() {
        if !o.alive {
            if o.age > 0 {
                age_at_death_sum += o.age as u64;
                age_at_death_n += 1;
            }
            continue;
        }
        if let Some(s) = &o.specialty {
            *spec_counts.entry(s.clone()).or_insert(0) += 1;
        }
        if o.partner_id.is_some() {
            partnered += 1;
        }
        total_children += o.children_count as u64;
        if o.age > 200 {
            adult_count += 1;
        }
        friendship_total += o.friends.len() as u64;
    }
    let mut sc: Vec<(String, usize)> = spec_counts.into_iter().collect();
    sc.sort_by_key(|e| std::cmp::Reverse(e.1));
    println!("\nFamily / society:");
    println!("  partnerships:   {}", partnered / 2);
    println!("  total children: {}", total_children);
    let avg_children = if adult_count > 0 {
        total_children as f64 / adult_count as f64
    } else {
        0.0
    };
    println!("  avg children per adult: {:.2}", avg_children);
    println!("  friendships:    {}", friendship_total);
    if let Some(mean_age) = age_at_death_sum.checked_div(age_at_death_n) {
        println!("  mean age at death: {} ticks", mean_age);
    }
    if !sc.is_empty() {
        print!("  specialties:");
        for (s, n) in sc.iter().take(10) {
            print!(" {}={}", s, n);
        }
        println!();
    }
}

pub(super) fn print_progress(sim: &Simulation) {
    let n_lineages = sim.lineage_eras.len().max(1);
    let era_idx_sum: u64 = sim.lineage_eras.values().map(|e| *e as u64).sum();
    let era_idx_max: u64 = sim.lineage_eras.values().map(|e| *e as u64).max().unwrap_or(0);
    let era_idx_avg = era_idx_sum as f64 / n_lineages as f64;
    println!(
        "Civ progression: era_avg={:.2} era_max={} headlines={}",
        era_idx_avg,
        era_idx_max,
        sim.headlines.len()
    );
    {
        let mut by_kind: HashMap<String, usize> = HashMap::new();
        for a in sim.animals.iter().filter(|a| a.alive) {
            *by_kind.entry(a.kind.name().to_string()).or_insert(0) += 1;
        }
        let mut row: Vec<(String, usize)> = by_kind.into_iter().collect();
        row.sort_by_key(|e| std::cmp::Reverse(e.1));
        let total: usize = sim.animals.iter().filter(|a| a.alive).count();
        let parts: Vec<String> = row.iter().map(|(k, n)| format!("{}={}", k, n)).collect();
        println!("Animals alive at end: {}  ({})", total, parts.join(" "));
    }
    {
        use sim::transportation::TransportKind;
        let boats: Vec<_> = sim
            .vehicles
            .iter()
            .filter(|v| matches!(v.kind, TransportKind::Boat | TransportKind::Ship))
            .collect();
        let steamships = boats
            .iter()
            .filter(|v| {
                v.kind == TransportKind::Ship && sim.era(&v.owner_lineage) >= sim::era::Era::Industrial
            })
            .count();
        let fishing = boats.iter().filter(|v| v.harbour.is_some()).count();
        let under_way = boats.iter().filter(|v| !v.route.is_empty()).count();
        let carrying = boats.iter().filter(|v| !v.occupants.is_empty()).count();
        let trading = boats.iter().filter(|v| v.cargo > 0).count();
        println!(
            "Boats at end: {}  (fishing from a harbour {}, under way {}, carrying passengers {}, trading {})",
            boats.len(),
            fishing,
            under_way,
            carrying,
            trading
        );
        let ferries = sim.vehicles.iter().filter(|v| v.ferry.is_some()).count();
        let ferry_riders: usize = sim
            .vehicles
            .iter()
            .filter(|v| v.ferry.is_some())
            .map(|v| v.occupants.len())
            .sum();
        println!("Ferries at end: {ferries}  (passengers aboard {ferry_riders})");
        println!("Steamships at end: {steamships}");
        let working = |kind: sim::tech::buildings::BuildingKind| {
            sim.buildings
                .iter()
                .filter(|b| b.kind == kind && b.is_operational())
                .count()
        };
        let mut harbours: Vec<((i32, i32), String)> = boats
            .iter()
            .filter_map(|v| v.harbour.map(|h| (h, v.owner_lineage.clone())))
            .collect();
        harbours.sort();
        harbours.dedup();
        let piers: u32 = harbours
            .iter()
            .map(|(h, owner)| sim::tech::ports::piers_at(sim, *h, owner))
            .sum();
        println!(
            "Harbour works at end: shipyards {}, warehouses {}, piers {} on {} harbours",
            working(sim::tech::buildings::BuildingKind::Shipyard),
            working(sim::tech::buildings::BuildingKind::Warehouse),
            piers,
            harbours.len()
        );
    }
    {
        let trains: Vec<&sim::transportation::Vehicle> = sim
            .vehicles
            .iter()
            .filter(|v| v.kind == sim::transportation::TransportKind::Train)
            .collect();
        let riders: usize = trains.iter().map(|v| v.occupants.len()).sum();
        let carrying: u32 = trains.iter().map(|v| v.cargo).sum();
        let rail_cells = sim
            .grid
            .road
            .iter()
            .filter(|&&k| k == crate::world::grid::ROAD_RAIL)
            .count();
        let stations = sim
            .buildings
            .iter()
            .filter(|b| b.kind == sim::tech::buildings::BuildingKind::TrainStation && b.is_operational())
            .count();
        println!(
            "Railways at end: lines {}, trains {}, riders aboard {}, grain on trains {}, track cells {}, stations {}",
            sim.rail_lines.len(),
            trains.len(),
            riders,
            carrying,
            rail_cells,
            stations
        );
    }

    let mut lineage_alive: HashMap<&str, usize> = HashMap::new();
    for org in sim.organisms.iter().filter(|o| o.alive) {
        *lineage_alive.entry(&org.lineage_id).or_insert(0) += 1;
    }
    let mut alive_lineages: Vec<(&str, usize)> = lineage_alive.into_iter().collect();
    alive_lineages.sort_by_key(|e| std::cmp::Reverse(e.1));
    println!("\nSurviving lineages:");
    for (lid, count) in alive_lineages.iter().take(8) {
        let avg_gen = sim
            .organisms
            .iter()
            .filter(|o| o.alive && o.lineage_id == *lid)
            .map(|o| o.generation as f32)
            .fold((0.0, 0.0), |(s, c), g| (s + g, c + 1.0));
        let gen_avg = if avg_gen.1 > 0.0 {
            avg_gen.0 / avg_gen.1
        } else {
            0.0
        };
        println!(
            "  {}…  count={}  avg_gen={:.1}",
            &lid[..lid.len().min(8)],
            count,
            gen_avg
        );
    }
}

pub(super) fn print_performance(tick_times_us: Vec<u64>, json_sizes_bytes: Vec<usize>) {
    if !tick_times_us.is_empty() {
        let mut sorted_us = tick_times_us.clone();
        sorted_us.sort_unstable();
        let n = sorted_us.len();
        let mean_us = sorted_us.iter().sum::<u64>() / n as u64;
        let p50 = sorted_us[n * 50 / 100];
        let p95 = sorted_us[n * 95 / 100];
        let p99 = sorted_us[n * 99 / 100];
        let max_us = *sorted_us.last().unwrap();
        let total_ms = tick_times_us.iter().sum::<u64>() / 1000;
        println!("\n=== TICK TIMING ({} ticks) ===", n);
        println!(
            "  mean={:>6}µs  p50={:>6}µs  p95={:>6}µs  p99={:>6}µs  max={:>7}µs",
            mean_us, p50, p95, p99, max_us
        );
        println!(
            "  total wall: {}ms  ({:.0} ticks/s)",
            total_ms,
            n as f64 / (total_ms as f64 / 1000.0)
        );
    }
    if !json_sizes_bytes.is_empty() {
        let avg_kb = json_sizes_bytes.iter().sum::<usize>() / json_sizes_bytes.len() / 1024;
        let max_kb = json_sizes_bytes.iter().max().copied().unwrap_or(0) / 1024;
        println!("\n=== WS PAYLOAD ESTIMATE ===");
        println!(
            "  avg={} KB   max={} KB   samples={}",
            avg_kb,
            max_kb,
            json_sizes_bytes.len()
        );
        println!("  at 10 tps: ~{} KB/s per client", avg_kb * 10);
    }
}
