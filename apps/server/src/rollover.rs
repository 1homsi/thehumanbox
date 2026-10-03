//! Monthly world rollover: archive the world and start a new one when the
//! calendar month turns (hosted profiles only).

use super::*;

pub(super) fn spawn_monthly_rollover(
    sim: SharedSim,
    world_started_at: Arc<AtomicU64>,
    peak_pop: Arc<AtomicU64>,
    population_limit: Option<usize>,
    save_gate: SaveGate,
) {
    if monthly_rollover_enabled() {
        let sim_arch = sim.clone();
        let started_at_arch = world_started_at.clone();
        let peak_arch = peak_pop.clone();
        let population_limit_arch = population_limit;
        let save_gate_arch = save_gate.clone();
        tokio::spawn(async move {
            let (mut cur_y, mut cur_m) = world_archive::current_year_month_utc();
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(600)).await;
                {
                    let s = sim_arch.lock().await;
                    let pop = s.organisms.iter().filter(|o| o.alive).count() as u64;
                    let prev = peak_arch.load(std::sync::atomic::Ordering::Relaxed);
                    if pop > prev {
                        peak_arch.store(pop, std::sync::atomic::Ordering::Relaxed);
                    }
                }
                let (y, m) = world_archive::current_year_month_utc();
                if (y, m) != (cur_y, cur_m) {
                    let started = started_at_arch.load(std::sync::atomic::Ordering::Relaxed);
                    let peak = peak_arch.load(std::sync::atomic::Ordering::Relaxed);
                    let active_hash =
                        crate::world_store::live_world_hash().unwrap_or_else(|| "_unknown".to_string());
                    let active_save = crate::world_store::world_save_path(&active_hash);
                    let active_save_str = active_save.to_string_lossy().to_string();
                    if let Some(hash) = world_archive::archive_and_reset(
                        sim_arch.clone(),
                        started,
                        peak,
                        &active_save_str,
                        population_limit_arch,
                        save_gate_arch.clone(),
                    )
                    .await
                    {
                        tracing::warn!(target: "archive", "month rollover -> archived as {}", hash);
                    }
                    started_at_arch.store(transport::now_ms(), std::sync::atomic::Ordering::Relaxed);
                    peak_arch.store(0, std::sync::atomic::Ordering::Relaxed);
                    cur_y = y;
                    cur_m = m;
                }
            }
        });
        tracing::info!(target: "archive", "monthly world rollover enabled");
    } else {
        tracing::info!(target: "archive", "monthly world rollover disabled for this profile");
    }
}
