use crate::profile::Execution;
use std::process::Command;

pub fn dispatch(execution: &Execution) -> Result<(), String> {
    match execution {
        Execution::ToggleApp {
            bundle_ids,
            known_paths,
        } => crate::app_toggle::dispatch(bundle_ids, known_paths),
        Execution::LaunchApp {
            executable_names,
            bundle_ids,
            app_names,
            known_paths,
            aliases,
        } => launch_app(
            executable_names,
            bundle_ids,
            app_names,
            known_paths,
            aliases,
        ),
        Execution::SendHotkey { keys } => send_hotkey(keys),
        Execution::OpenUrl { url } => {
            if !crate::profile::valid_http_url(url) {
                return Err("INVALID_URL".into());
            }
            open_target(url)
        }
        Execution::OpenFile { path } => {
            if !std::path::Path::new(path).is_file() {
                return Err("FILE_NOT_FOUND".into());
            }
            // Script execution must be an explicit SCRIPT action, never file association.
            if executable_file(path) {
                return Err("请选择普通文档；脚本请使用运行脚本".into());
            }
            open_target(path)
        }
        Execution::OpenFolder { path } => {
            if !std::path::Path::new(path).is_dir() {
                return Err("FOLDER_NOT_FOUND".into());
            }
            open_target(path)
        }
        Execution::RunScript { path } => run_script(path),
    }
}

fn executable_file(path: &str) -> bool {
    let extension = std::path::Path::new(path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    matches!(
        extension.as_str(),
        "exe"
            | "com"
            | "bat"
            | "cmd"
            | "ps1"
            | "sh"
            | "command"
            | "js"
            | "vbs"
            | "msi"
            | "lnk"
            | "app"
    )
}

fn open_target(target: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let status = Command::new("/usr/bin/open").arg("--").arg(target).status();
    #[cfg(target_os = "windows")]
    let status = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Start-Process -FilePath $env:BLINK_OPEN_TARGET -ErrorAction Stop",
        ])
        .env("BLINK_OPEN_TARGET", target)
        .status();
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return Err("UNSUPPORTED_PLATFORM".into());
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    if status.map_err(|e| e.to_string())?.success() {
        Ok(())
    } else {
        Err("OPEN_TARGET_FAILED".into())
    }
}

fn run_script(path: &str) -> Result<(), String> {
    run_script_with_timeout(path, std::time::Duration::from_secs(30))
}

