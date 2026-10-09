//! Hash maps and sets whose iteration order is the same on every target.
//!
//! The simulation walks some hash maps and sets while it decides things, so
//! the iteration order changes the outcome. `rustc_hash::FxHasher` uses
//! different multiplier, rotation and word size on 32-bit targets, so the
//! browser build (wasm32) iterated the same keys in a different order than the
//! native build and the two worlds diverged on tick 0.
//!
//! The hasher below is the 64-bit `FxHasher` algorithm from rustc-hash 2.1.3
//! (MIT or Apache-2.0), with every word size fixed to 64 bits, so the output
//! no longer depends on the target's pointer width. On 64-bit targets it
//! produces the same hashes as rustc-hash did before this module existed.

use std::hash::{BuildHasherDefault, Hasher};

/// `HashMap` with the platform-independent Fx hasher.
pub type FxHashMap<K, V> = std::collections::HashMap<K, V, BuildHasherDefault<FxHasher>>;

/// `HashSet` with the platform-independent Fx hasher.
pub type FxHashSet<T> = std::collections::HashSet<T, BuildHasherDefault<FxHasher>>;

const K: u64 = 0xf1357aea2e62a9c5;
const ROTATE: u32 = 26;
const SEED1: u64 = 0x243f6a8885a308d3;
const SEED2: u64 = 0x13198a2e03707344;
const PREVENT_TRIVIAL_ZERO_COLLAPSE: u64 = 0xa4093822299f31d0;

/// Fx hasher with 64-bit arithmetic on every target.
#[derive(Clone, Default)]
pub struct FxHasher {
    hash: u64,
}

impl FxHasher {
    #[inline]
    fn add_to_hash(&mut self, i: u64) {
        self.hash = self.hash.wrapping_add(i).wrapping_mul(K);
    }
}

impl Hasher for FxHasher {
    #[inline]
    fn write(&mut self, bytes: &[u8]) {
        self.write_u64(hash_bytes(bytes));
    }

    #[inline]
    fn write_u8(&mut self, i: u8) {
        self.add_to_hash(i as u64);
    }

    #[inline]
    fn write_u16(&mut self, i: u16) {
        self.add_to_hash(i as u64);
    }

    #[inline]
    fn write_u32(&mut self, i: u32) {
        self.add_to_hash(i as u64);
    }

    #[inline]
    fn write_u64(&mut self, i: u64) {
        self.add_to_hash(i);
    }

    #[inline]
    fn write_u128(&mut self, i: u128) {
        self.add_to_hash(i as u64);
        self.add_to_hash((i >> 64) as u64);
    }

    #[inline]
    fn write_usize(&mut self, i: usize) {
        self.add_to_hash(i as u64);
    }

    #[inline]
    fn finish(&self) -> u64 {
        self.hash.rotate_left(ROTATE)
    }
}

#[inline]
fn multiply_mix(x: u64, y: u64) -> u64 {
    let full = (x as u128).wrapping_mul(y as u128);
    let lo = full as u64;
    let hi = (full >> 64) as u64;
    lo ^ hi
}

/// Byte-slice hash from rustc-hash 2.1.3 (64-bit path), used by `write`.
#[inline]
fn hash_bytes(bytes: &[u8]) -> u64 {
    let len = bytes.len();
    let mut s0 = SEED1;
    let mut s1 = SEED2;

    if len <= 16 {
        if len >= 8 {
            s0 ^= u64::from_le_bytes(bytes[0..8].try_into().unwrap());
            s1 ^= u64::from_le_bytes(bytes[len - 8..].try_into().unwrap());
        } else if len >= 4 {
            s0 ^= u32::from_le_bytes(bytes[0..4].try_into().unwrap()) as u64;
            s1 ^= u32::from_le_bytes(bytes[len - 4..].try_into().unwrap()) as u64;
        } else if len > 0 {
            let lo = bytes[0];
            let mid = bytes[len / 2];
            let hi = bytes[len - 1];
            s0 ^= lo as u64;
            s1 ^= ((hi as u64) << 8) | mid as u64;
        }
    } else {
        let mut bulk = &bytes[..(len - 1)];
        while let Some((chunk, rest)) = bulk.split_first_chunk::<16>() {
            let x = u64::from_le_bytes((&chunk[..8]).try_into().unwrap());
            let y = u64::from_le_bytes((&chunk[8..]).try_into().unwrap());
            let t = multiply_mix(s0 ^ x, PREVENT_TRIVIAL_ZERO_COLLAPSE ^ y);
            s0 = s1;
            s1 = t;
            bulk = rest;
        }

        let suffix = &bytes[len - 16..];
        s0 ^= u64::from_le_bytes(suffix[0..8].try_into().unwrap());
        s1 ^= u64::from_le_bytes(suffix[8..16].try_into().unwrap());
    }

    multiply_mix(s0, s1) ^ (len as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixed_fingerprints_do_not_depend_on_target_width() {
        // Golden values for the 64-bit algorithm. A 32-bit build must match
        // them too, so these are the same on every target.
        let mut h = FxHasher::default();
        h.write_u32(7);
        h.write_i32(-3);
        h.write_usize(9);
        assert_eq!(h.finish(), GOLDEN_TUPLE_HASH);

        let mut s = FxHasher::default();
        s.write(b"food memory key");
        assert_eq!(s.finish(), GOLDEN_STR_HASH);
    }

    const GOLDEN_TUPLE_HASH: u64 = 647_685_282_529_052_894;
    const GOLDEN_STR_HASH: u64 = 3_973_413_967_989_070_650;
}
