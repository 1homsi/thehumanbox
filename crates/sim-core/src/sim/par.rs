//! Running the parts of a tick that only read the world on several cores at once.
//!
//! The rule that keeps worlds reproducible: work handed to these helpers reads the world and returns a
//! value; it never writes to the world or draws from the world's random numbers. Results come back in index
//! order, so a run gives the same world whatever the number of cores, and the same world with the
//! `parallel` feature off (the web build), where the same work runs on one thread.

/// `f(scratch, i)` for every `i` in `0..n`, in index order. Each worker thread gets its own `scratch`
/// from `init`, for buffers reused across calls.
pub(crate) fn map_with<S, T, I, F>(n: usize, init: I, f: F) -> Vec<T>
where
    T: Send,
    I: Fn() -> S + Sync + Send,
    F: Fn(&mut S, usize) -> T + Sync + Send,
{
    #[cfg(feature = "parallel")]
    {
        use rayon::prelude::*;
        // Each call is a few microseconds: batches keep the hand-off cost well under the work.
        (0..n)
            .into_par_iter()
            .with_min_len(MIN_BATCH)
            .map_init(&init, &f)
            .collect()
    }
    #[cfg(not(feature = "parallel"))]
    {
        let mut scratch = init();
        (0..n).map(|i| f(&mut scratch, i)).collect()
    }
}

/// The fewest items one worker takes at a time.
#[cfg(feature = "parallel")]
const MIN_BATCH: usize = 16;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn results_come_back_in_index_order() {
        let out = map_with(1000, Vec::<usize>::new, |seen, i| {
            seen.push(i);
            i * 2
        });
        assert_eq!(out, (0..1000).map(|i| i * 2).collect::<Vec<_>>());
    }

    #[test]
    fn nothing_to_do_returns_nothing() {
        assert!(map_with(0, || (), |_, i| i).is_empty());
    }
}
