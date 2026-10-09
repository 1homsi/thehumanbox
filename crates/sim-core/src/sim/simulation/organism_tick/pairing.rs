use super::*;
use crate::sim::agents::relations::RIVAL_TRUST;

impl Simulation {
    /// Partnership and family: friend-seeking, courtship and conversation, partners, and reproduction.
    pub(super) fn org_pairing(&mut self, f: &mut OrgFrame<'_>) {
        let idx = f.idx;
        let is_unpartnered_adult = f.is_unpartnered_adult;
        let lineage_counts = f.lineage_counts;
        let org_idx_by_id = f.org_idx_by_id;
        let population_slots_used = f.population_slots_used;
        let spatial = f.spatial;
        let tc = f.tc;

        if is_unpartnered_adult
            && self.organisms[idx].attracted_to.is_none()
            && self.organisms[idx].wander_target.is_none()
            && self.organisms[idx].loneliness > 0.20
        {
            let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
            let my_sex = self.organisms[idx].sex;
            let my_age = self.organisms[idx].age as f32;
            let my_lid = &self.organisms[idx].lineage_id;
            let my_atts = &self.organisms[idx].lineage_attitudes;
            let my_trust = &self.organisms[idx].org_trust;
            // Score candidates by attitude / trust / age compat, not raw
            // proximity. Distance still matters (you have to walk there),
            // but two villagers who hate each other's lineages no longer
            // pair just because they happen to be the closest neighbour.
            // Hard distance cap on mate search - same reasoning as the
            // friend-seek cap. Without it, attraction can pull orgs
            // across the entire map, defeating the cluster-breaking
            // work in spawn.rs / friend-seek.
            const MATE_SEEK_MAX_TILES: f32 = 80.0;
            let target = spatial
                .ordered_nearby(&self.organisms, ox, oy, MATE_SEEK_MAX_TILES as i32)
                .map(|(_, o)| o)
                .filter(|o| {
                    o.alive
                        && o.sex != my_sex
                        && o.age > 1000
                        && o.partner_id.is_none()
                        && my_trust.get(&o.id).is_none_or(|&t| t > RIVAL_TRUST)
                })
                .map(|o| {
                    let dist = (o.x - ox).hypot(o.y - oy);
                    (o, dist)
                })
                .filter(|(_, d)| *d <= MATE_SEEK_MAX_TILES)
                .map(|(o, dist)| {
                    let lineage_att = if o.lineage_id == *my_lid {
                        0.3
                    } else {
                        my_atts.get(&o.lineage_id).copied().unwrap_or(0.0)
                    };
                    let trust = my_trust.get(&o.id).copied().unwrap_or(0.0);
                    let age_gap = (my_age - o.age as f32).abs();
                    let age_score = (1.0 - age_gap / 6000.0).clamp(0.0, 1.0);
                    let dist_score = (1.0 - dist / 30.0).clamp(0.0, 1.0);
                    // Hard-reject hostile lineages even if nearby.
                    let viable = lineage_att > -0.3;
                    let score = if viable {
                        dist_score * 0.35 + lineage_att * 0.25 + trust * 0.20 + age_score * 0.20
                    } else {
                        -1.0
                    };
                    (o, score)
                })
                .filter(|(_, s)| *s > 0.0)
                .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
                .map(|(o, _)| (o.x as i32, o.y as i32));
            if let Some((tx, ty)) = target {
                let mate_at = (tx.clamp(5, 595), ty.clamp(5, 295));
                self.organisms[idx].wander_target = Some(mate_at);
                self.mark_mate_rivals(idx, mate_at, spatial);
            }
        }

        // Friend-seeking: lonely organisms with friends actively walk toward one
        if self.organisms[idx].loneliness > 0.65
            && self.organisms[idx].wander_target.is_none()
            && !self.organisms[idx].friends.is_empty()
            && self.organisms[idx].energy > 0.30
        {
            let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
            // Only walk toward friends within this radius. Without a cap,
            // every lonely org in the world eventually drifts toward whichever
            // cluster has the densest friend network, producing a one-way
            // attractor that empties out the rest of the map.
            const FRIEND_SEEK_MAX_TILES: f32 = 60.0;
            let best = self.organisms[idx]
                .friends
                .keys()
                .filter_map(|fid| {
                    org_idx_by_id
                        .get(fid)
                        .map(|&i| &self.organisms[i])
                        .filter(|o| o.alive)
                })
                .map(|o| (o, (o.x - ox).hypot(o.y - oy)))
                .filter(|(_, d)| *d <= FRIEND_SEEK_MAX_TILES)
                .min_by_key(|(_, d)| (*d * 10.0) as i32)
                .map(|(o, _)| (o.x as i32, o.y as i32, o.name.clone()));
            if let Some((tx, ty, fname)) = best {
                self.organisms[idx].wander_target = Some((tx.clamp(5, 595), ty.clamp(5, 295)));
                let short = &fname[..4.min(fname.len())];
                self.organisms[idx].think(&format!("going to find {}", short), self.tick_count);
            }
            // Prune dead friends using the per-tick resident index.
            let departed_friends: Vec<String> = self.organisms[idx]
                .friends
                .keys()
                .filter(|id| !org_idx_by_id.get(*id).is_some_and(|&i| self.organisms[i].alive))
                .cloned()
                .collect();
            for id in departed_friends {
                self.organisms[idx].friends.remove(&id);
            }
        }

        if is_unpartnered_adult
            && self.organisms[idx].attracted_to.is_none()
            && self.rng.random::<f32>() < 0.012
        {
            let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
            let my_sex = self.organisms[idx].sex;
            let candidate = spatial
                .ordered_nearby(&self.organisms, ox, oy, 120)
                .find(|(i, o)| {
                    *i != idx
                        && o.alive
                        && o.partner_id.is_none()
                        && o.attracted_to.is_none()
                        && o.age > 1000
                        && o.sex != my_sex
                        && self.organisms[idx]
                            .org_trust
                            .get(&o.id)
                            .is_none_or(|&t| t > RIVAL_TRUST)
                        && (o.x - ox).hypot(o.y - oy) < 120.0
                })
                .map(|(i, _)| i);
            if let Some(ci) = candidate {
                let cid = self.organisms[ci].id.clone();
                let cname = self.organisms[ci].name.clone();
                let my_id = self.organisms[idx].id.clone();
                self.organisms[idx].attracted_to = Some(cid.clone());
                self.organisms[idx].attraction_tick = tc;
                self.organisms[ci].attracted_to = Some(my_id);
                self.organisms[ci].attraction_tick = tc;
                self.organisms[idx].think(&format!("drawn to {}", cname), tc);
            }
        }

        if is_unpartnered_adult {
            let attracted_to = self.organisms[idx].attracted_to.clone();
            if let Some(ref aid) = attracted_to {
                let aid = aid.clone();
                let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
                let attraction_age = tc.saturating_sub(self.organisms[idx].attraction_tick);
                let partner_close = org_idx_by_id.get(&aid).is_some_and(|&i| {
                    let o = &self.organisms[i];
                    o.alive && (o.x - ox).hypot(o.y - oy) < 8.0
                });
                if partner_close && attraction_age >= 150 && self.rng.random::<f32>() < 0.08 {
                    if let Some(pi) = org_idx_by_id
                        .get(&aid)
                        .copied()
                        .filter(|&i| self.organisms[i].alive)
                    {
                        let pid = self.organisms[pi].id.clone();
                        let pname = self.organisms[pi].name.clone();
                        let oid = self.organisms[idx].id.clone();
                        let oname = self.organisms[idx].name.clone();
                        let (conv_a, conv_b) = courtship::generate_conversation_pair(
                            &self.organisms[idx],
                            &self.organisms[pi],
                            tc,
                            "courtship",
                            &mut self.rng,
                        );
                        self.organisms[idx].vocabulary.touch_all_known(tc);
                        self.organisms[pi].vocabulary.touch_all_known(tc);
                        self.organisms[idx].store_conversation(conv_a);
                        self.organisms[pi].store_conversation(conv_b);
                        let a_lid = self.organisms[idx].lineage_id.clone();
                        let b_lid = self.organisms[pi].lineage_id.clone();
                        self.organisms[idx].record_conversation_outcome(
                            &pid,
                            &b_lid,
                            &pname,
                            "courtship",
                            None,
                            tc,
                        );
                        self.organisms[pi].record_conversation_outcome(
                            &oid,
                            &a_lid,
                            &oname,
                            "courtship",
                            None,
                            tc,
                        );
                        self.organisms[idx].partner_id = Some(pid.clone());
                        self.organisms[idx].attracted_to = None;
                        self.organisms[pi].partner_id = Some(oid.clone());
                        self.organisms[pi].attracted_to = None;
                        self.organisms[idx].joy_ticks = (self.organisms[idx].joy_ticks + 500).min(1200);
                        self.organisms[pi].joy_ticks = (self.organisms[pi].joy_ticks + 500).min(1200);
                        self.organisms[idx].think(&format!("fell for {}", pname), tc);
                        self.organisms[idx].log_life_rel(
                            tc,
                            "love",
                            format!("fell in love with {}", pname),
                            Some(pid.clone()),
                            Some(pname.clone()),
                        );
                        self.organisms[pi].log_life_rel(
                            tc,
                            "love",
                            format!("fell in love with {}", oname),
                            Some(oid),
                            Some(oname.clone()),
                        );
                    }
                }
            }
        }

        if let Some(ref pid) = self.organisms[idx].partner_id.clone() {
            let pid = pid.clone();
            if tc % 19 == (idx as u64 % 19) && self.rng.random::<f32>() < 0.0018 {
                let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
                if let Some(pi) = org_idx_by_id
                    .get(&pid)
                    .copied()
                    .filter(|&i| self.organisms[i].alive)
                {
                    if (self.organisms[pi].x - ox).hypot(self.organisms[pi].y - oy) < 8.0 {
                        let (conv_a, conv_b) = courtship::generate_conversation_pair(
                            &self.organisms[idx],
                            &self.organisms[pi],
                            tc,
                            "bonded",
                            &mut self.rng,
                        );
                        self.organisms[idx].vocabulary.touch_all_known(tc);
                        self.organisms[pi].vocabulary.touch_all_known(tc);
                        self.organisms[idx].store_conversation(conv_a);
                        self.organisms[pi].store_conversation(conv_b);
                        let a_id = self.organisms[idx].id.clone();
                        let a_name = self.organisms[idx].name.clone();
                        let a_lid = self.organisms[idx].lineage_id.clone();
                        let b_name = self.organisms[pi].name.clone();
                        let b_lid = self.organisms[pi].lineage_id.clone();
                        self.organisms[idx]
                            .record_conversation_outcome(&pid, &b_lid, &b_name, "bonded", None, tc);
                        self.organisms[pi]
                            .record_conversation_outcome(&a_id, &a_lid, &a_name, "bonded", None, tc);
                    }
                }
            }
        }

        {
            let spread_check = tc % 29 == (idx as u64 % 29);
            if spread_check {
                let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
                let chat_target: Option<usize> = {
                    let partner_id = self.organisms[idx].partner_id.clone();
                    spatial
                        .ordered_nearby(&self.organisms, ox, oy, 6)
                        .filter(|(i, o)| {
                            *i != idx
                                && o.alive
                                && partner_id.as_deref() != Some(&o.id)
                                && (o.x - ox).hypot(o.y - oy) < 6.0
                        })
                        .min_by(|(_, a), (_, b)| {
                            let da = (a.x - ox).hypot(a.y - oy);
                            let db = (b.x - ox).hypot(b.y - oy);
                            da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
                        })
                        .map(|(i, _)| i)
                };
                if let Some(ci) = chat_target {
                    let their_lid = self.organisms[ci].lineage_id.clone();
                    let att = self.organisms[idx].attitude_toward(&their_lid);
                    let combined_energy = self.organisms[idx].energy + self.organisms[ci].energy;
                    let gossip_target: Option<(String, f32)> = {
                        let cid = self.organisms[ci].id.clone();
                        self.organisms[idx]
                            .org_trust
                            .iter()
                            .filter(|(id, v)| v.abs() > 0.4 && **id != cid)
                            .max_by(|a, b| {
                                a.1.abs()
                                    .partial_cmp(&b.1.abs())
                                    .unwrap_or(std::cmp::Ordering::Equal)
                            })
                            .map(|(id, v)| (id.clone(), *v))
                    };
                    let kind = if att < -0.3 {
                        "argue"
                    } else if gossip_target.is_some() && att >= 0.0 && self.rng.random::<f32>() < 0.5 {
                        "gossip"
                    } else if combined_energy > 1.5 && att >= 0.0 {
                        "excited"
                    } else {
                        "chat"
                    };
                    if self.rng.random::<f32>() < 0.004 {
                        let (conv_a, conv_b) = courtship::generate_conversation_pair(
                            &self.organisms[idx],
                            &self.organisms[ci],
                            tc,
                            kind,
                            &mut self.rng,
                        );
                        self.organisms[idx].vocabulary.touch_all_known(tc);
                        self.organisms[ci].vocabulary.touch_all_known(tc);
                        self.organisms[idx].store_conversation(conv_a);
                        self.organisms[ci].store_conversation(conv_b);
                        let a_id = self.organisms[idx].id.clone();
                        let a_name = self.organisms[idx].name.clone();
                        let a_lid = self.organisms[idx].lineage_id.clone();
                        let c_id = self.organisms[ci].id.clone();
                        let c_name = self.organisms[ci].name.clone();
                        self.organisms[idx]
                            .record_conversation_outcome(&c_id, &their_lid, &c_name, kind, None, tc);
                        self.organisms[ci]
                            .record_conversation_outcome(&a_id, &a_lid, &a_name, kind, None, tc);
                        if kind == "gossip" {
                            if let Some((tid, sentiment)) = &gossip_target {
                                let cur = self.organisms[ci].org_trust.entry(tid.clone()).or_insert(0.0);
                                *cur = (*cur + sentiment * 0.3).clamp(-1.0, 1.0);
                            }
                        }
                        let bystanders: Vec<usize> = spatial
                            .ordered_nearby(&self.organisms, ox, oy, 5)
                            .filter(|(j, o)| {
                                *j != idx && *j != ci && o.alive && (o.x - ox).abs() + (o.y - oy).abs() <= 5.0
                            })
                            .map(|(j, _)| j)
                            .take(3)
                            .collect();
                        let emotion: i8 = if kind == "argue" { -1 } else { 1 };
                        for j in bystanders {
                            use crate::organism::memory::{MemoryEntry, MemoryKind};
                            self.organisms[j].memories.insert(
                                MemoryEntry::new(
                                    MemoryKind::Episode,
                                    format!("overheard {} and {} {}", a_name, c_name, kind),
                                    tc,
                                )
                                .with_salience(0.35)
                                .with_emotion(emotion),
                            );
                            self.organisms[j].update_attitude(&a_lid, 0.004 * emotion as f32);
                        }
                    }
                }
            }
        }

        growth::try_reproduce(
            idx,
            &mut self.organisms,
            &self.grid,
            self.tick_count,
            &mut self.events,
            &mut self.rng,
            growth::ReproductionPopulation {
                slots_used: population_slots_used,
                limit: self.population_limit,
                lineage_counts,
                org_idx_by_id,
            },
        );
    }
}
