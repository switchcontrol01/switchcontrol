use serde::Serialize;
use std::env;
use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use std::time::Instant;
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::ProcessStatus::{GetProcessMemoryInfo, K32EmptyWorkingSet, PROCESS_MEMORY_COUNTERS};
use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_SET_QUOTA};

#[derive(Serialize)]
struct TrimmedProcess {
    name: String,
    pid: u32,
    mb_freed: f64,
}

#[derive(Serialize)]
struct CleanResult {
    mode: String,
    processes_scanned: u32,
    processes_trimmed: u32,
    estimated_mb_freed: f64,
    top_trimmed: Vec<TrimmedProcess>,
    execution_ms: u64,
    errors_count: u32,
}

const DENYLIST: &[&str] = &[
    "system",
    "csrss.exe",
    "winlogon.exe",
    "services.exe",
    "lsass.exe",
    "dwm.exe",
    "audiodg.exe",
    "nvcontainer.exe",
    "amdow.exe",
    "easyanticheat.exe",
    "battleye.exe",
    "vgc.exe",
    "vgtray.exe",
    "epicgameslauncher.exe",
    "smss.exe",
    "wininit.exe",
    "svchost.exe",
    "registry",
    "memory compression",
    "secure system",
    "fontdrvhost.exe",
    "lsaiso.exe",
];

fn is_denied(name: &str) -> bool {
    let lower = name.to_lowercase();
    if DENYLIST.iter().any(|&d| lower == d) {
        return true;
    }
    if lower.contains("anti-cheat") || lower.contains("anticheat") {
        return true;
    }
    false
}

fn get_process_name(entry: &PROCESSENTRY32W) -> String {
    let len = entry
        .szExeFile
        .iter()
        .position(|&c| c == 0)
        .unwrap_or(entry.szExeFile.len());
    OsString::from_wide(&entry.szExeFile[..len])
        .to_string_lossy()
        .to_string()
}

fn get_working_set_mb(handle: HANDLE) -> Option<f64> {
    let mut counters = PROCESS_MEMORY_COUNTERS::default();
    counters.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
    unsafe {
        if GetProcessMemoryInfo(handle, &mut counters, counters.cb).is_ok() {
            Some(counters.WorkingSetSize as f64 / (1024.0 * 1024.0))
        } else {
            None
        }
    }
}

fn main() {
    std::panic::set_hook(Box::new(|info| {
        let msg = format!("{{\"error\":true,\"message\":\"panic: {}\"}}", info);
        eprintln!("{}", msg);
    }));

    let args: Vec<String> = env::args().collect();
    let mode = if args.len() >= 3 && args[1] == "--mode" {
        args[2].clone()
    } else {
        "safe".to_string()
    };

    let threshold_mb: f64 = match mode.as_str() {
        "safe" => 200.0,
        "smart" => 100.0,
        _ => 0.0, // advanced: trim all eligible (most aggressive)
    };

    let start = Instant::now();
    let mut scanned: u32 = 0;
    let mut trimmed: u32 = 0;
    let mut total_freed: f64 = 0.0;
    let mut errors: u32 = 0;
    let mut top: Vec<TrimmedProcess> = Vec::new();

    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    let snapshot = match snapshot {
        Ok(h) => h,
        Err(_) => {
            let result = CleanResult {
                mode,
                processes_scanned: 0,
                processes_trimmed: 0,
                estimated_mb_freed: 0.0,
                top_trimmed: vec![],
                execution_ms: start.elapsed().as_millis() as u64,
                errors_count: 1,
            };
            println!("{}", serde_json::to_string(&result).unwrap());
            return;
        }
    };

    let mut entry = PROCESSENTRY32W::default();
    entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

    let mut has_entry = unsafe { Process32FirstW(snapshot, &mut entry).is_ok() };

    while has_entry {
        let pid = entry.th32ProcessID;
        let name = get_process_name(&entry);

        scanned += 1;

        if pid < 100 || is_denied(&name) {
            has_entry = unsafe { Process32NextW(snapshot, &mut entry).is_ok() };
            continue;
        }

        let access = PROCESS_QUERY_INFORMATION | PROCESS_SET_QUOTA;
        match unsafe { OpenProcess(access, false, pid) } {
            Ok(handle) => {
                let before = get_working_set_mb(handle).unwrap_or(0.0);

                if before < threshold_mb {
                    unsafe { let _ = CloseHandle(handle); }
                    has_entry = unsafe { Process32NextW(snapshot, &mut entry).is_ok() };
                    continue;
                }

                let trim_ok = unsafe { K32EmptyWorkingSet(handle).as_bool() };

                if trim_ok {
                    let after = get_working_set_mb(handle).unwrap_or(before);
                    let freed = (before - after).max(0.0);

                    if freed > 0.1 {
                        trimmed += 1;
                        total_freed += freed;

                        top.push(TrimmedProcess {
                            name: name.clone(),
                            pid,
                            mb_freed: (freed * 10.0).round() / 10.0,
                        });
                    }
                } else {
                    errors += 1;
                }

                unsafe { let _ = CloseHandle(handle); }
            }
            Err(_) => {
                errors += 1;
            }
        }

        has_entry = unsafe { Process32NextW(snapshot, &mut entry).is_ok() };
    }

    unsafe { let _ = CloseHandle(snapshot); }

    // Sort top by freed descending, keep top 5
    top.sort_by(|a, b| b.mb_freed.partial_cmp(&a.mb_freed).unwrap_or(std::cmp::Ordering::Equal));
    top.truncate(5);

    let result = CleanResult {
        mode,
        processes_scanned: scanned,
        processes_trimmed: trimmed,
        estimated_mb_freed: (total_freed * 10.0).round() / 10.0,
        top_trimmed: top,
        execution_ms: start.elapsed().as_millis() as u64,
        errors_count: errors,
    };

    println!("{}", serde_json::to_string(&result).unwrap());
}
