//! Monthly world rollover: archive the world and start a new one when the
//! calendar month turns (hosted profiles only).

use super::*;
use serde::{Deserialize, Serialize};

const LIVE_META_FILE: &str = "live_meta.json";
const CHECK_EVERY: std::time::Duration = std::time::Duration::from_secs(600);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct LiveMeta {
    pub(crate) start_year: i32,
    pub(crate) start_month: u32,
    pub(crate) started_at_ms: u64,
    pub(crate) peak_pop: u64,
}

impl LiveMeta {
    pub(crate) fn starting(year_month: (i32, u32), now_ms: u64) -> Self {
        Self {
            start_year: year_month.0,
            start_month: year_month.1,
            started_at_ms: now_ms,
            peak_pop: 0,
        }
    }

    pub(crate) fn rollover_due(&self, year_month: (i32, u32)) -> bool {
        (self.start_year, self.start_month) != year_month
    }
}

fn live_meta_path(hash: &str) -> std::path::PathBuf {
    crate::world_store::world_dir(hash).join(LIVE_META_FILE)
}

pub(crate) fn load_live_meta(hash: &str) -> Option<LiveMeta> {
    let bytes = std::fs::read(live_meta_path(hash)).ok()?;
    serde_json::from_slice(&bytes).ok()
}

pub(crate) fn save_live_meta(hash: &str, meta: &LiveMeta) -> std::io::Result<()> {
    crate::world_store::ensure_world_dir(hash)?;
    let path = live_meta_path(hash);
    let tmp = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(meta).map_err(std::io::Error::other)?;
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(tmp, path)
}

pub(crate) fn load_or_start_live_meta(hash: Option<&str>, year_month: (i32, u32), now_ms: u64) -> LiveMeta {
    let Some(hash) = hash else {
        return LiveMeta::starting(year_month, now_ms);
    };
    if let Some(meta) = load_live_meta(hash) {
        return meta;
    }
    let meta = LiveMeta::starting(year_month, now_ms);
    if let Err(e) = save_live_meta(hash, &meta) {
        tracing::warn!(target: "archive", "could not write worlds/{}/{}: {}", hash, LIVE_META_FILE, e);
    }
    meta
}

