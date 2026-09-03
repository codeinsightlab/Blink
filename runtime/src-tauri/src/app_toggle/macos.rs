use super::*;
use objc2::rc::{autoreleasepool, Retained};
use objc2_app_kit::{
    NSApplicationActivationOptions, NSApplicationActivationPolicy, NSRunningApplication,
    NSWorkspace,
};
use objc2_foundation::{NSBundle, NSString};
use std::{
    ffi::c_void,
    process::Command,
    thread,
    time::{Duration, Instant},
};

type CF = *const c_void;
#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
    fn AXUIElementCreateApplication(pid: i32) -> CF;
    fn AXUIElementCopyAttributeValue(element: CF, attribute: CF, value: *mut CF) -> i32;
    fn AXUIElementSetAttributeValue(element: CF, attribute: CF, value: CF) -> i32;
    fn AXUIElementSetMessagingTimeout(element: CF, timeout: f32) -> i32;
}
#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFRelease(value: CF);
    fn CFGetTypeID(value: CF) -> usize;
    fn CFArrayGetTypeID() -> usize;
    fn CFBooleanGetTypeID() -> usize;
    fn CFArrayGetCount(value: CF) -> isize;
    fn CFArrayGetValueAtIndex(value: CF, index: isize) -> CF;
    fn CFBooleanGetValue(value: CF) -> bool;
    fn CFDictionaryGetValue(value: CF, key: CF) -> CF;
    fn CFNumberGetValue(value: CF, kind: isize, result: *mut i64) -> bool;
    static kCFBooleanFalse: CF;
}
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGWindowListCopyWindowInfo(options: u32, relative: u32) -> CF;
}
// A positive on-screen window fact allows basic Hide even without AX permission.
// Window titles are neither requested nor used as identity.
fn has_visible_window(pid: i32) -> bool {
    let list = Owned(unsafe { CGWindowListCopyWindowInfo(1 | 16, 0) });
    if list.0.is_null() {
        return false;
    }
    let owner = NSString::from_str("kCGWindowOwnerPID");
    let layer = NSString::from_str("kCGWindowLayer");
    for index in 0..unsafe { CFArrayGetCount(list.0) } {
        let entry = unsafe { CFArrayGetValueAtIndex(list.0, index) };
        let read = |key: &NSString| -> Option<i64> {
            let value = unsafe { CFDictionaryGetValue(entry, (key as *const NSString).cast()) };
            if value.is_null() {
                return None;
            }
            let mut number = 0i64;
            if unsafe { CFNumberGetValue(value, 4, &mut number) } {
                Some(number)
            } else {
                None
            }
        };
        if read(&owner) == Some(pid as i64) && read(&layer) == Some(0) {
            return true;
        }
    }
    false
}
struct Owned(CF);
impl Drop for Owned {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { CFRelease(self.0) }
        }
    }
}
fn copy(element: CF, name: &str) -> Result<Owned, String> {
    let attr = NSString::from_str(name);
    let mut value = std::ptr::null();
    let status = unsafe {
        AXUIElementCopyAttributeValue(element, Retained::as_ptr(&attr).cast(), &mut value)
    };
    if status != 0 || value.is_null() {
        return Err(format!("AX {name}: {status}"));
    }
    Ok(Owned(value))
}
// Only window minimization uses AX. Unknown values never become a false/non-minimized value.
fn windows(pid: i32, restore: bool) -> Result<(usize, usize), String> {
    if !unsafe { AXIsProcessTrusted() } {
        return Err("PermissionDenied".into());
    }
    let app = Owned(unsafe { AXUIElementCreateApplication(pid) });
    if app.0.is_null() {
        return Err("AX application unavailable".into());
    }
    unsafe {
        AXUIElementSetMessagingTimeout(app.0, 0.2);
    }
    let list = copy(app.0, "AXWindows")?;
    if unsafe { CFGetTypeID(list.0) != CFArrayGetTypeID() } {
        return Err("AXWindows not array".into());
    }
    let mut usable = 0;
    let mut minimized = 0;
    for index in 0..unsafe { CFArrayGetCount(list.0) } {
        let window = unsafe { CFArrayGetValueAtIndex(list.0, index) };
        let value = copy(window, "AXMinimized")?;
        if unsafe { CFGetTypeID(value.0) != CFBooleanGetTypeID() } {
            return Err("AXMinimized not boolean".into());
        }
        if unsafe { CFBooleanGetValue(value.0) } {
            minimized += 1;
            if restore {
                let attr = NSString::from_str("AXMinimized");
                let status = unsafe {
                    AXUIElementSetAttributeValue(
                        window,
                        Retained::as_ptr(&attr).cast(),
                        kCFBooleanFalse,
                    )
                };
                if status != 0 {
                    return Err(format!("AX restore failed: {status}"));
                }
            }
        } else {
            usable += 1;
        }
    }
    Ok((usable, minimized))
}
fn normalize(hidden: bool, active: bool, windows: Result<(usize, usize), String>) -> AppState {
    if hidden {
        return AppState::Hidden;
    }
    match windows {
        Ok((0, n)) if n > 0 => AppState::Minimized,
        Ok((n, _)) if n > 0 => {
            if active {
                AppState::Foreground
            } else {
                AppState::Background
            }
        }
        // No windows or no permission: cannot safely distinguish a minimized foreground app.
        _ => AppState::Unknown,
    }
}
struct MacDesktopAppController;
impl MacDesktopAppController {
    fn resolve(ids: &[String], paths: &[String]) -> Result<AppTarget, AppControlError> {
        if ids.len() > 1 || paths.len() > 1 {
            return Err(AppControlError::InvalidTarget);
        }
        let mut id = ids.first().cloned();
        let path = paths.first().cloned();
        if let Some(path) = &path {
            if !path.starts_with('/') || !path.to_lowercase().ends_with(".app") {
                return Err(AppControlError::InvalidTarget);
            }
            let bundle_id = NSBundle::bundleWithPath(&NSString::from_str(path))
                .and_then(|b| b.bundleIdentifier())
                .map(|s| s.to_string());
            let resolved = bundle_id.ok_or(AppControlError::TargetNotFound)?;
            if id.as_ref().is_some_and(|id| id != &resolved) {
                return Err(AppControlError::InvalidTarget);
            }
            id = Some(resolved);
        }
        let id = id
            .filter(|s| !s.is_empty())
            .ok_or(AppControlError::InvalidTarget)?;
        if path.is_none()
            && NSWorkspace::sharedWorkspace()
                .URLForApplicationWithBundleIdentifier(&NSString::from_str(&id))
                .is_none()
            && Self::running(&id)?.is_none()
        {
            return Err(AppControlError::TargetNotFound);
        }
        Ok(AppTarget {
            bundle_id: id,
            path,
        })
    }
    fn wait_hidden(id: &str, hidden: bool) -> bool {
        let deadline = Instant::now() + Duration::from_millis(700);
        loop {
            if Self::running(id)
                .ok()
                .flatten()
                .is_some_and(|app| app.isHidden() == hidden)
            {
                return true;
            }
            if Instant::now() >= deadline {
                return false;
            }
            thread::sleep(Duration::from_millis(50));
        }
    }
    fn running(id: &str) -> Result<Option<Retained<NSRunningApplication>>, AppControlError> {
        let apps =
            NSRunningApplication::runningApplicationsWithBundleIdentifier(&NSString::from_str(id));
        if apps.len() > 1 {
            return Err(AppControlError::Unsupported);
        }
        Ok(apps.firstObject())
    }
}
impl DesktopAppController for MacDesktopAppController {
    fn query_state(&self, target: &AppTarget) -> Result<AppState, AppControlError> {
        let Some(app) = Self::running(&target.bundle_id)? else {
            return Ok(AppState::NotRunning);
        };
        if app.activationPolicy() != NSApplicationActivationPolicy::Regular {
            return Err(AppControlError::Unsupported);
        }
        let pid = app.processIdentifier();
        if pid <= 0 {
            return Ok(AppState::Unknown);
        }
        let window_state = windows(pid, false).or_else(|error| {
            eprintln!("toggle_app ax_query_degraded={error}");
            if has_visible_window(pid) {
                Ok((1, 0))
            } else {
                Err(error)
            }
        });
        let state = normalize(app.isHidden(), app.isActive(), window_state);
        Ok(state)
    }
    fn launch(&self, target: &AppTarget) -> Result<(), AppControlError> {
        let mut command = Command::new("/usr/bin/open");
        // The path was identity-checked; prefer the selected installation when supplied.
        if let Some(path) = &target.path {
            command.arg("--").arg(path);
        } else {
            command.arg("-b").arg(&target.bundle_id);
        }
        let output = command
            .output()
            .map_err(|e| AppControlError::LaunchFailed(e.to_string()))?;
        if output.status.success() {
            Ok(())
        } else {
            Err(AppControlError::LaunchFailed(
                String::from_utf8_lossy(&output.stderr).into(),
            ))
        }
    }
    fn reveal(&self, target: &AppTarget) -> Result<(), AppControlError> {
        let deadline = Instant::now() + Duration::from_millis(1500);
        let app = loop {
            if let Some(app) = Self::running(&target.bundle_id)? {
                if app.isFinishedLaunching() {
                    break app;
                }
            }
            if Instant::now() >= deadline {
                return Err(AppControlError::RevealFailed(
                    "launch pending; poll timed out".into(),
                ));
            }
            thread::sleep(Duration::from_millis(75));
        };
        if app.activationPolicy() != NSApplicationActivationPolicy::Regular {
            return Err(AppControlError::Unsupported);
        }
        let unhide_accepted = !app.isHidden() || app.unhide();
        match windows(app.processIdentifier(), true) {
            Ok((_, count)) => eprintln!("toggle_app ax_restore_requests={count}"),
            Err(error) => eprintln!("toggle_app ax_restore_degraded={error}"),
        }
        #[allow(deprecated)]
        let activated =
            app.activateWithOptions(NSApplicationActivationOptions::ActivateIgnoringOtherApps);
        let unhidden = Self::wait_hidden(&target.bundle_id, false);
        eprintln!("toggle_app unhide_accepted={unhide_accepted} observed_unhidden={unhidden} activation_accepted={activated}");
        if activated && unhidden {
            Ok(())
        } else {
            Err(AppControlError::RevealFailed(format!(
                "unhidden={unhidden} activation_accepted={activated}"
            )))
        }
    }
    fn conceal(&self, target: &AppTarget) -> Result<(), AppControlError> {
        // Recheck immediately before hide: state may have changed since the service query.
        if self.query_state(target)? != AppState::Foreground {
            return self.reveal(target);
        }
        let app = Self::running(&target.bundle_id)?.ok_or(AppControlError::TargetNotFound)?;
        let accepted = app.hide();
        let observed_hidden = Self::wait_hidden(&target.bundle_id, true);
        eprintln!("toggle_app hide_accepted={accepted} observed_hidden={observed_hidden}");
        if observed_hidden {
            Ok(())
        } else {
            Err(AppControlError::ConcealFailed)
        }
    }
}
pub fn toggle(ids: &[String], paths: &[String]) -> Result<(), AppControlError> {
    autoreleasepool(|_| {
        eprintln!(
            "toggle_app ax_permission={} platform=macos",
            if unsafe { AXIsProcessTrusted() } {
                "granted"
            } else {
                "denied"
            }
        );
        let target = MacDesktopAppController::resolve(ids, paths)?;
        AppToggleService::toggle(&MacDesktopAppController, &target)
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "Launches an isolated test app; requires BLINK_TOGGLE_TEST_APP"]
    fn native_fixture_launch_and_identity() {
        let path = std::env::var("BLINK_TOGGLE_TEST_APP").expect("fixture .app path");
        autoreleasepool(|_| {
            let target = MacDesktopAppController::resolve(&[], &[path]).unwrap();
            assert_eq!(target.bundle_id, "dev.blink.toggle-fixture");
            let controller = MacDesktopAppController;
            assert_eq!(
                controller.query_state(&target).unwrap(),
                AppState::NotRunning
            );
            AppToggleService::toggle(&controller, &target).unwrap();
            assert!(MacDesktopAppController::running(&target.bundle_id)
                .unwrap()
                .is_some());
            eprintln!(
                "NATIVE_FIXTURE launch accepted; AX permission={}; visible_window={}",
                unsafe { AXIsProcessTrusted() },
                has_visible_window(
                    MacDesktopAppController::running(&target.bundle_id)
                        .unwrap()
                        .unwrap()
                        .processIdentifier()
                )
            );
            fn wait_for(
                controller: &MacDesktopAppController,
                target: &AppTarget,
                expected: AppState,
            ) {
                let deadline = Instant::now() + Duration::from_secs(3);
                loop {
                    let actual = controller.query_state(target).unwrap();
                    if actual == expected {
                        return;
                    }
                    assert!(
                        Instant::now() < deadline,
                        "expected {expected:?}, got {actual:?}"
                    );
                    thread::sleep(Duration::from_millis(100));
                }
            }
            wait_for(&controller, &target, AppState::Foreground);
            AppToggleService::toggle(&controller, &target).unwrap();
            wait_for(&controller, &target, AppState::Hidden);
            AppToggleService::toggle(&controller, &target).unwrap();
            wait_for(&controller, &target, AppState::Foreground);
            std::fs::write("/tmp/blink-toggle-fixture-command", "minimize").unwrap();
            wait_for(&controller, &target, AppState::Minimized);
            AppToggleService::toggle(&controller, &target).unwrap();
            wait_for(&controller, &target, AppState::Foreground);
            std::fs::write("/tmp/blink-toggle-fixture-command", "partial").unwrap();
            thread::sleep(Duration::from_millis(400));
            assert_eq!(
                controller.query_state(&target).unwrap(),
                AppState::Foreground
            );
            std::fs::write("/tmp/blink-toggle-fixture-command", "hide").unwrap();
            wait_for(&controller, &target, AppState::Hidden);
            // A fresh controller has no remembered state.
            AppToggleService::toggle(&MacDesktopAppController, &target).unwrap();
            wait_for(&controller, &target, AppState::Foreground);
            eprintln!("NATIVE_FIXTURE foreground/hide/reveal/all-minimized/partial-minimized/external-hide passed");
            // API facts only; not a physical Binding or visual effect assertion.
            assert!(MacDesktopAppController::resolve(
                &["invalid.other".into()],
                &[target.path.clone().unwrap()]
            )
            .is_err());
        });
    }
    #[test]
    fn mixed_windows_and_missing_permission_are_conservative() {
        assert_eq!(normalize(false, true, Ok((1, 1))), AppState::Foreground);
        assert_eq!(normalize(false, false, Ok((1, 1))), AppState::Background);
        assert_eq!(normalize(false, true, Ok((0, 1))), AppState::Minimized);
        assert_eq!(
            normalize(false, true, Err("PermissionDenied".into())),
            AppState::Unknown
        );
        assert_eq!(
            normalize(true, true, Err("PermissionDenied".into())),
            AppState::Hidden
        );
        assert_eq!(normalize(false, true, Ok((0, 0))), AppState::Unknown);
    }
}
