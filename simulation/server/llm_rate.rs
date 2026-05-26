use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Semaphore;

pub struct GroqRateLimiter {
    sem: Arc<Semaphore>,
    capacity: usize,
}

impl GroqRateLimiter {
    pub fn new(per_minute: usize) -> Arc<Self> {
        let cap = per_minute.max(1);
        let sem = Arc::new(Semaphore::new(cap));
        let me = Arc::new(GroqRateLimiter {
            sem: sem.clone(),
            capacity: cap,
        });

        let refill_sem = sem.clone();
        let refill_capacity = cap;
        let interval_ms = (60_000 / refill_capacity).max(50) as u64;
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(Duration::from_millis(interval_ms));
            ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            loop {
                ticker.tick().await;
                let available = refill_sem.available_permits();
                if available < refill_capacity {
                    refill_sem.add_permits(1);
                }
            }
        });

        me
    }

    pub async fn acquire(&self) {
        if let Ok(permit) = self.sem.clone().acquire_owned().await {
            permit.forget();
        }
    }

    #[allow(dead_code)]
    pub fn available(&self) -> usize {
        self.sem.available_permits()
    }
    #[allow(dead_code)]
    pub fn capacity(&self) -> usize {
        self.capacity
    }
}

pub type SharedGroqLimiter = Arc<GroqRateLimiter>;

pub fn url_needs_groq_quota(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    if lower.contains("groq") {
        return true;
    }
    if lower.contains("localhost") || lower.contains("127.0.0.1") || lower.contains("0.0.0.0") {
        return false;
    }
    if lower.contains("://10.")
        || lower.contains("://192.168.")
        || lower.contains("://172.16.")
        || lower.contains("://172.17.")
        || lower.contains("://172.18.")
        || lower.contains("://172.19.")
        || lower.contains("://172.2")
        || lower.contains("://172.30.")
        || lower.contains("://172.31.")
    {
        return false;
    }
    false
}
