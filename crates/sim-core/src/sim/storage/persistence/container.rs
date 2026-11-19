use std::io::{self, Read, Write};

pub const SAVE_MAGIC: [u8; 4] = [0x89, b'T', b'H', b'B'];
pub const CONTAINER_VERSION: u8 = 1;
pub const CODEC_RAW: u8 = 0;
pub const CODEC_GZIP: u8 = 1;
pub const HEADER_BYTES: usize = 6;
const GZIP_MAGIC: [u8; 2] = [0x1f, 0x8b];
const GZIP_LEVEL: u32 = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SaveFormat {
    Container,
    Gzip,
    Plain,
}

pub fn save_format(bytes: &[u8]) -> SaveFormat {
    if bytes.starts_with(&SAVE_MAGIC) {
        SaveFormat::Container
    } else if bytes.starts_with(&GZIP_MAGIC) {
        SaveFormat::Gzip
    } else {
        SaveFormat::Plain
    }
}

fn invalid(message: String) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

pub fn write_packed<W: Write>(mut out: W, payload: &[u8]) -> io::Result<W> {
    out.write_all(&SAVE_MAGIC)?;
    out.write_all(&[CONTAINER_VERSION, CODEC_GZIP])?;
    let mut gzip = flate2::write::GzEncoder::new(out, flate2::Compression::new(GZIP_LEVEL));
    gzip.write_all(payload)?;
    gzip.finish()
}

pub fn pack(payload: &[u8]) -> io::Result<Vec<u8>> {
    write_packed(Vec::with_capacity(payload.len() / 3 + HEADER_BYTES), payload)
}

fn gunzip(bytes: &[u8]) -> io::Result<Vec<u8>> {
    let mut out = Vec::with_capacity(bytes.len().saturating_mul(3));
    flate2::read::GzDecoder::new(bytes).read_to_end(&mut out)?;
    Ok(out)
}

pub fn unpack(bytes: Vec<u8>) -> io::Result<Vec<u8>> {
    match save_format(&bytes) {
        SaveFormat::Plain => Ok(bytes),
        SaveFormat::Gzip => gunzip(&bytes),
        SaveFormat::Container => {
            if bytes.len() < HEADER_BYTES {
                return Err(invalid("world save container is cut short".to_string()));
            }
            let (version, codec) = (bytes[4], bytes[5]);
            if version != CONTAINER_VERSION {
                return Err(invalid(format!(
                    "world save container v{version} is newer than this build reads (v{CONTAINER_VERSION})"
                )));
            }
            match codec {
                CODEC_RAW => Ok(bytes[HEADER_BYTES..].to_vec()),
                CODEC_GZIP => gunzip(&bytes[HEADER_BYTES..]),
                other => Err(invalid(format!(
                    "world save container has an unknown codec {other}"
                ))),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_packed_save_has_the_browser_header_and_unpacks_to_its_payload() {
        let payload = b"THBSAVE\x02 a world, many times over".repeat(200);
        let packed = pack(&payload).unwrap();
        assert_eq!(&packed[..6], &[0x89, b'T', b'H', b'B', 1, 1]);
        assert!(packed.len() < payload.len());
        assert_eq!(save_format(&packed), SaveFormat::Container);
        assert_eq!(unpack(packed).unwrap(), payload);
    }

    #[test]
    fn plain_raw_and_bare_gzip_saves_all_read() {
        let payload = br#"{"version":7}"#.to_vec();
        assert_eq!(unpack(payload.clone()).unwrap(), payload);
        let mut raw = SAVE_MAGIC.to_vec();
        raw.extend([CONTAINER_VERSION, CODEC_RAW]);
        raw.extend(&payload);
        assert_eq!(unpack(raw).unwrap(), payload);
        let mut gzip = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        gzip.write_all(&payload).unwrap();
        let gzip = gzip.finish().unwrap();
        assert_eq!(save_format(&gzip), SaveFormat::Gzip);
        assert_eq!(unpack(gzip).unwrap(), payload);
    }

    #[test]
    fn a_container_from_a_newer_build_or_cut_short_is_refused() {
        let mut newer = SAVE_MAGIC.to_vec();
        newer.extend([2, CODEC_RAW]);
        assert!(unpack(newer).is_err());
        let mut codec = SAVE_MAGIC.to_vec();
        codec.extend([CONTAINER_VERSION, 9]);
        assert!(unpack(codec).is_err());
        assert!(unpack(SAVE_MAGIC.to_vec()).is_err());
        let mut broken = pack(b"a world").unwrap();
        broken.truncate(12);
        assert!(unpack(broken).is_err());
    }
}
