use super::*;

impl Simulation {
    pub(super) fn state_frame_inner(
        &mut self,
        vp_cx: i32,
        vp_cy: i32,
        force_full: bool,
        include_cold: bool,
    ) -> FramePayload {
        let needs_slow = self.tick_count == 0 || self.tick_count.saturating_sub(self.slow_compute_tick) >= 60;
        if needs_slow {
            let alive_lineages: rustc_hash::FxHashSet<String> = self
                .organisms
                .iter()
                .filter(|o| o.alive)
                .map(|o| o.lineage_id.clone())
                .collect();

            let mut att_totals: HashMap<(String, String), (f32, u32)> = HashMap::default();
            for org in self.organisms.iter().filter(|o| o.alive) {
                for (other_lid, &att) in &org.lineage_attitudes {
                    if alive_lineages.contains(other_lid) {
                        let key = if org.lineage_id < *other_lid {
                            (org.lineage_id.clone(), other_lid.clone())
                        } else {
                            (other_lid.clone(), org.lineage_id.clone())
                        };
                        let e = att_totals.entry(key).or_insert((0.0, 0));
                        e.0 += att;
                        e.1 += 1;
                    }
                }
            }
            self.cached_tribal_relations = serde_json::to_value(
                att_totals
                    .into_iter()
                    .filter(|(_, (_, cnt))| *cnt > 0)
                    .map(|((a, b), (sum, cnt))| {
                        let avg = sum / cnt as f32;
                        let status = if avg > 0.3 {
                            "ally"
                        } else if avg < -0.3 {
                            "rivals"
                        } else {
                            "neutral"
                        };
                        json!({ "a": a, "b": b,
                                 "attitude": (avg * 100.0).round() / 100.0, "status": status })
                    })
                    .collect::<Vec<_>>(),
            )
            .unwrap();

            let mut lineage_sizes: HashMap<String, usize> = HashMap::default();
            for org in self.organisms.iter().filter(|o| o.alive) {
                *lineage_sizes.entry(org.lineage_id.clone()).or_insert(0) += 1;
            }
            self.cached_lineage_sizes = serde_json::to_value(
                lineage_sizes
                    .into_iter()
                    .map(|(id, count)| json!({"id": id, "count": count}))
                    .collect::<Vec<_>>(),
            )
            .unwrap();

            // Compute contested tiles: any tile claimed by 2+ lineages
            let mut tile_claim_count: HashMap<(i32, i32), u32> = HashMap::default();
            for tiles in self.territory.values() {
                for &tile in tiles {
                    *tile_claim_count.entry(tile).or_insert(0) += 1;
                }
            }
            let contested: Vec<[i32; 2]> = tile_claim_count
                .into_iter()
                .filter(|(_, c)| *c >= 2)
                .map(|((x, y), _)| [x, y])
                .collect();
            self.cached_territory = serde_json::json!({
                "claimed": self.territory.iter()
                    .map(|(lid, tiles)| {
                        let pts: Vec<[i32;2]> = tiles.iter().map(|&(x,y)| [x,y]).collect();
                        json!({"lid": lid, "tiles": pts})
                    }).collect::<Vec<_>>(),
                "contested": contested,
            });

            self.slow_compute_tick = self.tick_count;
        }

        let include_tiles = include_cold || self.tick_count.is_multiple_of(60) || self.tick_count <= 1;
        let include_static = include_cold || self.tick_count.is_multiple_of(60) || self.tick_count <= 1;
        let include_terrain = include_cold;
        let grid_json = self.grid.to_json_viewport(
            vp_cx,
            vp_cy,
            crate::world::grid::VP_W,
            crate::world::grid::VP_H,
            include_tiles,
            include_static,
            include_terrain,
        );
        let include_all_entities = force_full || self.tick_count.is_multiple_of(120) || self.tick_count <= 1;
        // When the viewport spans the whole world (the current config),
        // the centroid-centered window can slide off the map and filter
        // out entities that are still on the canvas. Compute the actual
        // visible AABB and clamp it to world bounds so we never drop
        // entities the client needs to render.
        let half_w = crate::world::grid::VP_W as i32 / 2 + 8;
        let half_h = crate::world::grid::VP_H as i32 / 2 + 8;
        let left = (vp_cx - half_w).max(-8);
        let right = (vp_cx + half_w).min(crate::world::grid::WIDTH as i32 + 8);
        let top = (vp_cy - half_h).max(-8);
        let bottom = (vp_cy + half_h).min(crate::world::grid::HEIGHT as i32 + 8);
        let full_world_vp = crate::world::grid::VP_W >= crate::world::grid::WIDTH
            && crate::world::grid::VP_H >= crate::world::grid::HEIGHT;
        let in_view = |x: f32, y: f32| {
            if full_world_vp {
                return true;
            }
            let x = x as i32;
            let y = y as i32;
            x >= left && x <= right && y >= top && y <= bottom
        };
        let per_org_cold = include_cold;
        use crate::organism::organism::OrgsHotSoa;
        let mut payload = if include_all_entities {
            let mut organisms_json: Vec<serde_json::Value> = Vec::with_capacity(self.organisms.len());
            for o in self.organisms.iter() {
                if o.alive {
                    organisms_json.push(o.to_json_value_with(per_org_cold));
                }
            }
            let mut animals_json: Vec<serde_json::Value> = Vec::with_capacity(self.animals.len());
            for a in self.animals.iter() {
                animals_json.push(serde_json::to_value(a.to_json()).unwrap());
            }
            self.entity_head(
                grid_json,
                HeadOrganisms::Full(organisms_json),
                serde_json::Value::Array(animals_json),
                true,
            )
        } else {
            let mut soa = OrgsHotSoa::with_capacity(self.organisms.len() / 2);
            let lookahead = *LOOKAHEAD_TICKS;
            // `soa.push` takes `&mut Organism` because it clears
            // `thought_dirty` after emitting the change. That's fine
            // - `state_frame_inner` already holds `&mut self`.
            for o in self.organisms.iter_mut() {
                if o.alive && in_view(o.x, o.y) {
                    soa.push(o, lookahead);
                }
            }
            let mut animals_json: Vec<serde_json::Value> = Vec::with_capacity(self.animals.len());
            for a in self.animals.iter() {
                if in_view(a.x, a.y) {
                    animals_json.push(serde_json::to_value(a.to_json()).unwrap());
                }
            }
            self.entity_head(
                grid_json,
                HeadOrganisms::Hot(Box::new(soa)),
                serde_json::Value::Array(animals_json),
                false,
            )
        };
        if let Some(obj) = payload.as_object_mut() {
            obj.insert("vehicles".into(), serde_json::Value::Array(self.vehicles.iter().map(|v| json!({
                "id": v.id, "kind": v.kind.name(), "x": v.x, "y": v.y,
                "rider_id": v.occupants.first(), "building": self.tick_count < v.ready_tick && !v.occupants.is_empty()
            })).collect()));
            obj.insert(
                "population_limit".to_string(),
                serde_json::to_value(self.population_limit()).unwrap(),
            );
            // Campaigns are live player-facing state. Sending this small map
            // on every frame avoids a short objective completing or expiring
            // entirely between deep/cold snapshots.
            obj.insert("lineage_strategies".to_string(), lineage_strategy_payload(self));
            obj.insert(
                "hard_winter".to_string(),
                serde_json::Value::Bool(self.hard_winter),
            );
            obj.insert(
                "hard_winter_ahead".to_string(),
                serde_json::Value::Bool(self.hard_winter_ahead),
            );
            // Prayers are the player's to-do list; they must never lag.
            let now = self.tick_count;
            let prayers: Vec<serde_json::Value> = self
                .prayers
                .active
                .iter()
                .map(|p| {
                    json!({
                        "id": p.id,
                        "lineage_id": p.lineage,
                        "tribe": self.lineage_names.get(&p.lineage).cloned().unwrap_or_default(),
                        "kind": p.kind.name(),
                        "x": p.x,
                        "y": p.y,
                        "created": p.created,
                        "expires": p.expires,
                    })
                })
                .collect();
            obj.insert("prayers".to_string(), serde_json::Value::Array(prayers));
            obj.insert(
                "faith".to_string(),
                json!({
                    "by_lineage": self.prayers.faith,
                    "answered": self.prayers.answered,
                    "forsaken": self.prayers.forsaken,
                    "blessed": self.prayers.blessed_until.iter().filter(|(_, &t)| now < t).map(|(l, _)| l).collect::<Vec<_>>(),
                    "despairing": self.prayers.despair_until.iter().filter(|(_, &t)| now < t).map(|(l, _)| l).collect::<Vec<_>>(),
                }),
            );
            // Each tribe's recent dead by cause, so the player can see why it shrinks.
            let mut losses = serde_json::Map::new();
            for (lineage, deaths) in &self.recent_deaths {
                let mut by_cause = serde_json::Map::new();
                for &(at, cause) in deaths {
                    if now.saturating_sub(at) <= crate::sim::civ::peril::DEATH_WINDOW {
                        let n = by_cause.get(cause).and_then(|v| v.as_u64()).unwrap_or(0);
                        by_cause.insert(cause.to_string(), json!(n + 1));
                    }
                }
                if !by_cause.is_empty() {
                    losses.insert(lineage.clone(), serde_json::Value::Object(by_cause));
                }
            }
            obj.insert("tribe_losses".to_string(), serde_json::Value::Object(losses));
            obj.insert(
                "wards".to_string(),
                serde_json::Value::Array(
                    self.wards
                        .iter()
                        .filter(|w| now < w.until)
                        .map(|w| json!({"x": w.x, "y": w.y, "radius": w.radius, "cast": w.cast, "until": w.until}))
                        .collect(),
                ),
            );
            obj.insert(
                "smog".to_string(),
                serde_json::Value::Array(
                    self.smog
                        .iter()
                        .filter(|s| s.strength > 0.05)
                        .map(|s| json!({"x": s.x, "y": s.y, "s": (f64::from(s.strength) * 100.0).round() / 100.0}))
                        .collect(),
                ),
            );
            obj.insert(
                "festivals".to_string(),
                serde_json::Value::Array(
                    self.festivals
                        .iter()
                        .filter(|f| now < f.start_tick + u64::from(f.duration_ticks))
                        .map(|f| {
                            json!({
                                "name": f.name,
                                "kind": f.kind.name(),
                                "lineage_id": f.lineage_id,
                                "started": f.start_tick,
                                "ends": f.start_tick + u64::from(f.duration_ticks),
                                "x": f.center[0],
                                "y": f.center[1],
                            })
                        })
                        .collect(),
                ),
            );
            let mut peril: Vec<(&String, &crate::sim::civ::peril::Peril)> = self.tribe_peril.iter().collect();
            peril.sort_by(|a, b| a.0.cmp(b.0));
            obj.insert(
                "tribes_in_peril".to_string(),
                serde_json::Value::Array(
                    peril
                        .into_iter()
                        .map(|(lineage, p)| {
                            json!({
                                "lineage_id": lineage,
                                "tribe": self.lineage_names.get(lineage).cloned().unwrap_or_default(),
                                "population": p.population,
                                "peak": p.peak,
                                "cause": p.cause.name(),
                                "since": p.since,
                            })
                        })
                        .collect(),
                ),
            );
            obj.insert(
                "lineage_strategy_history".to_string(),
                lineage_strategy_history_payload(self),
            );
            // Routes are small and caravans visibly move every tick, so they
            // belong in hot/delta frames rather than the once-per-cold-snapshot
            // economy payload. The private dispatch_state used for delayed
            // Q-learning credit never crosses this boundary.
            let trade_routes = self
                .trade_routes
                .iter()
                .map(|route| {
                    json!({
                        "id": route.id,
                        "lineage_a": route.lineage_a,
                        "lineage_b": route.lineage_b,
                        "a_center": route.a_center,
                        "b_center": route.b_center,
                        "established_tick": route.established_tick,
                        "last_dispatch_tick": route.last_dispatch_tick,
                        "deliveries": route.deliveries,
                        "volume": route.volume,
                    })
                })
                .collect();
            obj.insert("trade_routes".to_string(), serde_json::Value::Array(trade_routes));
            let caravans = self
                .caravans
                .iter()
                .map(|caravan| {
                    json!({
                        "id": caravan.id,
                        "route_id": caravan.route_id,
                        "sender_lineage": caravan.sender_lineage,
                        "receiver_lineage": caravan.receiver_lineage,
                        "sender_org_id": caravan.sender_org_id,
                        "cargo": caravan.cargo,
                        "amount": caravan.amount,
                        "unit_price": caravan.unit_price,
                        "departed_tick": caravan.departed_tick,
                        "arrives_tick": caravan.arrives_tick,
                        "from": caravan.from,
                        "to": caravan.to,
                    })
                })
                .collect();
            obj.insert("caravans".to_string(), serde_json::Value::Array(caravans));
        }
        if include_cold {
            if let Some(obj) = payload.as_object_mut() {
                obj.insert("events".to_string(), serde_json::to_value(&self.events).unwrap());
                obj.insert(
                    "history".to_string(),
                    serde_json::to_value(&self.history).unwrap(),
                );
                obj.insert(
                    "story_history".to_string(),
                    serde_json::to_value(self.story_history.iter().rev().take(120).collect::<Vec<_>>())
                        .unwrap(),
                );
                // Tail-only pop_history: only the most recent 60
                // samples make it to the wire. The full ring buffer
                // is kept server-side for trend analysis, but the
                // client only graphs the tail.
                let start = self.pop_history.len().saturating_sub(60);
                let tail: Vec<&[u64; 2]> = self.pop_history.iter().skip(start).collect();
                obj.insert("pop_history".to_string(), serde_json::to_value(&tail).unwrap());
                obj.insert(
                    "tribal_relations".to_string(),
                    self.cached_tribal_relations.clone(),
                );
                obj.insert("lineage_sizes".to_string(), self.cached_lineage_sizes.clone());
                obj.insert("territory".to_string(), self.cached_territory.clone());
                obj.insert(
                    "lineage_names".to_string(),
                    serde_json::to_value(&self.lineage_names).unwrap(),
                );
                obj.insert(
                    "lineage_centroid_history".to_string(),
                    serde_json::to_value(&self.lineage_centroid_history).unwrap(),
                );
                obj.insert(
                    "lineage_homes".to_string(),
                    serde_json::to_value(&self.lineage_homes).unwrap(),
                );
                obj.insert(
                    "current_era".to_string(),
                    serde_json::to_value(&self.current_era).unwrap(),
                );
                let eras_json: Vec<serde_json::Value> = self
                    .lineage_eras
                    .iter()
                    .map(|(lid, era)| json!({ "lineage_id": lid, "era_name": era.name() }))
                    .collect();
                obj.insert("lineage_eras".to_string(), serde_json::Value::Array(eras_json));
                let inequality: Vec<serde_json::Value> =
                    crate::sim::civ::society::inequality::lineage_inequality(&self.organisms)
                        .into_iter()
                        .map(|(lid, gini, people)| {
                            json!({ "lineage_id": lid, "gini": (gini * 1000.0).round() / 1000.0, "people": people })
                        })
                        .collect();
                obj.insert(
                    "lineage_inequality".to_string(),
                    serde_json::Value::Array(inequality),
                );
                let generations: Vec<serde_json::Value> = {
                    let mut oldest: HashMap<String, u32> = HashMap::default();
                    for o in self
                        .organisms
                        .iter()
                        .filter(|o| o.alive && !o.lineage_id.is_empty())
                    {
                        let shown = crate::sim::agents::generations::shown_generation(o.generation);
                        let e = oldest.entry(o.lineage_id.clone()).or_insert(0);
                        *e = (*e).max(shown);
                    }
                    let mut rows: Vec<(String, u32, u32)> = oldest
                        .into_iter()
                        .map(|(lid, oldest)| {
                            let lived = self
                                .lineage_generations_reached
                                .get(&lid)
                                .copied()
                                .unwrap_or(oldest);
                            (lid, oldest, lived.max(oldest))
                        })
                        .collect();
                    rows.sort_by(|a, b| a.0.cmp(&b.0));
                    rows.into_iter()
                        .map(|(lid, oldest, lived)| json!({ "lineage_id": lid, "oldest": oldest, "lived": lived }))
                        .collect()
                };
                obj.insert(
                    "lineage_generations".to_string(),
                    serde_json::Value::Array(generations),
                );
                let mut lineage_discoveries: HashMap<String, HashSet<String>> = HashMap::default();
                let mut lineage_pop: HashMap<String, usize> = HashMap::default();
                for org in self.organisms.iter().filter(|o| o.alive) {
                    *lineage_pop.entry(org.lineage_id.clone()).or_insert(0) += 1;
                    let entry = lineage_discoveries.entry(org.lineage_id.clone()).or_default();
                    for d in &org.discoveries {
                        entry.insert(d.clone());
                    }
                }
                let world_population: usize = lineage_pop.values().sum();
                let era_progress_json: Vec<serde_json::Value> = self
                    .lineage_eras
                    .iter()
                    .map(|(lid, era)| {
                        let lineage_population = *lineage_pop.get(lid).unwrap_or(&0);
                        let discoveries = lineage_discoveries.get(lid);
                        let next = era.advance();
                        let (next_era, required, known, missing, world_population_required) =
                            if let Some(next) = next {
                                let required = next.required_discoveries();
                                let has = |d: &str| discoveries.is_some_and(|set| set.contains(d));
                                let known: Vec<&str> = required.iter().copied().filter(|d| has(d)).collect();
                                let missing: Vec<&str> =
                                    required.iter().copied().filter(|d| !has(d)).collect();
                                (
                                    Some(next.name()),
                                    required.to_vec(),
                                    known,
                                    missing,
                                    next.population_gate(self.population_limit()),
                                )
                            } else {
                                (None, Vec::new(), Vec::new(), Vec::new(), 0)
                            };
                        let discovery_ready = missing.is_empty();
                        let lineage_population_ready = lineage_population >= world_population_required;
                        let world_population_ready = world_population >= world_population_required;
                        json!({
                            "lineage_id": lid,
                            "era_name": era.name(),
                            "next_era": next_era,
                            // Keep the original fields for older clients, but make the
                            // lineage/world distinction explicit for current clients.
                            "pop": lineage_population,
                            "pop_required": world_population_required,
                            "pop_ready": lineage_population_ready,
                            "lineage_population": lineage_population,
                            "world_population": world_population,
                            "world_population_required": world_population_required,
                            "world_population_ready": world_population_ready,
                            "required": required,
                            "known": known,
                            "missing": missing,
                            "discovery_ready": discovery_ready,
                            "ready": discovery_ready && world_population_ready,
                        })
                    })
                    .collect();
                obj.insert(
                    "lineage_era_progress".to_string(),
                    serde_json::Value::Array(era_progress_json),
                );

                let farms_json: Vec<serde_json::Value> = self
                    .farms
                    .iter()
                    .map(|farm| {
                        let fertility = self.grid.fertility_at(farm.x, farm.y);
                        let era = self.era(&farm.owner_lineage);
                        json!({
                            "id": farm.id,
                            "x": farm.x,
                            "y": farm.y,
                            "crop": farm.crop.name(),
                            "lineage_id": farm.owner_lineage,
                            "planted_tick": farm.planted_tick,
                            "ready_tick": farm.ready_tick,
                            "harvested": farm.harvested,
                            "stage": farm.stage(self.tick_count),
                            "progress": farm.progress(self.tick_count).clamp(0.0, 1.0),
                            "yield": if farm.harvested {
                                0
                            } else {
                                farm.projected_yield(era, fertility)
                            },
                        })
                    })
                    .collect();
                obj.insert("farms".to_string(), serde_json::Value::Array(farms_json));

                let settlements_json: Vec<serde_json::Value> = crate::sim::civ::settlements::snapshots(self)
                    .into_iter()
                    .map(|settlement| {
                        json!({
                            "lineage_id": settlement.lineage_id,
                            "name": settlement.name,
                            "tier": settlement.tier,
                            "tier_name": settlement.tier_name,
                            "center": settlement.center,
                            "population": settlement.population,
                            "building_count": settlement.building_count,
                            "capacity": settlement.capacity,
                            "score": settlement.score,
                        })
                    })
                    .collect();
                obj.insert(
                    "settlements".to_string(),
                    serde_json::Value::Array(settlements_json),
                );

                let gov_json: Vec<serde_json::Value> = self
                    .governments
                    .values()
                    .map(|g| {
                        json!({
                            "lineage_id": g.lineage_id,
                            "kind": g.kind.name(),
                            "leader_id": g.leader_id,
                            "treasury": g.treasury,
                            "tax_rate": g.tax_rate,
                            "laws": g.laws.iter().map(|l| l.kind.name()).collect::<Vec<_>>(),
                        })
                    })
                    .collect();
                obj.insert("governments".to_string(), serde_json::Value::Array(gov_json));

                let religions_json: Vec<serde_json::Value> = self
                    .religions
                    .iter()
                    .map(|r| {
                        json!({
                            "id": r.id, "kind": r.kind.name(), "name": r.name,
                            "founder_lineage": r.founder_lineage, "adherents": r.adherents,
                        })
                    })
                    .collect();
                obj.insert("religions".to_string(), serde_json::Value::Array(religions_json));

                let books_json: Vec<serde_json::Value> = self
                    .books
                    .iter()
                    .rev()
                    .take(30)
                    .map(|b| {
                        json!({
                            "id": b.id, "title": b.title, "author_name": b.author_name,
                            "lineage_id": b.lineage_id, "topic": b.topic.name(), "copies": b.copies,
                        })
                    })
                    .collect();
                obj.insert("books".to_string(), serde_json::Value::Array(books_json));

                let artworks_json: Vec<serde_json::Value> = self
                    .artworks
                    .iter()
                    .rev()
                    .take(30)
                    .map(|a| {
                        json!({
                            "id": a.id, "kind": a.kind.name(), "title": a.title,
                            "creator_name": a.creator_name, "x": a.location[0], "y": a.location[1],
                        })
                    })
                    .collect();
                obj.insert("artworks".to_string(), serde_json::Value::Array(artworks_json));

                let headlines_json: Vec<serde_json::Value> = self
                    .headlines
                    .iter()
                    .rev()
                    .take(60)
                    .map(|(t, s)| json!({"tick": t, "text": s}))
                    .collect();
                obj.insert("headlines".to_string(), serde_json::Value::Array(headlines_json));

                let mut lineage_alive: HashMap<&str, u32> = HashMap::default();
                for o in self.organisms.iter().filter(|o| o.alive) {
                    *lineage_alive.entry(o.lineage_id.as_str()).or_insert(0) += 1;
                }
                if let Some((top_lid, _)) = lineage_alive.iter().max_by_key(|(_, n)| **n) {
                    let top_lid = *top_lid;
                    let featured = self
                        .organisms
                        .iter()
                        .filter(|o| o.alive && o.lineage_id == top_lid)
                        .max_by_key(|o| o.age)
                        .map(|o| o.id.clone());
                    if let Some(fid) = featured {
                        obj.insert("featured_org_id".to_string(), serde_json::Value::String(fid));
                    }
                }

                let now = self.tick_count;
                let battles_json: Vec<serde_json::Value> = self
                    .battles
                    .iter()
                    .filter(|b| b.ended_tick.is_none_or(|e| now.saturating_sub(e) < 900))
                    .rev()
                    .take(16)
                    .map(|b| {
                        json!({
                            "id": b.id,
                            "attackers": b.attackers,
                            "defenders": b.defenders,
                            "scale": format!("{:?}", b.scale),
                            "location": [b.location.0, b.location.1],
                            "started_tick": b.started_tick,
                            "ended": b.ended_tick.is_some(),
                            "ended_tick": b.ended_tick,
                            "outcome": b.outcome.map(|o| format!("{:?}", o)),
                            "casualties_a": b.casualties_a,
                            "casualties_d": b.casualties_d,
                            "initial_a": b.initial_a,
                            "initial_d": b.initial_d,
                        })
                    })
                    .collect();
                obj.insert("battles".to_string(), serde_json::Value::Array(battles_json));

                let treaties_json: Vec<serde_json::Value> = self
                    .treaties
                    .iter()
                    .filter(|t| t.expires_tick > now)
                    .rev()
                    .take(64)
                    .map(|t| {
                        json!({
                            "tick": t.signed_tick,
                            "a_lineage": t.lineage_a,
                            "b_lineage": t.lineage_b,
                            "kind": t.kind.name(),
                        })
                    })
                    .collect();
                obj.insert("treaties".to_string(), serde_json::Value::Array(treaties_json));

                let trades_json: Vec<serde_json::Value> = self
                    .trades
                    .iter()
                    .rev()
                    .take(30)
                    .map(|tr| {
                        json!({
                            "tick": tr.tick,
                            "buyer_id": tr.buyer_id,
                            "seller_id": tr.seller_id,
                            "good": tr.good,
                            "amount": tr.amount,
                            "price": tr.price,
                        })
                    })
                    .collect();
                obj.insert("trades".to_string(), serde_json::Value::Array(trades_json));

                let currencies: rustc_hash::FxHashMap<String, &str> = self
                    .lineage_eras
                    .iter()
                    .map(|(lid, era)| (lid.clone(), crate::sim::economy::currency_unit_for_era(*era)))
                    .collect();
                obj.insert(
                    "lineage_currencies".to_string(),
                    serde_json::to_value(&currencies).unwrap(),
                );

                obj.insert(
                    "sex_words".to_string(),
                    serde_json::to_value(&self.sex_words).unwrap(),
                );
            }
        }
        let buildings_changed = self.building_state_revision != self.serialized_building_state_revision;
        if include_cold || force_full || buildings_changed {
            {
                let tick = self.tick_count;
                payload.set_buildings(
                    self.buildings
                        .iter()
                        .map(|b| BuildingJson::new(b, tick))
                        .collect(),
                );
                self.serialized_building_state_revision = self.building_state_revision;
            }
        }
        if include_cold || force_full || self.planting_revision != self.serialized_planting_revision {
            if let Some(obj) = payload.as_object_mut() {
                // Flat [x, y, kind, stage, ...] - fields can hold thousands.
                let mut flat: Vec<u32> = Vec::with_capacity(self.plantings.len() * 4);
                for (&i, p) in &self.plantings {
                    let i = i as usize;
                    flat.extend([
                        (i % crate::world::grid::WIDTH) as u32,
                        (i / crate::world::grid::WIDTH) as u32,
                        p.kind.id() as u32,
                        p.stage() as u32,
                    ]);
                }
                obj.insert("plantings".to_string(), json!(flat));
                self.serialized_planting_revision = self.planting_revision;
            }
        }
        payload
    }
}
