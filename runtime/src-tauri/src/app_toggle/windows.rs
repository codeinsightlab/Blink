//! Windows V1 implementation: a target is one selected executable, identified
//! by its canonical image path.  It never falls back to a title or app alias.
use super::windows_logic::{is_candidate, launch_poll_pending, WindowFacts};
use super::*;
use std::{
    collections::HashSet,
    ffi::c_void,
    path::Path,
    process::Command,
    thread,
    time::{Duration, Instant},
};

type Handle = *mut c_void;
type Hwnd = *mut c_void;
type Bool = i32;
const TH32CS_SNAPPROCESS: u32 = 0x0000_0002;
const INVALID_HANDLE_VALUE: Handle = -1isize as Handle;
const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
const ERROR_ACCESS_DENIED: u32 = 5;
const ERROR_NO_MORE_FILES: u32 = 18;
const GWL_STYLE: i32 = -16;
const GWL_EXSTYLE: i32 = -20;
const WS_CHILD: isize = 0x4000_0000;
const WS_EX_TOOLWINDOW: isize = 0x0000_0080;
const WS_EX_APPWINDOW: isize = 0x0004_0000;
const DWMWA_CLOAKED: u32 = 14;
const SW_SHOW: i32 = 5;
const SW_MINIMIZE: i32 = 6;
const SW_RESTORE: i32 = 9;
const GA_ROOTOWNER: u32 = 3;

#[repr(C)]
struct ProcessEntry32W {
    dw_size: u32,
    cnt_usage: u32,
    th32_process_id: u32,
    th32_default_heap_id: usize,
    th32_module_id: u32,
    cnt_threads: u32,
    th32_parent_process_id: u32,
    pc_pri_class_base: i32,
    dw_flags: u32,
    sz_exe_file: [u16; 260],
}
extern "system" {
    fn CreateToolhelp32Snapshot(flags: u32, pid: u32) -> Handle;
    fn Process32FirstW(snapshot: Handle, entry: *mut ProcessEntry32W) -> Bool;
    fn Process32NextW(snapshot: Handle, entry: *mut ProcessEntry32W) -> Bool;
    fn OpenProcess(access: u32, inherit: Bool, pid: u32) -> Handle;
    fn QueryFullProcessImageNameW(
        process: Handle,
        flags: u32,
        name: *mut u16,
        size: *mut u32,
    ) -> Bool;
    fn CloseHandle(handle: Handle) -> Bool;
    fn GetLastError() -> u32;
    fn EnumWindows(callback: unsafe extern "system" fn(Hwnd, isize) -> Bool, param: isize) -> Bool;
    fn GetWindowLongPtrW(hwnd: Hwnd, index: i32) -> isize;
    fn GetWindowThreadProcessId(hwnd: Hwnd, pid: *mut u32) -> u32;
    fn IsWindowVisible(hwnd: Hwnd) -> Bool;
    fn IsIconic(hwnd: Hwnd) -> Bool;
    fn GetForegroundWindow() -> Hwnd;
    fn GetAncestor(hwnd: Hwnd, flags: u32) -> Hwnd;
    fn SetForegroundWindow(hwnd: Hwnd) -> Bool;
    fn ShowWindowAsync(hwnd: Hwnd, command: i32) -> Bool;
}
#[link(name = "dwmapi")]
extern "system" {
    fn DwmGetWindowAttribute(hwnd: Hwnd, attribute: u32, value: *mut c_void, size: u32) -> i32;
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy()
        .replace('/', "\\")
        .trim_start_matches("\\\\?\\")
        .to_ascii_lowercase()
}
fn selected_path(paths: &[String]) -> Result<String, AppControlError> {
    if paths.len() != 1 {
        return Err(AppControlError::InvalidTarget);
    }
    let input = Path::new(&paths[0]);
    let normalized = normalize_path(input);
    if !normalized.ends_with(".exe") {
        return Err(AppControlError::InvalidTarget);
    }
    if normalized.contains("\\program files\\windowsapps\\")
        || normalized.contains("\\appdata\\local\\microsoft\\windowsapps\\")
    {
        return Err(AppControlError::UnsupportedTarget {
            reason: "packaged or App Execution Alias target",
        });
    }
    std::fs::canonicalize(input)
        .map(|path| normalize_path(&path))
        .map_err(|_| AppControlError::TargetNotFound)
}
fn process_image(pid: u32) -> Result<String, AppControlError> {
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if process.is_null() {
        let code = unsafe { GetLastError() };
        return Err(if code == ERROR_ACCESS_DENIED {
            AppControlError::PermissionDenied {
                operation: "OpenProcess",
                win32_error: code,
            }
        } else {
            AppControlError::StateQueryFailed {
                operation: "OpenProcess",
                win32_error: code,
            }
        });
    }
    let mut buffer = vec![0u16; 32768];
    let mut size = buffer.len() as u32;
    let ok = unsafe { QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut size) };
    unsafe {
        CloseHandle(process);
    }
    if ok == 0 {
        let code = unsafe { GetLastError() };
        return Err(if code == ERROR_ACCESS_DENIED {
            AppControlError::PermissionDenied {
                operation: "QueryFullProcessImageNameW",
                win32_error: code,
            }
        } else {
            AppControlError::StateQueryFailed {
                operation: "QueryFullProcessImageNameW",
                win32_error: code,
            }
        });
    }
    Ok(String::from_utf16_lossy(&buffer[..size as usize])
        .replace('/', "\\")
        .to_ascii_lowercase())
}

