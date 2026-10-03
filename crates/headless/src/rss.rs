/// Read process RSS in KB on Linux (returns 0 on other platforms or
/// if /proc isn't readable). Cheap — single fs read per call.
#[cfg(target_os = "linux")]
pub(super) fn read_self_rss_kb() -> u64 {
    let Ok(s) = std::fs::read_to_string("/proc/self/status") else {
        return 0;
    };
    for line in s.lines() {
        if let Some(rest) = line.strip_prefix("VmRSS:") {
            return rest
                .split_whitespace()
                .next()
                .and_then(|n| n.parse().ok())
                .unwrap_or(0);
        }
    }
    0
}
#[cfg(target_os = "macos")]
pub(super) fn read_self_rss_kb() -> u64 {
    #[repr(C)]
    struct MachTaskBasicInfo {
        virtual_size: u64,
        resident_size: u64,
        resident_size_max: u64,
        user_time: [i32; 2],
        system_time: [i32; 2],
        policy: i32,
        suspend_count: i32,
    }
    extern "C" {
        fn mach_task_self() -> u32;
        fn task_info(task: u32, flavor: u32, info: *mut MachTaskBasicInfo, count: *mut u32) -> i32;
    }
    const MACH_TASK_BASIC_INFO: u32 = 20;
    let mut info = MachTaskBasicInfo {
        virtual_size: 0,
        resident_size: 0,
        resident_size_max: 0,
        user_time: [0; 2],
        system_time: [0; 2],
        policy: 0,
        suspend_count: 0,
    };
    let mut count = (std::mem::size_of::<MachTaskBasicInfo>() / std::mem::size_of::<u32>()) as u32;
    let ok = unsafe { task_info(mach_task_self(), MACH_TASK_BASIC_INFO, &mut info, &mut count) };
    if ok == 0 {
        info.resident_size / 1024
    } else {
        0
    }
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
pub(super) fn read_self_rss_kb() -> u64 {
    0
}
