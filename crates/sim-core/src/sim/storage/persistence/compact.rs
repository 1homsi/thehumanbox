use serde::de::{self, Visitor};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::fmt;

pub(crate) const MAGIC_V1: &[u8; 8] = b"THBSAVE\x01";

pub(crate) const MAGIC: &[u8; 8] = b"THBSAVE\x02";

pub(crate) struct Bytes<'a>(pub(crate) &'a [u8]);

impl Serialize for Bytes<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_bytes(self.0)
    }
}

pub(crate) struct ByteBuf(pub(crate) Vec<u8>);

impl<'de> Deserialize<'de> for ByteBuf {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct BytesVisitor;
        impl<'de> Visitor<'de> for BytesVisitor {
            type Value = ByteBuf;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                f.write_str("bytes")
            }
            fn visit_bytes<E: de::Error>(self, v: &[u8]) -> Result<ByteBuf, E> {
                Ok(ByteBuf(v.to_vec()))
            }
            fn visit_byte_buf<E: de::Error>(self, v: Vec<u8>) -> Result<ByteBuf, E> {
                Ok(ByteBuf(v))
            }
            fn visit_seq<A: de::SeqAccess<'de>>(self, mut seq: A) -> Result<ByteBuf, A::Error> {
                let mut out = Vec::new();
                while let Some(b) = seq.next_element::<u8>()? {
                    out.push(b);
                }
                Ok(ByteBuf(out))
            }
        }
        deserializer.deserialize_bytes(BytesVisitor)
    }
}

pub(crate) fn put_varint(out: &mut Vec<u8>, mut value: u64) {
    loop {
        let byte = (value & 0x7f) as u8;
        value >>= 7;
        if value == 0 {
            out.push(byte);
            return;
        }
        out.push(byte | 0x80);
    }
}

pub(crate) fn get_varint(bytes: &[u8], at: &mut usize) -> Option<u64> {
    let mut value = 0u64;
    for shift in (0..64).step_by(7) {
        let byte = *bytes.get(*at)?;
        *at += 1;
        value |= u64::from(byte & 0x7f) << shift;
        if byte & 0x80 == 0 {
            return Some(value);
        }
    }
    None
}

pub(crate) fn f32_to_f16(value: f32) -> u16 {
    let bits = value.to_bits();
    let sign = ((bits >> 16) & 0x8000) as u16;
    let exp = ((bits >> 23) & 0xff) as i32;
    let mant = bits & 0x7f_ffff;
    if exp == 0xff {
        return sign | 0x7c00 | if mant != 0 { 0x200 } else { 0 };
    }
    let e = exp - 127 + 15;
    if e >= 0x1f {
        return sign | 0x7bff;
    }
    if e <= 0 {
        if e < -10 {
            return sign;
        }
        let m = mant | 0x80_0000;
        let shift = (14 - e) as u32;
        let half = 1u32 << (shift - 1);
        let rest = m & ((1u32 << shift) - 1);
        let mut out = m >> shift;
        if rest > half || (rest == half && out & 1 == 1) {
            out += 1;
        }
        return sign | out as u16;
    }
    let rest = mant & 0x1fff;
    let mut out = ((e as u32) << 10) | (mant >> 13);
    if rest > 0x1000 || (rest == 0x1000 && out & 1 == 1) {
        out += 1;
    }
    sign | out.min(0x7bff) as u16
}

pub(crate) fn f16_to_f32(half: u16) -> f32 {
    let sign = u32::from(half & 0x8000) << 16;
    let exp = u32::from((half >> 10) & 0x1f);
    let mant = u32::from(half & 0x3ff);
    let bits = match (exp, mant) {
        (0, 0) => sign,
        (0, m) => {
            let mut e = 127 - 15 + 1;
            let mut m = m;
            while m & 0x400 == 0 {
                m <<= 1;
                e -= 1;
            }
            sign | ((e as u32) << 23) | ((m & 0x3ff) << 13)
        }
        (0x1f, m) => sign | 0x7f80_0000 | (m << 13),
        (e, m) => sign | ((e + 127 - 15) << 23) | (m << 13),
    };
    f32::from_bits(bits)
}

