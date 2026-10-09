use super::*;

impl Simulation {
    pub(super) fn tick_settlements(&mut self) {
        crate::sim::civ::settlements::tick(self);
    }

    /// Claim all non-water tiles within `radius` of `(cx, cy)` for lineage `lid`.
    /// Caps each lineage at 400 tiles - evicts tiles farthest from the claimed center.
    pub(crate) fn claim_territory(&mut self, lid: &str, cx: i32, cy: i32, radius: i32) {
        const MAX_TERRITORY: usize = 400;
        // Pre-compute the tile list so we can update both maps without
        // holding two mutable borrows on `self` simultaneously.
        let mut to_claim: Vec<(i32, i32)> = Vec::new();
        for dy in -radius..=radius {
            for dx in -radius..=radius {
                if dx * dx + dy * dy > radius * radius {
                    continue;
                }
                let tx = (cx + dx).clamp(0, crate::world::grid::WIDTH as i32 - 1);
                let ty = (cy + dy).clamp(0, crate::world::grid::HEIGHT as i32 - 1);
                if matches!(self.grid.get(tx, ty), Tile::Water | Tile::Void) {
                    continue;
                }
                to_claim.push((tx, ty));
            }
        }
        if !self.territory.contains_key(lid) {
            self.territory.insert(lid.to_string(), Default::default());
        }
        let Some(tiles) = self.territory.get_mut(lid) else {
            return;
        };
        for p in &to_claim {
            tiles.insert(*p);
        }
        let mut evicted: Vec<(i32, i32)> = Vec::new();
        if tiles.len() > MAX_TERRITORY {
            // The tiles farthest from the claimed center go. Ties at the same
            // distance are broken by coordinates, never by the order the set
            // yields them: that order is random per set, so using it would let
            // the same world evict different tiles from run to run.
            let mut ranked: Vec<(i32, i32, i32)> = tiles
                .iter()
                .map(|&(x, y)| (-((x - cx) * (x - cx) + (y - cy) * (y - cy)), x, y))
                .collect();
            // Only the `excess` farthest are wanted: pick them out rather than sorting all.
            let excess = ranked.len() - MAX_TERRITORY;
            ranked.select_nth_unstable(excess);
            ranked.truncate(excess);
            for (_, x, y) in ranked {
                tiles.remove(&(x, y));
                evicted.push((x, y));
            }
        }
        // Update the inverse map. New claims overwrite (most-recent
        // wins). Evictions only clear the inverse entry if it was
        // owned by *this* lineage - another lineage may have a more
        // recent claim on the same tile.
        for p in to_claim {
            match self.tile_owner.get_mut(&p) {
                Some(owner) if owner == lid => {}
                Some(owner) => {
                    owner.clear();
                    owner.push_str(lid);
                }
                None => {
                    self.tile_owner.insert(p, lid.to_string());
                }
            }
        }
        for p in evicted {
            if let Some(owner) = self.tile_owner.get(&p) {
                if owner == lid {
                    self.tile_owner.remove(&p);
                }
            }
        }
    }

    /// The claim as it was before borrowing the lineage id and picking the
    /// evicted tiles instead of sorting them all, kept to check the new one
    /// against.
    #[cfg(test)]
    pub(super) fn claim_territory_reference(&mut self, lid: &str, cx: i32, cy: i32, radius: i32) {
        const MAX_TERRITORY: usize = 400;
        // Pre-compute the tile list so we can update both maps without
        // holding two mutable borrows on `self` simultaneously.
        let mut to_claim: Vec<(i32, i32)> = Vec::new();
        for dy in -radius..=radius {
            for dx in -radius..=radius {
                if dx * dx + dy * dy > radius * radius {
                    continue;
                }
                let tx = (cx + dx).clamp(0, crate::world::grid::WIDTH as i32 - 1);
                let ty = (cy + dy).clamp(0, crate::world::grid::HEIGHT as i32 - 1);
                if matches!(self.grid.get(tx, ty), Tile::Water | Tile::Void) {
                    continue;
                }
                to_claim.push((tx, ty));
            }
        }
        let tiles = self.territory.entry(lid.to_string()).or_default();
        for p in &to_claim {
            tiles.insert(*p);
        }
        let mut evicted: Vec<(i32, i32)> = Vec::new();
        if tiles.len() > MAX_TERRITORY {
            let mut sorted: Vec<(i32, i32)> = tiles.iter().copied().collect();
            sorted.sort_by_key(|&(x, y)| (-((x - cx) * (x - cx) + (y - cy) * (y - cy)), x, y));
            let excess = sorted.len() - MAX_TERRITORY;
            for p in sorted.into_iter().take(excess) {
                tiles.remove(&p);
                evicted.push(p);
            }
        }
        // Update the inverse map. New claims overwrite (most-recent
        // wins). Evictions only clear the inverse entry if it was
        // owned by *this* lineage - another lineage may have a more
        // recent claim on the same tile.
        for p in to_claim {
            self.tile_owner.insert(p, lid.to_string());
        }
        for p in evicted {
            if let Some(owner) = self.tile_owner.get(&p) {
                if owner == lid {
                    self.tile_owner.remove(&p);
                }
            }
        }
    }

    pub(super) fn apply_conquests(&mut self) {
        use crate::sim::warfare::BattleOutcome;
        let now = self.tick_count;
        let conquests: Vec<(String, String, (i32, i32))> = self
            .battles
            .iter()
            .filter(|b| b.ended_tick == Some(now))
            .filter_map(|b| {
                let (loser, winner) = match b.outcome {
                    Some(BattleOutcome::AttackerVictory) => (b.defenders.first()?, b.attackers.first()?),
                    Some(BattleOutcome::DefenderVictory) => (b.attackers.first()?, b.defenders.first()?),
                    _ => return None,
                };
                if loser == winner {
                    return None;
                }
                Some((loser.clone(), winner.clone(), b.location))
            })
            .collect();
        for (loser, winner, (lx, ly)) in conquests {
            let Some(loser_tiles) = self.territory.get(&loser).cloned() else {
                continue;
            };
            let r = 14;
            let taken: Vec<(i32, i32)> = loser_tiles
                .iter()
                .copied()
                .filter(|&(x, y)| (x - lx).abs() <= r && (y - ly).abs() <= r)
                .collect();
            if taken.len() < 4 {
                continue;
            }
            if let Some(lset) = self.territory.get_mut(&loser) {
                for t in &taken {
                    lset.remove(t);
                }
            }
            let wset = self.territory.entry(winner.clone()).or_default();
            for &t in &taken {
                wset.insert(t);
            }
            let taken_set: crate::hashing::FxHashSet<(i32, i32)> = taken.iter().copied().collect();
            let mut buildings_captured = false;
            for b in self.buildings.iter_mut() {
                if taken_set.contains(&(b.x, b.y)) {
                    b.owner_lineage = Some(winner.clone());
                    buildings_captured = true;
                }
            }
            if buildings_captured {
                self.building_state_revision = self.building_state_revision.wrapping_add(1);
            }
            let wname = self
                .lineage_names
                .get(&winner)
                .cloned()
                .unwrap_or_else(|| winner.clone());
            let lname = self
                .lineage_names
                .get(&loser)
                .cloned()
                .unwrap_or_else(|| loser.clone());
            let line = format!(
                "\u{2694}\u{FE0F} The {} conquered {} tiles of {} land.",
                wname,
                taken.len(),
                lname
            );
            push_event(&mut self.events, now, "milestone", "world", &line);
            self.headlines.push_back((now, line));
            while self.headlines.len() > 80 {
                self.headlines.pop_front();
            }
        }
    }
}