fn snapshot_executable_name(entry: &ProcessEntry32W) -> String {
    let length = entry
        .sz_exe_file
        .iter()
        .position(|value| *value == 0)
        .unwrap_or(entry.sz_exe_file.len());
    String::from_utf16_lossy(&entry.sz_exe_file[..length]).to_ascii_lowercase()
}

fn matching_pids(target: &str) -> Result<HashSet<u32>, AppControlError> {
    let target_name = Path::new(target)
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or(AppControlError::InvalidTarget)?;
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return Err(AppControlError::StateQueryFailed {
            operation: "CreateToolhelp32Snapshot",
            win32_error: unsafe { GetLastError() },
        });
    }
    let mut entry: ProcessEntry32W = unsafe { std::mem::zeroed() };
    entry.dw_size = std::mem::size_of::<ProcessEntry32W>() as u32;
    let mut matched = HashSet::new();
    let mut ok = unsafe { Process32FirstW(snapshot, &mut entry) };
    while ok != 0 {
        // Toolhelp snapshots include unrelated and protected processes. Their
        // basename cannot equal the selected executable, so they are not identity
        // candidates and are never opened. PID 0 in particular always makes
        // OpenProcess fail with ERROR_INVALID_PARAMETER.
        if entry.th32_process_id == 0 || snapshot_executable_name(&entry) != target_name {
            entry.dw_size = std::mem::size_of::<ProcessEntry32W>() as u32;
            ok = unsafe { Process32NextW(snapshot, &mut entry) };
            continue;
        }
        match process_image(entry.th32_process_id) {
            Ok(path) if path == target => {
                matched.insert(entry.th32_process_id);
            }
            Ok(_) => {}
            Err(error) if matched.is_empty() => {
                unsafe {
                    CloseHandle(snapshot);
                }
                return Err(error);
            }
            Err(error) => eprintln!(
                "toggle_app windows_scan_degraded pid={} error={error:?}",
                entry.th32_process_id
            ),
        }
        entry.dw_size = std::mem::size_of::<ProcessEntry32W>() as u32;
        ok = unsafe { Process32NextW(snapshot, &mut entry) };
    }
    let code = unsafe { GetLastError() };
    unsafe {
        CloseHandle(snapshot);
    }
    if code != ERROR_NO_MORE_FILES {
        return Err(AppControlError::StateQueryFailed {
            operation: "Process32NextW",
            win32_error: code,
        });
    }
    Ok(matched)
}
#[derive(Clone, Copy)]
struct Candidate {
    hwnd: Hwnd,
    iconic: bool,
}
struct Enumerate<'a> {
    pids: &'a HashSet<u32>,
    candidates: Vec<Candidate>,
    error: Option<AppControlError>,
}
unsafe extern "system" fn enum_window(hwnd: Hwnd, param: isize) -> Bool {
    let context = &mut *(param as *mut Enumerate<'_>);
    let mut pid = 0;
    GetWindowThreadProcessId(hwnd, &mut pid);
    let mut cloaked = 0u32;
    if DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, (&mut cloaked as *mut u32).cast(), 4) != 0 {
        context.error = Some(AppControlError::StateQueryFailed {
            operation: "DwmGetWindowAttribute",
            win32_error: GetLastError(),
        });
        return 0;
    }
    let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
    let exstyle = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    let facts = WindowFacts {
        top_level: style & WS_CHILD == 0,
        pid_matches: context.pids.contains(&pid),
        cloaked: cloaked != 0,
        tool_window: exstyle & WS_EX_TOOLWINDOW != 0,
        app_window: exstyle & WS_EX_APPWINDOW != 0,
        visible: IsWindowVisible(hwnd) != 0,
        iconic: IsIconic(hwnd) != 0,
    };
    if is_candidate(facts) {
        context.candidates.push(Candidate {
            hwnd,
            iconic: facts.iconic,
        });
    }
    1
}
fn candidates(pids: &HashSet<u32>) -> Result<Vec<Candidate>, AppControlError> {
    let mut context = Enumerate {
        pids,
        candidates: vec![],
        error: None,
    };
    if unsafe { EnumWindows(enum_window, (&mut context as *mut Enumerate<'_>) as isize) } == 0 {
        if let Some(error) = context.error {
            return Err(error);
        }
        return Err(AppControlError::StateQueryFailed {
            operation: "EnumWindows",
            win32_error: unsafe { GetLastError() },
        });
    }
    Ok(context.candidates)
}
fn one_window(target: &str) -> Result<Candidate, AppControlError> {
    let pids = matching_pids(target)?;
    let windows = candidates(&pids)?;
    match windows.as_slice() {
        [window] => Ok(*window),
        [] => Err(AppControlError::RevealFailed(
            "no eligible top-level window".into(),
        )),
        windows => Err(AppControlError::AmbiguousWindows {
            count: windows.len(),
        }),
    }
}
struct WindowsDesktopAppController;
impl DesktopAppController for WindowsDesktopAppController {
    fn query_state(&self, target: &AppTarget) -> Result<AppState, AppControlError> {
        let path = target
            .path
            .as_deref()
            .ok_or(AppControlError::InvalidTarget)?;
        let pids = matching_pids(path)?;
        if pids.is_empty() {
            return Ok(AppState::NotRunning);
        }
        let windows = candidates(&pids)?;
        if windows.len() != 1 {
            return Ok(AppState::Unknown);
        }
        let window = windows[0];
        if window.iconic {
            return Ok(AppState::Minimized);
        }
        let foreground = unsafe { GetForegroundWindow() };
        Ok(if unsafe { GetAncestor(foreground, GA_ROOTOWNER) } == window.hwnd {
            AppState::Foreground
        } else {
            AppState::Background
        })
    }
    fn launch(&self, target: &AppTarget) -> Result<(), AppControlError> {
        Command::new(
            target
                .path
                .as_deref()
                .ok_or(AppControlError::InvalidTarget)?,
        )
        .spawn()
        .map(|_| ())
        .map_err(|e| AppControlError::LaunchFailed(e.to_string()))
    }
    fn reveal(&self, target: &AppTarget) -> Result<(), AppControlError> {
        let window = one_window(
            target
                .path
                .as_deref()
                .ok_or(AppControlError::InvalidTarget)?,
        )?;
        if window.iconic {
            unsafe {
                ShowWindowAsync(window.hwnd, SW_RESTORE);
            }
        }
        if unsafe { SetForegroundWindow(window.hwnd) } == 0 {
            return Err(AppControlError::FocusDenied);
        }
        Ok(())
    }
    fn conceal(&self, target: &AppTarget) -> Result<(), AppControlError> {
        let window = one_window(
            target
                .path
                .as_deref()
                .ok_or(AppControlError::InvalidTarget)?,
        )?;
        unsafe {
            ShowWindowAsync(window.hwnd, SW_MINIMIZE);
        }
        Ok(())
    }
}

fn wait_for_launch_window(
    controller: &WindowsDesktopAppController,
    target: &AppTarget,
) -> Result<(), AppControlError> {
    let deadline = Instant::now() + Duration::from_secs(3);
    while Instant::now() < deadline {
        thread::sleep(Duration::from_millis(75));
        match controller.query_state(target) {
            Ok(state) if launch_poll_pending(state) => continue,
            Ok(_) => return Ok(()),
            Err(
                error @ AppControlError::PermissionDenied { .. }
                | error @ AppControlError::StateQueryFailed { .. },
            ) => return Err(error),
            Err(error) => return Err(error),
        }
    }
    Err(AppControlError::RevealFailed(
        "launch window did not become ready before timeout".into(),
    ))
}

fn reveal_and_verify(
    controller: &WindowsDesktopAppController,
    target: &AppTarget,
) -> Result<(), AppControlError> {
    controller.reveal(target)?;
    let deadline = Instant::now() + Duration::from_millis(700);
    while Instant::now() < deadline {
        match controller.query_state(target) {
            Ok(AppState::Foreground) => return Ok(()),
            Ok(_) => thread::sleep(Duration::from_millis(50)),
            Err(
                error @ AppControlError::PermissionDenied { .. }
                | error @ AppControlError::StateQueryFailed { .. },
            ) => return Err(error),
            Err(error) => return Err(error),
        }
    }
    Err(AppControlError::FocusDenied)
}

pub(super) fn toggle(bundle_ids: &[String], paths: &[String]) -> Result<(), AppControlError> {
    if !bundle_ids.is_empty() {
        return Err(AppControlError::InvalidTarget);
    }
    let path = selected_path(paths)?;
    let target = AppTarget {
        bundle_id: String::new(),
        path: Some(path),
    };
    let controller = WindowsDesktopAppController;
    let initial = controller.query_state(&target)?;
    if initial == AppState::NotRunning {
        controller.launch(&target)?;
        wait_for_launch_window(&controller, &target)?;
        // Launch is never a Conceal operation, even if the launched app races
        // itself to the foreground before this final verification.
        return reveal_and_verify(&controller, &target);
    }
    AppToggleService::toggle(&controller, &target)
}