pub(crate) fn f32_to_byte(value: f32) -> u8 {
    let half = f32_to_f16(value);
    if half & 0x7c00 == 0x7c00 {
        return (half >> 8) as u8;
    }
    let (high, low) = (half >> 8, half & 0xff);
    let mut out = high;
    if low > 0x80 || (low == 0x80 && high & 1 == 1) {
        out += 1;
    }
    if out & 0x7c == 0x7c {
        out -= 1;
    }
    out as u8
}

pub(crate) fn byte_to_f32(byte: u8) -> f32 {
    f16_to_f32(u16::from(byte) << 8)
}

#[cfg(test)]
pub(crate) fn quantize_byte(value: f32) -> f32 {
    byte_to_f32(f32_to_byte(value))
}

#[cfg(test)]
pub(crate) fn quantize(value: f32) -> f32 {
    f16_to_f32(f32_to_f16(value))
}

pub(crate) mod q_table {
    use super::*;
    use crate::hashing::FxHashMap;
    use std::cell::RefCell;

    type Table = FxHashMap<String, Vec<(u16, f32)>>;

    thread_local! {
        static WRITING: RefCell<Option<(FxHashMap<String, u32>, bool)>> = const { RefCell::new(None) };
        static READING: RefCell<Option<(Vec<String>, bool)>> = const { RefCell::new(None) };
    }

    pub(crate) struct Writing(Option<(FxHashMap<String, u32>, bool)>);

    impl Writing {
        pub(crate) fn new(keys: &[String], wide: bool) -> Self {
            let index = keys
                .iter()
                .enumerate()
                .map(|(i, k)| (k.clone(), i as u32))
                .collect();
            Writing(Some((index, wide)))
        }

        pub(crate) fn run<R>(&mut self, f: impl FnOnce() -> R) -> R {
            WRITING.with_borrow_mut(|w| *w = self.0.take());
            let out = f();
            self.0 = WRITING.with_borrow_mut(Option::take);
            out
        }
    }

    pub(crate) fn writing_with<R>(keys: &[String], wide: bool, f: impl FnOnce() -> R) -> R {
        Writing::new(keys, wide).run(f)
    }

    pub(crate) fn reading_with(keys: Vec<String>, wide: bool) {
        READING.with_borrow_mut(|r| *r = Some((keys, wide)));
    }

    pub(crate) fn reading_done() {
        READING.with_borrow_mut(|r| *r = None);
    }

    pub(crate) fn serialize<S: Serializer>(table: &Table, serializer: S) -> Result<S::Ok, S::Error> {
        if serializer.is_human_readable() || WRITING.with_borrow(Option::is_none) {
            return table.serialize(serializer);
        }
        let blob = WRITING.with_borrow(|writing| -> Result<Vec<u8>, String> {
            let (index, wide) = writing.as_ref().ok_or("q_table keys were not gathered")?;
            let entries: usize = table.values().map(Vec::len).sum();
            let mut blob = Vec::with_capacity(4 + table.len() * 3 + entries * 4);
            put_varint(&mut blob, table.len() as u64);
            for (key, row) in table {
                let at = index
                    .get(key)
                    .ok_or("q_table key missing from the gathered keys")?;
                put_varint(&mut blob, u64::from(*at));
                put_varint(&mut blob, row.len() as u64);
            }
            let entries = || table.values().flatten();
            blob.extend(entries().map(|&(action, _)| action as u8));
            blob.extend(entries().map(|&(action, _)| (action >> 8) as u8));
            if *wide {
                blob.extend(entries().map(|&(_, value)| f32_to_f16(value) as u8));
                blob.extend(entries().map(|&(_, value)| (f32_to_f16(value) >> 8) as u8));
            } else {
                blob.extend(entries().map(|&(_, value)| f32_to_byte(value)));
            }
            Ok(blob)
        });
        let blob = blob.map_err(serde::ser::Error::custom)?;
        Bytes(&blob).serialize(serializer)
    }

