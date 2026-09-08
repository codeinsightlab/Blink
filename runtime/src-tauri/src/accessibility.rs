//! macOS Accessibility permission guidance.

#[cfg(target_os = "macos")]
use std::process::Command;

#[cfg(target_os = "macos")]
pub fn granted() -> bool {
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
    }
    unsafe { AXIsProcessTrusted() }
}

#[cfg(not(target_os = "macos"))]
pub fn granted() -> bool {
    true
}

#[cfg(target_os = "macos")]
pub fn open_settings() -> Result<(), String> {
    Command::new("/usr/bin/open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .status()
        .map_err(|error| format!("无法打开 macOS 辅助功能设置：{error}"))
        .and_then(|status| {
            status
                .success()
                .then_some(())
                .ok_or_else(|| format!("打开 macOS 辅助功能设置失败：{status}"))
        })
}

#[cfg(not(target_os = "macos"))]
pub fn open_settings() -> Result<(), String> {
    Ok(())
}