fn run_script_with_timeout(path: &str, timeout: std::time::Duration) -> Result<(), String> {
    if !std::path::Path::new(path).is_file() {
        return Err("SCRIPT_NOT_FOUND".into());
    }
    #[cfg(target_os = "macos")]
    let mut command = {
        if !path.starts_with('/') || !path.to_ascii_lowercase().ends_with(".sh") {
            return Err("UNSUPPORTED_SCRIPT".into());
        }
        let mut command = Command::new("/bin/sh");
        command.arg(path);
        command
    };
    #[cfg(target_os = "windows")]
    let mut command = {
        if !crate::profile::valid_target_path("windows", path)
            || !path.to_ascii_lowercase().ends_with(".ps1")
        {
            return Err("UNSUPPORTED_SCRIPT".into());
        }
        let mut command = Command::new("powershell.exe");
        // Wait for job assignment before the script can spawn any descendants.
        command.args(["-NoProfile", "-NonInteractive", "-Command", "$null = [Console]::In.ReadLine(); try { & $env:BLINK_SCRIPT_PATH; if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }; if (-not $?) { exit 1 } } catch { [Console]::Error.WriteLine($_); exit 1 }"]);
        command.env("BLINK_SCRIPT_PATH", path);
        command
    };
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return Err("UNSUPPORTED_PLATFORM".into());
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        use std::io::Read;
        #[cfg(target_os = "windows")]
        use std::io::Write;
        crate::script_process::prepare(&mut command);
        command
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped());
        let mut child = command
            .spawn()
            .map_err(|e| format!("SCRIPT_START_FAILED: {e}"))?;
        let tree = match crate::script_process::Tree::attach(&child) {
            Ok(tree) => tree,
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("SCRIPT_ISOLATION_FAILED: {error}"));
            }
        };
        #[cfg(target_os = "windows")]
        if let Some(mut input) = child.stdin.take() {
            if let Err(error) = input.write_all(b"\n") {
                let _ = tree.terminate();
                let _ = child.wait();
                return Err(error.to_string());
            }
        }
        #[cfg(not(target_os = "windows"))]
        drop(child.stdin.take());
        let mut stderr = child.stderr.take().ok_or("SCRIPT_STDERR_MISSING")?;
        // Drain continuously to avoid a full pipe blocking the child; retain only the tail.
        let output = std::sync::Arc::new(std::sync::Mutex::new(Vec::<u8>::new()));
        let captured = output.clone();
        let reader = std::thread::spawn(move || {
            let mut buffer = [0; 1024];
            while let Ok(count) = stderr.read(&mut buffer) {
                if count == 0 {
                    break;
                }
                let mut tail = captured.lock().unwrap();
                tail.extend_from_slice(&buffer[..count]);
                let excess = tail.len().saturating_sub(4096);
                tail.drain(..excess);
            }
        });
        let start = std::time::Instant::now();
        let result = loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    break if status.success() {
                        Ok(())
                    } else {
                        Err(format!("SCRIPT_FAILED: {status}"))
                    }
                }
                Err(error) => break Err(error.to_string()),
                _ => {}
            }
            if start.elapsed() > timeout {
                break Err(format!("SCRIPT_TIMEOUT: {}ms", timeout.as_millis()));
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        };
        let cleanup = tree.terminate();
        if cleanup.is_err() {
            let _ = child.kill();
        }
        let _ = child.wait();
        cleanup.map_err(|e| format!("SCRIPT_CLEANUP_FAILED: {e}"))?;
        // A reaped process tree closes stderr. Bound this wait even if a script deliberately escaped its group.
        let drain_start = std::time::Instant::now();
        while !reader.is_finished() && drain_start.elapsed() < std::time::Duration::from_millis(100)
        {
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        if reader.is_finished() {
            let _ = reader.join();
        }
        result.map_err(|error| {
            let tail = output.lock().unwrap();
            if tail.is_empty() {
                error
            } else {
                format!("{error}\n{}", String::from_utf8_lossy(&tail))
            }
        })
    }
}

#[cfg(target_os = "macos")]
pub(crate) fn open_app_macos(
    bundle_ids: &[String],
    app_names: &[String],
    known_paths: &[String],
) -> Result<(), String> {
    for bundle_id in bundle_ids {
        if Command::new("open")
            .args(["-b", bundle_id])
            .status()
            .is_ok_and(|status| status.success())
        {
            return Ok(());
        }
    }
    for app_name in app_names {
        if Command::new("open")
            .args(["-a", app_name])
            .status()
            .is_ok_and(|status| status.success())
        {
            return Ok(());
        }
    }
    for path in known_paths {
        if Command::new("open")
            .arg(path)
            .status()
            .is_ok_and(|status| status.success())
        {
            return Ok(());
        }
    }
    Err("未能通过 bundleIds、appNames 或 knownPaths 启动应用".into())
}

#[cfg(target_os = "macos")]
fn launch_app(
    _: &[String],
    bundle_ids: &[String],
    app_names: &[String],
    known_paths: &[String],
    _: &[String],
) -> Result<(), String> {
    open_app_macos(bundle_ids, app_names, known_paths)
}

