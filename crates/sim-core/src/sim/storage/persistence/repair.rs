use super::*;

/// Saved `next_*_id` fields are advisory when loading older or hand-imported
/// worlds. Several of those fields were added after their entity collections,
/// so serde legitimately defaults them to zero. Always advance past every
/// persisted numeric ID before the simulation is allowed to create more
/// entities.
pub(super) fn repaired_next_u32_id(saved_next: u32, ids: impl Iterator<Item = u32>) -> u32 {
    ids.fold(saved_next.max(1), |next, id| next.max(id.saturating_add(1)))
}

pub(super) fn repaired_next_animal_id(saved_next: usize, animals: &[AnimalSave]) -> usize {
    animals
        .iter()
        .fold(saved_next, |next, animal| next.max(animal.id.saturating_add(1)))
}

pub(super) fn repaired_next_religion_id(saved_next: u32, religions: &[crate::sim::culture::Religion]) -> u32 {
    repaired_next_u32_id(
        saved_next,
        religions.iter().filter_map(|religion| {
            religion
                .id
                .strip_prefix("rel")
                .and_then(|suffix| suffix.parse::<u32>().ok())
        }),
    )
}

pub(super) fn repaired_next_sequence(saved_next: u32, persisted_count: usize) -> u32 {
    saved_next.max(
        u32::try_from(persisted_count)
            .unwrap_or(u32::MAX)
            .saturating_add(1),
    )
}
