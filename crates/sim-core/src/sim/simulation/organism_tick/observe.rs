//! What each awake person can see at the start of sensing.
//!
//! The scans only read the world. They run for everyone at once (see `sim::par`); the sensing
//! pass then writes each person, in order, from what was seen. A tribe that splits changes who
//! counts as kin for the people after the founder, so those scans are taken again from there.

use super::*;
use crate::sim::simulation::animals::SUMMONED_ALARM;

/// One awake person's neighbour counts and the beasts they would run from.
pub(in crate::sim::simulation) struct SenseLook {
    pub(super) kin_near: usize,
    pub(super) hostile_near: bool,
    pub(super) near_shelter: bool,
    pub(super) intruders: Vec<crate::intern::Sym>,
    pub(super) animal_near: bool,
    pub(super) fear_trait: f32,
    pub(super) ox: f32,
    pub(super) oy: f32,
    pub(super) wolf_threat: Option<(f32, f32, f32)>,
    pub(super) threat_kind: AnimalKind,
    pub(super) threat_summoned: bool,
    pub(super) summoned_threat: Option<(f32, f32, f32)>,
}

impl Default for SenseLook {
    fn default() -> Self {
        Self {
            kin_near: 0,
            hostile_near: false,
            near_shelter: false,
            intruders: Vec::new(),
            animal_near: false,
            fear_trait: 0.0,
            ox: 0.0,
            oy: 0.0,
            wolf_threat: None,
            threat_kind: AnimalKind::Wolf,
            threat_summoned: false,
            summoned_threat: None,
        }
    }
}

impl Simulation {
    pub(in crate::sim::simulation) fn sense_looks(
        &self,
        awake: &[bool],
        spatial: &SpatialIndex,
        animal_spatial: &SpatialIndex,
        org_idx_by_id: &FxHashMap<crate::intern::Sym, usize>,
    ) -> Vec<SenseLook> {
        self.sense_looks_range(
            0,
            self.organisms.len(),
            awake,
            spatial,
            animal_spatial,
            org_idx_by_id,
        )
    }

    /// Looks for `from..` again, after a tribe split changed who is kin.
    pub(in crate::sim::simulation) fn refill_sense_looks(
        &self,
        from: usize,
        looks: &mut [SenseLook],
        awake: &[bool],
        spatial: &SpatialIndex,
        animal_spatial: &SpatialIndex,
        org_idx_by_id: &FxHashMap<crate::intern::Sym, usize>,
    ) {
        if from >= looks.len() {
            return;
        }
        let tail = self.sense_looks_range(from, looks.len(), awake, spatial, animal_spatial, org_idx_by_id);
        for (slot, look) in looks[from..].iter_mut().zip(tail) {
            *slot = look;
        }
    }

    fn sense_looks_range(
        &self,
        start: usize,
        end: usize,
        awake: &[bool],
        spatial: &SpatialIndex,
        animal_spatial: &SpatialIndex,
        org_idx_by_id: &FxHashMap<crate::intern::Sym, usize>,
    ) -> Vec<SenseLook> {
        let count = end.saturating_sub(start);
        crate::sim::par::map_with(
            count,
            || Vec::with_capacity(32),
            |buf, k| {
                let i = start + k;
                if i >= awake.len() || !awake[i] || !self.organisms[i].alive {
                    return SenseLook::default();
                }
                self.sense_look_at(i, spatial, animal_spatial, org_idx_by_id, buf)
            },
        )
    }

    fn sense_look_at(
        &self,
        idx: usize,
        spatial: &SpatialIndex,
        animal_spatial: &SpatialIndex,
        org_idx_by_id: &FxHashMap<crate::intern::Sym, usize>,
        spatial_buf: &mut Vec<usize>,
    ) -> SenseLook {
        let hot = self
            .organism_columns
            .ready_for(self.organisms.len())
            .then(|| self.organism_columns.neighbours());
        let (ox, oy) = if let Some(hot) = hot {
            (hot.x[idx], hot.y[idx])
        } else {
            (self.organisms[idx].x, self.organisms[idx].y)
        };
        spatial.query_into(ox as i32, oy as i32, 6, spatial_buf);
        let (kin_near, hostile_near) = if self.organism_columns.ready_for(self.organisms.len()) {
            super::setup::kin_near_columns(&self.organism_columns, &self.organisms, idx, spatial_buf)
        } else {
            super::setup::kin_near_structs(&self.organisms, idx, spatial_buf)
        };
        let near_shelter = self.organisms[idx].near_shelter(&self.grid, &self.buildings);

        let my_lid = if self.organism_columns.ready_for(self.organisms.len()) {
            self.organism_columns.lineage[idx]
        } else {
            self.organisms[idx].lineage_id
        };
        let intruders = if let Some(elder_id) = self.lineage_elders.get(my_lid.as_str()) {
            if let Some(&elder_idx) = org_idx_by_id.get(elder_id.as_str()) {
                let ex = self.organisms[elder_idx].home_x;
                let ey = self.organisms[elder_idx].home_y;
                if (ox - ex).abs() + (oy - ey).abs() < 20.0 {
                    spatial.query_into(ex as i32, ey as i32, 12, spatial_buf);
                    super::setup::intruders_near(
                        &self.organisms,
                        self.organism_columns
                            .ready_for(self.organisms.len())
                            .then(|| self.organism_columns.neighbours()),
                        &my_lid,
                        ex,
                        ey,
                        spatial_buf,
                    )
                } else {
                    Vec::new()
                }
            } else {
                Vec::new()
            }
        } else {
            Vec::new()
        };

        let fear_trait = self.organisms[idx].traits.fear;
        let beast_wary = self.organisms[idx]
            .lessons
            .heeds(crate::organism::lessons::Lesson::Beasts);
        let wolf_flee_radius = 6.0 + fear_trait * 8.0 + beast_wary * 6.0;
        let mut animal_near = false;
        let mut wolf_threat: Option<(f32, f32, f32)> = None;
        let mut threat_kind = AnimalKind::Wolf;
        let mut threat_summoned = false;
        let mut summoned_threat: Option<(f32, f32, f32)> = None;
        let alarm_radius = wolf_flee_radius.max(SUMMONED_ALARM);
        animal_spatial.query_into(
            ox as i32,
            oy as i32,
            alarm_radius.max(8.0).ceil() as i32,
            spatial_buf,
        );
        spatial_buf.sort_unstable();
        for &animal_idx in spatial_buf.iter() {
            let a = &self.animals[animal_idx];
            if !a.alive {
                continue;
            }
            let d = (a.x - ox).abs() + (a.y - oy).abs();
            if d <= 8.0 {
                animal_near = true;
            }
            let radius = if a.summoned {
                alarm_radius
            } else {
                wolf_flee_radius
            };
            if a.kind.hostile()
                && !a.sleeping
                && d <= radius
                && wolf_threat.map(|(bd, _, _)| d < bd).unwrap_or(true)
            {
                wolf_threat = Some((d, a.x, a.y));
                threat_kind = a.kind;
                threat_summoned = a.summoned;
            }
            if a.summoned
                && a.kind.hostile()
                && !a.sleeping
                && d <= alarm_radius
                && summoned_threat.map(|(bd, _, _)| d < bd).unwrap_or(true)
            {
                summoned_threat = Some((d, a.x, a.y));
            }
        }

        SenseLook {
            kin_near,
            hostile_near,
            near_shelter,
            intruders,
            animal_near,
            fear_trait,
            ox,
            oy,
            wolf_threat,
            threat_kind,
            threat_summoned,
            summoned_threat,
        }
    }
}