#[cfg(target_os = "windows")]
fn launch_app(
    executable_names: &[String],
    _: &[String],
    _: &[String],
    known_paths: &[String],
    aliases: &[String],
) -> Result<(), String> {
    for candidate in executable_names.iter().chain(aliases) {
        if Command::new("cmd")
            .args(["/C", "start", "", candidate])
            .status()
            .is_ok_and(|status| status.success())
        {
            return Ok(());
        }
    }
    for path in known_paths {
        if Command::new("cmd")
            .args(["/C", "start", "", path])
            .status()
            .is_ok_and(|status| status.success())
        {
            return Ok(());
        }
    }
    Err("未能通过 App Paths、PATH/alias 或 knownPaths 启动应用".into())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn launch_app(
    _: &[String],
    _: &[String],
    _: &[String],
    _: &[String],
    _: &[String],
) -> Result<(), String> {
    Err("UNSUPPORTED_PLATFORM".into())
}

fn send_hotkey(keys: &[String]) -> Result<(), String> {
    if !crate::accessibility::granted() {
        return Err("缺少 macOS“辅助功能”权限：请授权当前正在运行的 Blink 应用后重试".into());
    }
    use enigo::{Direction, Enigo, Keyboard, Settings};
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|error| format!("SEND_HOTKEY 初始化失败：{error}"))?;
    let converted = keys
        .iter()
        .map(|key| to_key(key))
        .collect::<Result<Vec<_>, _>>()?;
    for key in &converted {
        enigo
            .key(*key, Direction::Press)
            .map_err(|error| format!("SEND_HOTKEY 按下失败：{error}"))?;
    }
    for key in converted.iter().rev() {
        enigo
            .key(*key, Direction::Release)
            .map_err(|error| format!("SEND_HOTKEY 释放失败：{error}"))?;
    }
    Ok(())
}