    pub(crate) fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Table, D::Error> {
        if deserializer.is_human_readable() || READING.with_borrow(Option::is_none) {
            return Table::deserialize(deserializer);
        }
        let blob = ByteBuf::deserialize(deserializer)?.0;
        READING.with_borrow(|reading| {
            let (keys, wide) = reading
                .as_ref()
                .ok_or_else(|| de::Error::custom("q_table keys were not read"))?;
            let width = if *wide { 4 } else { 3 };
            let cut = || de::Error::custom("q_table is cut off");
            let mut at = 0;
            let rows = get_varint(&blob, &mut at).ok_or_else(cut)?;
            let rows = usize::try_from(rows).map_err(de::Error::custom)?.min(blob.len());
            let mut shape = Vec::with_capacity(rows);
            let mut entries = 0usize;
            for _ in 0..rows {
                let key = get_varint(&blob, &mut at).ok_or_else(cut)?;
                let key = usize::try_from(key)
                    .ok()
                    .and_then(|k| keys.get(k))
                    .ok_or_else(|| de::Error::custom("q_table key out of range"))?;
                let len = get_varint(&blob, &mut at).ok_or_else(cut)?;
                let len = usize::try_from(len).map_err(de::Error::custom)?;
                entries = entries.checked_add(len).ok_or_else(cut)?;
                shape.push((key, len));
            }
            let planes = blob.get(at..).ok_or_else(cut)?;
            if entries.checked_mul(width) != Some(planes.len()) {
                return Err(cut());
            }
            let byte = |plane: usize, i: usize| u16::from(planes[plane * entries + i]);
            let mut table = Table::with_capacity_and_hasher(rows, Default::default());
            let mut i = 0;
            for (key, len) in shape {
                let row = (i..i + len)
                    .map(|e| {
                        let action = byte(0, e) | byte(1, e) << 8;
                        let value = if *wide {
                            f16_to_f32(byte(2, e) | byte(3, e) << 8)
                        } else {
                            byte_to_f32(byte(2, e) as u8)
                        };
                        (action, value)
                    })
                    .collect();
                i += len;
                table.insert(key.clone(), row);
            }
            Ok(table)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn half_floats_round_to_nearest_and_keep_specials() {
        for v in [
            0.0f32,
            -0.0,
            1.0,
            -1.0,
            0.5,
            65504.0,
            -85.774475,
            0.0015029005,
            1e-7,
            6.1e-5,
            15.622549,
        ] {
            let back = quantize(v);
            assert!((back - v).abs() <= v.abs() * 0.0005 + 6e-8, "{v} -> {back}");
            assert_eq!(quantize(back).to_bits(), back.to_bits(), "{v} is stable");
        }
        for v in [
            0.0f32,
            -0.0,
            1.0,
            -0.2039,
            0.109,
            -85.774475,
            0.0015029005,
            15.622549,
        ] {
            let back = quantize_byte(v);
            assert!((back - v).abs() <= v.abs() * 0.13 + 1e-7, "{v} -> {back}");
            assert_eq!(quantize_byte(back).to_bits(), back.to_bits(), "{v} is stable");
        }
        assert_eq!(quantize_byte(1e6), 57344.0);
        assert!(quantize(f32::NAN).is_nan());
        assert_eq!(quantize(f32::INFINITY), f32::INFINITY);
        assert_eq!(quantize(1e6), 65504.0);
        assert_eq!(quantize(-70000.0), -65504.0);
        for half in 0..=u16::MAX {
            let v = f16_to_f32(half);
            if !v.is_nan() {
                assert_eq!(f32_to_f16(v), half, "{half:#06x}");
            }
        }
    }
}
