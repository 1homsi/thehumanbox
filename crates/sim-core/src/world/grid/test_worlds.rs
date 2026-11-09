//! The worlds the tests generate, kept on disk.
//!
//! Tests build their worlds from a few dozen seeds, over and over: about 1,400 worlds a run, each
//! 0.1 to 0.4 s of world generation, close to half of the suite's CPU time. nextest runs every test
//! in a process of its own, so a world is kept as a file (one per seed), and every later test that
//! asks for that seed reads it back in a few milliseconds instead of generating it again.
//!
//! The files live in the temp dir, in a folder named for this test binary (its path, size and
//! modified time): a rebuilt binary, whose world generation may have changed, never reads a world
//! an older build wrote. Any failure to read or write a file only means the world is generated as
//! it always was. `THB_TEST_WORLD_CACHE=0` turns the cache off.

use super::{Volcano, WorldGrid, HEIGHT, WIDTH};
use std::fs;
use std::hash::Hasher;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const DIR_PREFIX: &str = "thehumanbox-test-worlds-";
/// A file in the cache folder whose modified time says when a test process last used the folder.
const IN_USE: &str = "in-use";
const MAGIC: &[u8; 8] = b"THBWRLD1";

/// `WorldGrid::new` in tests: the world for `seed`, read from the cache when an earlier test of this
/// binary generated it.
pub(super) fn generated(seed: u64) -> WorldGrid {
    let Some(dir) = cache_dir() else {
        return fresh(seed);
    };
    let path = dir.join(format!("{seed}.bin"));
    if let Some(grid) = fs::read(&path)
        .ok()
        .and_then(|bytes| decode(&inflate(&bytes)?, seed))
    {
        return grid;
    }
    let grid = fresh(seed);
    // Written whole and renamed into place, so a test running at the same time never reads half a world.
    // Unique to this write: threads of one process (plain `cargo test`) can write the same seed at once.
    static WRITES: AtomicU64 = AtomicU64::new(0);
    let write = WRITES.fetch_add(1, Ordering::Relaxed);
    let tmp = dir.join(format!("{seed}.bin.{}.{write}.tmp", std::process::id()));
    // Made again if another build's cleanup took the folder away while this process ran.
    let _ = fs::create_dir_all(dir);
    let written = fs::write(&tmp, deflate(&encode(&grid, seed))).and_then(|()| fs::rename(&tmp, &path));
    if written.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    grid
}

fn fresh(seed: u64) -> WorldGrid {
    WorldGrid::new_sized::<WIDTH, HEIGHT>(seed, false)
}

fn cache_dir() -> Option<&'static Path> {
    static DIR: OnceLock<Option<PathBuf>> = OnceLock::new();
    DIR.get_or_init(|| {
        if std::env::var_os("THB_TEST_WORLD_CACHE").is_some_and(|v| v == "0") {
            return None;
        }
        let exe = std::env::current_exe().ok()?;
        let meta = exe.metadata().ok()?;
        let built = meta.modified().ok()?.duration_since(UNIX_EPOCH).ok()?;
        let mut key = crate::hashing::FxHasher::default();
        key.write(exe.as_os_str().as_encoded_bytes());
        key.write_u64(meta.len());
        key.write_u128(built.as_nanos());
        let root = std::env::temp_dir();
        let dir = root.join(format!("{DIR_PREFIX}{:016x}", key.finish()));
        let new = fs::create_dir(&dir).is_ok();
        // Reading files leaves the folder's own modified time alone, so each process that uses the cache
        // rewrites this file: a folder still being read is never an hour stale. (A file, as a directory's
        // time cannot be set through std on Windows.)
        let _ = fs::write(dir.join(IN_USE), []);
        if new {
            remove_stale_dirs(&root, &dir);
        }
        dir.is_dir().then_some(dir)
    })
    .as_deref()
}

/// The first process of a new build clears the folders of older builds (an hour unused), so
/// rebuilding all day does not fill the disk with worlds no binary will read again.
fn remove_stale_dirs(root: &Path, keep: &Path) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    let stale = SystemTime::now() - Duration::from_secs(3600);
    for entry in entries.flatten() {
        let path = entry.path();
        let ours = entry.file_name().to_string_lossy().starts_with(DIR_PREFIX);
        // Last used: the in-use mark, or the folder itself for one made before the mark existed.
        let used = fs::metadata(path.join(IN_USE)).or_else(|_| entry.metadata());
        let old = used.and_then(|m| m.modified()).is_ok_and(|t| t < stale);
        if ours && old && path != keep {
            let _ = fs::remove_dir_all(path);
        }
    }
}