fn to_key(value: &str) -> Result<enigo::Key, String> {
    use enigo::Key;
    match value {
        "CTRL" => Ok(Key::Control),
        "META" => Ok(Key::Meta),
        "ALT" => Ok(Key::Alt),
        "SHIFT" => Ok(Key::Shift),
        "ENTER" => Ok(Key::Return),
        "ESCAPE" => Ok(Key::Escape),
        "TAB" => Ok(Key::Tab),
        "SPACE" => Ok(Key::Space),
        "BACKSPACE" => Ok(Key::Backspace),
        "DELETE" => Ok(Key::Delete),
        "UP" => Ok(Key::UpArrow),
        "DOWN" => Ok(Key::DownArrow),
        "LEFT" => Ok(Key::LeftArrow),
        "RIGHT" => Ok(Key::RightArrow),
        "-" => Ok(Key::Unicode('-')),
        "=" => Ok(Key::Unicode('=')),
        "BACKQUOTE" => Ok(Key::Unicode('`')),
        "BRACKETLEFT" => Ok(Key::Unicode('[')),
        "BRACKETRIGHT" => Ok(Key::Unicode(']')),
        "SEMICOLON" => Ok(Key::Unicode(';')),
        "QUOTE" => Ok(Key::Unicode('\'')),
        "COMMA" => Ok(Key::Unicode(',')),
        "PERIOD" => Ok(Key::Unicode('.')),
        "SLASH" => Ok(Key::Unicode('/')),
        key if key.len() == 1 => Ok(Key::Unicode(
            key.chars().next().unwrap().to_ascii_lowercase(),
        )),
        "F1" => Ok(Key::F1),
        "F2" => Ok(Key::F2),
        "F3" => Ok(Key::F3),
        "F4" => Ok(Key::F4),
        "F5" => Ok(Key::F5),
        "F6" => Ok(Key::F6),
        "F7" => Ok(Key::F7),
        "F8" => Ok(Key::F8),
        "F9" => Ok(Key::F9),
        "F10" => Ok(Key::F10),
        "F11" => Ok(Key::F11),
        "F12" => Ok(Key::F12),
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

    #[test]
    fn refuses_invalid_url_missing_targets_and_script_as_document() {
        use super::dispatch;
        use crate::profile::Execution;
        assert!(dispatch(&Execution::OpenUrl {
            url: "javascript:alert(1)".into()
        })
        .is_err());
        assert!(dispatch(&Execution::OpenFile {
            path: "/blink/nonexistent/file.txt".into()
        })
        .is_err());
        assert!(dispatch(&Execution::OpenFolder {
            path: "/blink/nonexistent/folder".into()
        })
        .is_err());
        assert!(super::executable_file("C:\\test.PS1"));
        assert!(!super::executable_file("/tmp/notes.txt"));
    }

    #[test]
    #[cfg(target_os = "macos")]
    #[ignore = "Opens native apps; run explicitly on macOS"]
    fn native_open_targets() {
        let dir = std::env::temp_dir().join(format!("blink-open-test-{}", std::process::id()));
        std::fs::create_dir(&dir).unwrap();
        let file = dir.join("Blink test document.txt");
        std::fs::write(&file, "Blink OPEN_FILE verification. Safe to close.\n").unwrap();
        assert!(super::dispatch(&crate::profile::Execution::OpenFile {
            path: file.to_string_lossy().into()
        })
        .is_ok());
        assert!(super::dispatch(&crate::profile::Execution::OpenFolder {
            path: dir.to_string_lossy().into()
        })
        .is_ok());
        assert!(super::dispatch(&crate::profile::Execution::OpenUrl {
            url: "http://127.0.0.1:1420/".into()
        })
        .is_ok());
        println!("NATIVE_OPEN_TARGETS_ACCEPTED: {}", dir.display());
        // Keep the tiny fixture while its document window is open.
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn windows_script_job_captures_errors_and_stops_descendants() {
        let dir = std::env::temp_dir().join(format!("blink-job-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let script = dir.join("parent.ps1");
        std::fs::write(
            &script,
            "[Console]::Error.WriteLine('detailed_failure'); exit 7",
        )
        .unwrap();
        assert!(super::run_script(script.to_str().unwrap())
            .unwrap_err()
            .contains("detailed_failure"));
        let marker = dir.join("survived.txt");
        let child = dir.join("child.ps1");
        let quote = |p: &std::path::Path| p.to_string_lossy().replace("'", "''");
        std::fs::write(
            &child,
            format!(
                "Start-Sleep -Seconds 3; Set-Content -LiteralPath '{}' -Value survived",
                quote(&marker)
            ),
        )
        .unwrap();
        std::fs::write(&script, format!("Start-Process powershell.exe -ArgumentList @('-NoProfile', '-NonInteractive', '-File', '\"{}\"'); Start-Sleep -Seconds 10", quote(&child))).unwrap();
        assert!(super::run_script_with_timeout(
            script.to_str().unwrap(),
            std::time::Duration::from_secs(2)
        )
        .unwrap_err()
        .contains("SCRIPT_TIMEOUT"));
        std::thread::sleep(std::time::Duration::from_secs(4));
        assert!(!marker.exists());
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    #[cfg(target_os = "macos")]
    fn script_timeout_stops_background_descendants_and_captures_bounded_errors() {
        let dir = std::env::temp_dir().join(format!("blink-tree-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let script = dir.join("tree.sh");
        let marker = dir.join("escaped");
        std::fs::write(
            &script,
            format!(
                "(sleep 0.4; echo survived > '{}') &\nwait\n",
                marker.display()
            ),
        )
        .unwrap();
        assert!(super::run_script_with_timeout(
            script.to_str().unwrap(),
            std::time::Duration::from_millis(80)
        )
        .unwrap_err()
        .contains("SCRIPT_TIMEOUT"));
        std::thread::sleep(std::time::Duration::from_millis(500));
        assert!(!marker.exists(), "background process survived timeout");
        std::fs::write(&script, "echo detailed_failure >&2; exit 7\n").unwrap();
        assert!(super::run_script(script.to_str().unwrap())
            .unwrap_err()
            .contains("detailed_failure"));
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    #[cfg(target_os = "macos")]
    fn executes_only_selected_shell_file_and_reports_exit_and_timeout() {
        let dir = std::env::temp_dir().join(format!(
            "blink-script-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&dir).unwrap();
        let path = dir.join("safe script; literal.sh");
        std::fs::write(&path, "exit 0\n").unwrap();
        assert!(super::run_script(path.to_str().unwrap()).is_ok());
        assert!(super::dispatch(&crate::profile::Execution::OpenFile {
            path: path.to_string_lossy().into()
        })
        .is_err());
        std::fs::write(&path, "exit 7\n").unwrap();
        assert!(super::run_script(path.to_str().unwrap())
            .unwrap_err()
            .contains("SCRIPT_FAILED"));
        std::fs::write(&path, "while :; do :; done\n").unwrap();
        assert!(super::run_script_with_timeout(
            path.to_str().unwrap(),
            std::time::Duration::from_millis(100)
        )
        .unwrap_err()
        .contains("SCRIPT_TIMEOUT"));
        std::fs::remove_file(path).unwrap();
        std::fs::remove_dir(dir).unwrap();
    }
}
