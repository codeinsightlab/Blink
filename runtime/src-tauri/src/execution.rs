use crate::profile::Execution;
use std::process::Command;

pub fn dispatch(execution: &Execution) -> Result<(), String> {
    match execution {
        Execution::LaunchApp { executable_names, bundle_ids, app_names, known_paths, aliases } => launch_app(executable_names, bundle_ids, app_names, known_paths, aliases),
        Execution::SendHotkey { keys } => send_hotkey(keys),
    }
}

#[cfg(target_os = "macos")]
fn launch_app(_: &[String], bundle_ids: &[String], app_names: &[String], known_paths: &[String], _: &[String]) -> Result<(), String> {
    for bundle_id in bundle_ids { if Command::new("open").args(["-b", bundle_id]).status().is_ok_and(|status| status.success()) { return Ok(()); } }
    for app_name in app_names { if Command::new("open").args(["-a", app_name]).status().is_ok_and(|status| status.success()) { return Ok(()); } }
    for path in known_paths { if Command::new("open").arg(path).status().is_ok_and(|status| status.success()) { return Ok(()); } }
    Err("未能通过 bundleIds、appNames 或 knownPaths 启动应用".into())
}

#[cfg(target_os = "windows")]
fn launch_app(executable_names: &[String], _: &[String], _: &[String], known_paths: &[String], aliases: &[String]) -> Result<(), String> {
    for candidate in executable_names.iter().chain(aliases) {
        if Command::new("cmd").args(["/C", "start", "", candidate]).status().is_ok_and(|status| status.success()) { return Ok(()); }
    }
    for path in known_paths { if Command::new("cmd").args(["/C", "start", "", path]).status().is_ok_and(|status| status.success()) { return Ok(()); } }
    Err("未能通过 App Paths、PATH/alias 或 knownPaths 启动应用".into())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn launch_app(_: &[String], _: &[String], _: &[String], _: &[String], _: &[String]) -> Result<(), String> { Err("UNSUPPORTED_PLATFORM".into()) }

fn send_hotkey(keys: &[String]) -> Result<(), String> {
    if !automation_permission_granted() {
        return Err("缺少 macOS“辅助功能”权限：请授权当前正在运行的 KeyFlow Runtime 二进制后重试".into());
    }
    use enigo::{Direction, Enigo, Keyboard, Settings};
    let mut enigo = Enigo::new(&Settings::default()).map_err(|error| format!("SEND_HOTKEY 初始化失败：{error}"))?;
    let converted = keys.iter().map(|key| to_key(key)).collect::<Result<Vec<_>, _>>()?;
    for key in &converted { enigo.key(*key, Direction::Press).map_err(|error| format!("SEND_HOTKEY 按下失败：{error}"))?; }
    for key in converted.iter().rev() { enigo.key(*key, Direction::Release).map_err(|error| format!("SEND_HOTKEY 释放失败：{error}"))?; }
    Ok(())
}

#[cfg(target_os = "macos")]
fn automation_permission_granted() -> bool {
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
    }

    unsafe { AXIsProcessTrusted() }
}

#[cfg(not(target_os = "macos"))]
fn automation_permission_granted() -> bool { true }

fn to_key(value: &str) -> Result<enigo::Key, String> {
    use enigo::Key;
    match value {
        "CTRL" => Ok(Key::Control), "META" => Ok(Key::Meta), "ALT" => Ok(Key::Alt), "SHIFT" => Ok(Key::Shift),
        "ENTER" => Ok(Key::Return), "ESCAPE" => Ok(Key::Escape), "TAB" => Ok(Key::Tab), "SPACE" => Ok(Key::Space), "BACKSPACE" => Ok(Key::Backspace), "DELETE" => Ok(Key::Delete),
        "UP" => Ok(Key::UpArrow), "DOWN" => Ok(Key::DownArrow), "LEFT" => Ok(Key::LeftArrow), "RIGHT" => Ok(Key::RightArrow),
        key if key.len() == 1 => Ok(Key::Unicode(key.chars().next().unwrap().to_ascii_lowercase())),
        "F1" => Ok(Key::F1), "F2" => Ok(Key::F2), "F3" => Ok(Key::F3), "F4" => Ok(Key::F4), "F5" => Ok(Key::F5), "F6" => Ok(Key::F6),
        "F7" => Ok(Key::F7), "F8" => Ok(Key::F8), "F9" => Ok(Key::F9), "F10" => Ok(Key::F10), "F11" => Ok(Key::F11), "F12" => Ok(Key::F12),
        key => Err(format!("不支持的快捷键：{key}")),
    }
}

#[cfg(test)]
mod tests {
    use super::to_key;
    use enigo::Key;

    #[test]
    fn maps_contract_macos_copy_hotkey() {
        assert!(matches!(to_key("META"), Ok(Key::Meta)));
        assert!(matches!(to_key("C"), Ok(Key::Unicode('c'))));
    }
}
