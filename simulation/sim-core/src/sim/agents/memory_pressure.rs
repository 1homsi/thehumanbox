#[repr(u8)]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum MemoryPressure {
    Normal = 0,
    Elevated = 1,
    Critical = 2,
}