/// Compressed, as most layers are flat at generation: a world is 15 MB raw and about a tenth of
/// that on disk, and the suite writes a couple of hundred seeds.
fn deflate(raw: &[u8]) -> Vec<u8> {
    use std::io::Write;
    let mut z = flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::fast());
    z.write_all(raw).expect("writing to memory");
    z.finish().expect("writing to memory")
}

fn inflate(packed: &[u8]) -> Option<Vec<u8>> {
    use std::io::Read;
    let mut raw = Vec::with_capacity(WIDTH * HEIGHT * 48);
    flate2::read::DeflateDecoder::new(packed)
        .read_to_end(&mut raw)
        .ok()?;
    Some(raw)
}

fn encode(grid: &WorldGrid, seed: u64) -> Vec<u8> {
    // Every field by name: a field added to WorldGrid fails to compile here until the cache keeps it.
    let WorldGrid {
        tiles,
        fire_intensity,
        food_trail,
        water_trail,
        path_trail,
        biome,
        temperature,
        structure,
        pool_centers,
        volcanoes,
        placed_volcanoes,
        fertility,
        hazard,
        pressure,
        elevation,
        depth,
        road,
        trail_dirty,
    } = grid;
    let mut out = Vec::with_capacity(WIDTH * HEIGHT * 48);
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&seed.to_le_bytes());
    let len = |out: &mut Vec<u8>, n: usize| out.extend_from_slice(&(n as u64).to_le_bytes());
    let i32s = |out: &mut Vec<u8>, values: &mut dyn Iterator<Item = i32>| {
        for v in values {
            out.extend_from_slice(&v.to_le_bytes());
        }
    };
    len(&mut out, tiles.len());
    out.extend(tiles.iter().map(|&t| t as u8));
    for layer in [
        fire_intensity,
        food_trail,
        water_trail,
        path_trail,
        temperature,
        structure,
        fertility,
        hazard,
        pressure,
        elevation,
        depth,
    ] {
        len(&mut out, layer.len());
        for v in layer {
            out.extend_from_slice(&v.to_bits().to_le_bytes());
        }
    }
    for layer in [biome, road] {
        len(&mut out, layer.len());
        out.extend_from_slice(layer);
    }
    len(&mut out, pool_centers.len());
    i32s(&mut out, &mut pool_centers.iter().flat_map(|&(x, y)| [x, y]));
    for list in [volcanoes, placed_volcanoes] {
        len(&mut out, list.len());
        i32s(&mut out, &mut list.iter().flat_map(|v| [v.x, v.y, v.r]));
    }
    // In the set's own order: it is an IndexSet, and the order it iterates in is part of the world.
    len(&mut out, trail_dirty.len());
    for &i in trail_dirty {
        out.extend_from_slice(&i.to_le_bytes());
    }
    out
}

struct Reader<'a>(&'a [u8]);

impl Reader<'_> {
    fn take<const N: usize>(&mut self) -> Option<[u8; N]> {
        let (head, rest) = self.0.split_first_chunk::<N>()?;
        self.0 = rest;
        Some(*head)
    }
    fn u64(&mut self) -> Option<u64> {
        self.take().map(u64::from_le_bytes)
    }
    fn i32(&mut self) -> Option<i32> {
        self.take().map(i32::from_le_bytes)
    }
    fn u32(&mut self) -> Option<u32> {
        self.take().map(u32::from_le_bytes)
    }
    fn len(&mut self) -> Option<usize> {
        usize::try_from(self.u64()?).ok()
    }
    /// A layer's length, which must be the map's.
    fn cells(&mut self) -> Option<usize> {
        self.len().filter(|&n| n == WIDTH * HEIGHT)
    }
    fn bytes(&mut self, n: usize) -> Option<&[u8]> {
        (self.0.len() >= n).then(|| {
            let (head, rest) = self.0.split_at(n);
            self.0 = rest;
            head
        })
    }
    fn f32s(&mut self) -> Option<Vec<f32>> {
        let n = self.cells()?;
        let raw = self.bytes(n * 4)?;
        Some(
            raw.as_chunks::<4>()
                .0
                .iter()
                .map(|&c| f32::from_bits(u32::from_le_bytes(c)))
                .collect(),
        )
    }
    fn u8s(&mut self) -> Option<Vec<u8>> {
        let n = self.cells()?;
        self.bytes(n).map(<[u8]>::to_vec)
    }
    fn volcanoes(&mut self) -> Option<Vec<Volcano>> {
        let n = self.len()?;
        (0..n)
            .map(|_| {
                Some(Volcano {
                    x: self.i32()?,
                    y: self.i32()?,
                    r: self.i32()?,
                })
            })
            .collect()
    }
}