pub(crate) fn start_new_live_meta(year_month: (i32, u32), now_ms: u64) -> LiveMeta {
    let meta = LiveMeta::starting(year_month, now_ms);
    if let Some(hash) = crate::world_store::live_world_hash() {
        if let Err(e) = save_live_meta(&hash, &meta) {
            tracing::warn!(target: "archive", "could not write worlds/{}/{}: {}", hash, LIVE_META_FILE, e);
        }
    }
    meta
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum RolloverOutcome {
    NotDue,
    Archived(String),
    Failed,
}

pub(crate) struct Rollover {
    pub(crate) sim: SharedSim,
    pub(crate) world_started_at: Arc<AtomicU64>,
    pub(crate) peak_pop: Arc<AtomicU64>,
    pub(crate) population_limit: Option<usize>,
    pub(crate) save_gate: SaveGate,
    pub(crate) world_store: SharedWorldStore,
}

impl Rollover {
    pub(crate) async fn check(&self, year_month: (i32, u32), now_ms: u64) -> RolloverOutcome {
        let pop = {
            let s = self.sim.lock().await;
            s.organisms.iter().filter(|o| o.alive).count() as u64
        };
        let hash = crate::world_store::live_world_hash();
        let mut meta = load_or_start_live_meta(hash.as_deref(), year_month, now_ms);
        let peak = self.peak_pop.load(std::sync::atomic::Ordering::Relaxed).max(pop);
        self.peak_pop.store(peak, std::sync::atomic::Ordering::Relaxed);
        if peak > meta.peak_pop {
            meta.peak_pop = peak;
            if let Some(hash) = hash.as_deref() {
                if let Err(e) = save_live_meta(hash, &meta) {
                    tracing::warn!(target: "archive", "could not record peak population: {}", e);
                }
            }
        }
        if !meta.rollover_due(year_month) {
            return RolloverOutcome::NotDue;
        }
        let active_hash = hash.unwrap_or_else(|| "_unknown".to_string());
        let active_save = crate::world_store::world_save_path(&active_hash);
        let archived = world_archive::archive_and_reset(
            self.sim.clone(),
            meta.started_at_ms,
            meta.peak_pop,
            &active_save.to_string_lossy(),
            self.population_limit,
            self.save_gate.clone(),
            &self.world_store,
        )
        .await;
        let Some(hash) = archived else {
            tracing::warn!(target: "archive",
                "month rollover from {}-{:02} failed; the live world stays and the rollover is retried",
                meta.start_year, meta.start_month);
            return RolloverOutcome::Failed;
        };
        let next = start_new_live_meta(year_month, now_ms);
        self.world_started_at
            .store(next.started_at_ms, std::sync::atomic::Ordering::Relaxed);
        self.peak_pop.store(0, std::sync::atomic::Ordering::Relaxed);
        tracing::warn!(target: "archive", "month rollover -> archived as {}", hash);
        RolloverOutcome::Archived(hash)
    }
}

pub(super) fn spawn_monthly_rollover(rollover: Rollover) {
    if monthly_rollover_enabled() {
        tokio::spawn(async move {
            loop {
                rollover
                    .check(world_archive::current_year_month_utc(), transport::now_ms())
                    .await;
                tokio::time::sleep(CHECK_EVERY).await;
            }
        });
        tracing::info!(target: "archive", "monthly world rollover enabled");
    } else {
        tracing::info!(target: "archive", "monthly world rollover disabled for this profile");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TempWorlds {
        root: std::path::PathBuf,
        previous: std::path::PathBuf,
    }

    impl TempWorlds {
        fn enter(name: &str) -> Self {
            let root = std::env::temp_dir().join(format!("thb_rollover_{name}_{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&root);
            std::fs::create_dir_all(&root).unwrap();
            let previous = std::env::current_dir().unwrap();
            std::env::set_current_dir(&root).unwrap();
            Self { root, previous }
        }
    }

    impl Drop for TempWorlds {
        fn drop(&mut self) {
            let _ = std::env::set_current_dir(&self.previous);
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    fn rollover_for(hash: &str, tick_count: u64) -> Rollover {
        crate::world_store::set_live_world_hash(hash).unwrap();
        let store = SharedWorldStore::new(Some(crate::world_store::WorldStore::open(hash).unwrap()));
        let mut world = Simulation::new(7);
        world.tick_count = tick_count;
        Rollover {
            sim: Arc::new(tokio::sync::Mutex::new(world)),
            world_started_at: Arc::new(AtomicU64::new(0)),
            peak_pop: Arc::new(AtomicU64::new(0)),
            population_limit: None,
            save_gate: Arc::new(tokio::sync::Mutex::new(())),
            world_store: store,
        }
    }

    fn runtime() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
    }

    #[test]
    fn a_restart_after_the_month_turned_still_rolls_the_world_over() {
        let _cwd = crate::world_store::CWD_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let _dir = TempWorlds::enter("restart");
        let hash = "a1b2c3d4e5f6";
        crate::world_store::ensure_world_dir(hash).unwrap();
        let october = LiveMeta {
            start_year: 2026,
            start_month: 10,
            started_at_ms: 1_000,
            peak_pop: 77,
        };
        save_live_meta(hash, &october).unwrap();

        let rollover = rollover_for(hash, 900);
        let outcome = runtime().block_on(rollover.check((2026, 11), 5_000));

        assert_eq!(outcome, RolloverOutcome::Archived(hash.to_string()));
        let archived = world_archive::read_world_meta(hash).expect("archived meta");
        assert_eq!(
            archived.started_at_ms, 1_000,
            "the persisted start, not the restart time"
        );
        assert!(
            archived.peak_population >= 77,
            "the persisted peak survives the restart"
        );
        let live = crate::world_store::live_world_hash().unwrap();
        assert_ne!(live, hash);
        assert_eq!(load_live_meta(&live), Some(LiveMeta::starting((2026, 11), 5_000)));
        assert_eq!(
            rollover
                .world_started_at
                .load(std::sync::atomic::Ordering::Relaxed),
            5_000
        );
    }

    #[test]
    fn a_failed_archive_keeps_the_month_and_is_retried() {
        let _cwd = crate::world_store::CWD_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let _dir = TempWorlds::enter("retry");
        let hash = "f6e5d4c3b2a1";
        crate::world_store::ensure_world_dir(hash).unwrap();
        save_live_meta(hash, &LiveMeta::starting((2026, 10), 1_000)).unwrap();

        let rollover = rollover_for(hash, 10);
        let rt = runtime();
        assert_eq!(
            rt.block_on(rollover.check((2026, 11), 2_000)),
            RolloverOutcome::Failed
        );
        assert_eq!(crate::world_store::live_world_hash().as_deref(), Some(hash));
        assert!(
            load_live_meta(hash).unwrap().rollover_due((2026, 11)),
            "still owed a rollover"
        );

        rt.block_on(async { rollover.sim.lock().await.tick_count = 900 });
        assert_eq!(
            rt.block_on(rollover.check((2026, 11), 3_000)),
            RolloverOutcome::Archived(hash.to_string())
        );
        let live = crate::world_store::live_world_hash().unwrap();
        assert_eq!(
            rt.block_on(rollover.check((2026, 11), 4_000)),
            RolloverOutcome::NotDue
        );
        assert_eq!(crate::world_store::live_world_hash(), Some(live));
    }

    #[test]
    fn a_first_start_records_this_month_and_is_not_due() {
        let _cwd = crate::world_store::CWD_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let _dir = TempWorlds::enter("first");
        let hash = "0f0f0f0f0f0f";
        let rollover = rollover_for(hash, 10);
        assert_eq!(
            runtime().block_on(rollover.check((2026, 11), 9)),
            RolloverOutcome::NotDue
        );
        let meta = load_live_meta(hash).expect("written on first start");
        assert_eq!(
            (meta.start_year, meta.start_month, meta.started_at_ms),
            (2026, 11, 9)
        );
        assert!(meta.peak_pop > 0, "the peak is recorded");
    }
}