fn decode(bytes: &[u8], seed: u64) -> Option<WorldGrid> {
    let mut r = Reader(bytes);
    if &r.take::<8>()? != MAGIC || r.u64()? != seed {
        return None;
    }
    let n = r.cells()?;
    let tiles = r.bytes(n)?.iter().map(|&t| t as i8).collect();
    let fire_intensity = r.f32s()?;
    let food_trail = r.f32s()?;
    let water_trail = r.f32s()?;
    let path_trail = r.f32s()?;
    let temperature = r.f32s()?;
    let structure = r.f32s()?;
    let fertility = r.f32s()?;
    let hazard = r.f32s()?;
    let pressure = r.f32s()?;
    let elevation = r.f32s()?;
    let depth = r.f32s()?;
    let biome = r.u8s()?;
    let road = r.u8s()?;
    let pools = r.len()?;
    let pool_centers = (0..pools)
        .map(|_| Some((r.i32()?, r.i32()?)))
        .collect::<Option<_>>()?;
    let volcanoes = r.volcanoes()?;
    let placed_volcanoes = r.volcanoes()?;
    let dirty = r.len()?;
    let trail_dirty = (0..dirty).map(|_| r.u32()).collect::<Option<_>>()?;
    if !r.0.is_empty() {
        return None;
    }
    Some(WorldGrid {
        tiles,
        fire_intensity,
        food_trail,
        water_trail,
        path_trail,
        biome,
        temperature,
        structure,
        pool_centers,
        volcanoes,
        placed_volcanoes,
        fertility,
        hazard,
        pressure,
        elevation,
        depth,
        road,
        trail_dirty,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The cache hands back exactly the world generation makes, every layer, bit for bit.
    #[test]
    fn a_cached_world_is_the_world_generation_makes() {
        for seed in [42, 7, 0xdead_beef] {
            let made = fresh(seed);
            let bytes = encode(&made, seed);
            let read = decode(&bytes, seed).expect("a world the cache wrote reads back");
            assert!(
                bytes == encode(&read, seed),
                "seed {seed} changed on the way through the cache"
            );
            // And through the file itself (written by the first call, or by another test).
            let (first, second) = (generated(seed), generated(seed));
            assert!(bytes == encode(&first, seed) && bytes == encode(&second, seed));
        }
    }

    #[test]
    fn cleanup_removes_only_folders_unused_for_an_hour() {
        let root = std::env::temp_dir().join(format!("thb-stale-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let folder = |name: &str, used_secs_ago: u64| {
            let dir = root.join(format!("{DIR_PREFIX}{name}"));
            fs::create_dir_all(&dir).unwrap();
            let mark = fs::File::create(dir.join(IN_USE)).unwrap();
            mark.set_modified(SystemTime::now() - Duration::from_secs(used_secs_ago))
                .unwrap();
            dir
        };
        let (keep, recent, old) = (folder("keep", 7200), folder("recent", 60), folder("old", 7200));
        let other = root.join("someone-elses-folder");
        fs::create_dir_all(&other).unwrap();
        remove_stale_dirs(&root, &keep);
        assert!(keep.is_dir(), "this build's own folder stays, however old");
        assert!(recent.is_dir(), "a folder used within the hour stays");
        assert!(!old.exists(), "a folder unused for two hours goes");
        assert!(other.is_dir(), "only the cache's own folders are touched");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_damaged_or_foreign_file_is_not_read() {
        let bytes = encode(&fresh(3), 3);
        assert!(decode(&bytes, 4).is_none(), "another seed's world");
        assert!(decode(&bytes[..bytes.len() - 1], 3).is_none(), "a cut-off file");
        let mut longer = bytes.clone();
        longer.push(0);
        assert!(decode(&longer, 3).is_none(), "a file with more in it");
    }
}
