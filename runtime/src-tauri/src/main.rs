mod app_icon;
mod app_toggle;
mod binding;
mod execution;
mod profile;
mod repository;
mod tray;
mod window;
use binding::BindingState;
use profile::Profile;
use repository::ProfileRepository;
use serde::Serialize;
use std::{
    collections::HashSet,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
struct RuntimeCore {
    repository: ProfileRepository,
    bindings: BindingState,
    listener_status: String,
    binding_capture: bool,
    last_error: Option<String>,
    last_event: Option<String>,
    repository_file: PathBuf,
    binding_file: PathBuf,
}
type SharedRuntime = Mutex<RuntimeCore>;
pub(crate) struct AppLifecycle(pub AtomicBool);
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeProfileView {
    id: String,
    name: String,
    description: Option<String>,
    physical_input: Option<String>,
    action_hotkey: Option<Vec<String>>,
    action_type: Option<&'static str>,
    icon_id: Option<String>,
    icon_source: Option<String>,
    source: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeSnapshot {
    profiles: Vec<RuntimeProfileView>,
    platform: String,
    listener_status: String,
    last_error: Option<String>,
    last_event: Option<String>,
}
fn ids(repository: &ProfileRepository) -> HashSet<String> {
    repository
        .profiles
        .iter()
        .map(|profile| profile.id.clone())
        .collect()
}
fn set_status(app: &AppHandle, status: &str) {
    {
        let state = app.state::<SharedRuntime>();
        state.lock().expect("runtime lock").listener_status = status.into();
    }
    tray::update(app, status);
}
fn register_state(app: &AppHandle, state: &BindingState) -> Result<(), String> {
    let manager = app.global_shortcut();
    manager.unregister_all().map_err(|e| e.to_string())?;
    for key in state.physical_to_profile.keys() {
        manager
            .register(
                key.replace("META", "SUPER")
                    .parse::<Shortcut>()
                    .map_err(|e| format!("无效物理按键 {key}: {e}"))?,
            )
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
fn refresh_listener(app: &AppHandle) -> Result<(), String> {
    let bindings = {
        let state = app.state::<SharedRuntime>();
        let bindings = state.lock().expect("runtime lock").bindings.clone();
        bindings
    };
    let count = bindings.physical_to_profile.len();
    match register_state(app, &bindings) {
        Ok(()) => {
            set_status(app, "LISTENING");
            publish_diagnostic(app, format!("已注册 {count} 个全局快捷键"), None);
            Ok(())
        }
        Err(e) => {
            set_status(app, "ERROR");
            publish_diagnostic(app, "全局快捷键注册失败".into(), Some(e.clone()));
            Err(e)
        }
    }
}
fn commit_bindings(app: &AppHandle, next: BindingState) -> Result<(), String> {
    let (previous, paused) = {
        let state = app.state::<SharedRuntime>();
        let core = state.lock().expect("runtime lock");
        (core.bindings.clone(), core.listener_status == "PAUSED")
    };
    if !paused {
        if let Err(error) = register_state(app, &next) {
            if let Err(rollback) = register_state(app, &previous) {
                set_status(app, "ERROR");
                return Err(format!("{error}；恢复原快捷键失败：{rollback}"));
            }
            set_status(app, "LISTENING");
            return Err(error);
        }
    }
    {
        let state = app.state::<SharedRuntime>();
        let mut core = state.lock().expect("runtime lock");
        if let Err(error) = next.save(&core.binding_file) {
            drop(core);
            if !paused {
                if let Err(rollback) = register_state(app, &previous) {
                    set_status(app, "ERROR");
                    return Err(format!("{error}；恢复原快捷键失败：{rollback}"));
                }
            }
            return Err(error);
        }
        core.bindings = next;
        core.binding_capture = false;
    }
    if !paused {
        set_status(app, "LISTENING");
    }
    Ok(())
}
fn publish_diagnostic(app: &AppHandle, event: String, error: Option<String>) {
    let state = app.state::<SharedRuntime>();
    let mut core = state.lock().expect("runtime lock");
    let detail = error.clone();
    let log_file = core
        .repository_file
        .parent()
        .map(|directory| directory.join("runtime-diagnostics.log"));
    core.last_event = Some(event.clone());
    core.last_error = error;
    drop(core);
    if let Some(log_file) = log_file {
        use std::io::Write;
        let line = match detail {
            Some(error) => format!("{event} | {error}\n"),
            None => format!("{event}\n"),
        };
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_file)
            .and_then(|mut file| file.write_all(line.as_bytes()));
    }
    let _ = app.emit("runtime-diagnostic", ());
}
fn dispatch_profile(app: &AppHandle, id: &str) {
    let executions = {
        let state = app.state::<SharedRuntime>();
        let core = state.lock().expect("runtime lock");
        core.repository
            .find(id)
            .map(|runtime_profile| runtime_profile.profile.executions_for(current_platform()))
    };
    if let Some(executions) = executions {
        match executions {
            Ok(executions) => {
                if executions
                    .iter()
                    .any(|execution| matches!(execution, profile::Execution::RunScript { .. }))
                {
                    static SCRIPT_RUNNING: AtomicBool = AtomicBool::new(false);
                    if SCRIPT_RUNNING.swap(true, Ordering::SeqCst) {
                        publish_diagnostic(app, "脚本仍在运行，请稍后重试".into(), None);
                        return;
                    }
                    let handle = app.clone();
                    std::thread::spawn(move || {
                        let result = executions.iter().try_for_each(execution::dispatch);
                        SCRIPT_RUNNING.store(false, Ordering::SeqCst);
                        match result {
                            Ok(()) => publish_diagnostic(&handle, "脚本命令执行完成".into(), None),
                            Err(error) => {
                                publish_diagnostic(&handle, "脚本命令执行失败".into(), Some(error))
                            }
                        }
                    });
                    return;
                }
                if executions
                    .iter()
                    .any(|execution| matches!(execution, profile::Execution::ToggleApp { .. }))
                {
                    // App launch polling must not block the AppKit main run loop.
                    let handle = app.clone();
                    std::thread::spawn(move || {
                        match executions.iter().try_for_each(execution::dispatch) {
                            Ok(()) => publish_diagnostic(
                                &handle,
                                "已收到快捷键，命令执行完成".into(),
                                None,
                            ),
                            Err(error) => publish_diagnostic(
                                &handle,
                                "已收到快捷键，但命令执行失败".into(),
                                Some(error),
                            ),
                        }
                    });
                    return;
                }
                for execution in executions {
                    if let Err(error) = execution::dispatch(&execution) {
                        publish_diagnostic(app, "已收到快捷键，但命令执行失败".into(), Some(error));
                        return;
                    }
                }
            }
            Err(error) => {
                publish_diagnostic(app, "已收到快捷键，但命令执行失败".into(), Some(error));
                return;
            }
        }
        publish_diagnostic(app, "已收到快捷键，命令执行完成".into(), None);
    }
}
fn dispatch_physical_key(app: &AppHandle, shortcut: &Shortcut) {
    let binding = {
        let state = app.state::<SharedRuntime>();
        let core = state.lock().expect("runtime lock");
        core.bindings
            .physical_to_profile
            .iter()
            .find_map(|(input, id)| {
                input
                    .replace("META", "SUPER")
                    .parse::<Shortcut>()
                    .ok()
                    .filter(|value| value == shortcut)
                    .map(|_| (input.clone(), id.clone()))
            })
    };
    if let Some((input, id)) = binding {
        publish_diagnostic(app, format!("已收到全局快捷键 {input}"), None);
        dispatch_profile(app, &id)
    }
}
fn pause_listener(app: &AppHandle) -> Result<(), String> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| e.to_string())?;
    set_status(app, "PAUSED");
    Ok(())
}
pub(crate) fn toggle_listener(app: &AppHandle) -> Result<(), String> {
    let paused = {
        let state = app.state::<SharedRuntime>();
        let paused = state.lock().expect("runtime lock").listener_status == "PAUSED";
        paused
    };
    if paused {
        refresh_listener(app)
    } else {
        pause_listener(app)
    }
}
pub(crate) fn shutdown_listener(app: &AppHandle) {
    let _ = app.global_shortcut().unregister_all();
}
pub(crate) fn quit_blink(app: &AppHandle) {
    app.state::<AppLifecycle>().0.store(true, Ordering::SeqCst);
    shutdown_listener(app);
    {
        let state = app.state::<SharedRuntime>();
        let core = state.lock().expect("runtime lock");
        let _ = core.repository.save(&core.repository_file);
        let _ = core.bindings.save(&core.binding_file);
    }
    app.exit(0);
}
fn current_platform() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else {
        "macos"
    }
}
fn action_hotkey(profile: &repository::RuntimeProfile) -> Option<Vec<String>> {
    profile
        .profile
        .actions
        .iter()
        .filter_map(|action| action.executions().get(current_platform()))
        .find_map(|execution| match execution {
            profile::Execution::SendHotkey { keys } => Some(keys.clone()),
            _ => None,
        })
}
fn validate_binding_target(profile: &Profile, input: &str) -> Result<(), String> {
    let mut trigger: Vec<_> = input.split('+').collect();
    trigger.sort_unstable();
    for execution in profile
        .actions
        .iter()
        .filter_map(|action| action.executions().get(current_platform()))
    {
        if let profile::Execution::SendHotkey { keys } = execution {
            let mut output: Vec<_> = keys.iter().map(String::as_str).collect();
            output.sort_unstable();
            if trigger == output {
                return Err("动作快捷键不能与实体触发键相同".into());
            }
        }
    }
    Ok(())
}
#[tauri::command]
fn runtime_snapshot(core: State<SharedRuntime>) -> RuntimeSnapshot {
    let core = core.lock().expect("runtime lock");
    RuntimeSnapshot {
        profiles: core
            .repository
            .profiles
            .iter()
            .map(|profile| RuntimeProfileView {
                id: profile.id.clone(),
                name: profile.display_name().into(),
                description: profile.profile.description.clone(),
                physical_input: core.bindings.profile_to_physical.get(&profile.id).cloned(),
                action_hotkey: action_hotkey(profile),
                action_type: profile.profile.actions.first().map(|action| match action {
                    profile::Action::OpenApp { .. } => "OPEN_APP",
                    profile::Action::ToggleApp { .. } => "TOGGLE_APP",
                    profile::Action::Command { .. } => "COMMAND",
                    profile::Action::OpenUrl { .. } => "OPEN_URL",
                    profile::Action::OpenFile { .. } => "OPEN_FILE",
                    profile::Action::OpenFolder { .. } => "OPEN_FOLDER",
                    profile::Action::Script { .. } => "SCRIPT",
                }),
                icon_id: profile.icon_id.clone(),
                icon_source: core
                    .repository_file
                    .parent()
                    .and_then(|dir| app_icon::source(dir, profile.icon_id.as_deref())),
                source: match profile.source {
                    repository::ProfileSource::System => "SYSTEM".into(),
                    repository::ProfileSource::External => "EXTERNAL".into(),
                },
            })
            .collect(),
        platform: current_platform().into(),
        listener_status: core.listener_status.clone(),
        last_error: core.last_error.clone(),
        last_event: core.last_event.clone(),
    }
}
#[tauri::command]
fn toggle_listener_command(app: AppHandle) -> Result<(), String> {
    toggle_listener(&app)
}
#[tauri::command]
fn quit_blink_command(app: AppHandle) {
    quit_blink(&app)
}
#[tauri::command]
fn begin_binding_capture(app: AppHandle, profile_id: String) -> Result<(), String> {
    {
        let state = app.state::<SharedRuntime>();
        let mut core = state.lock().expect("runtime lock");
        if core.repository.find(&profile_id).is_none() {
            return Err("RuntimeProfile 不存在".into());
        }
        if core.listener_status == "PAUSED" {
            return Err("监听已暂停，无法开始绑定".into());
        }
        core.binding_capture = true;
    }
    if let Err(error) = app
        .global_shortcut()
        .unregister_all()
        .map_err(|error| error.to_string())
    {
        let state = app.state::<SharedRuntime>();
        state.lock().expect("runtime lock").binding_capture = false;
        return Err(error);
    }
    publish_diagnostic(&app, "正在等待新的实体按键；已有绑定暂不执行".into(), None);
    Ok(())
}
#[tauri::command]
fn cancel_binding_capture(app: AppHandle) -> Result<(), String> {
    {
        let state = app.state::<SharedRuntime>();
        state.lock().expect("runtime lock").binding_capture = false;
    }
    refresh_listener(&app)
}
fn import_profiles(app: &AppHandle, profiles: Vec<Profile>) -> Result<(), String> {
    let state = app.state::<SharedRuntime>();
    let mut core = state.lock().expect("runtime lock");
    for profile in profiles {
        core.repository.insert_import(profile)?;
    }
    core.repository.save(&core.repository_file)
}
#[tauri::command]
fn load_profile(app: AppHandle, path: String) -> Result<(), String> {
    import_profiles(
        &app,
        Profile::many_from_file(&path).map_err(|e| e.to_string())?,
    )
}
#[tauri::command]
async fn create_runtime_profile(
    app: AppHandle,
    profile: serde_json::Value,
) -> Result<String, String> {
    let profile = Profile::from_json(&profile.to_string()).map_err(|error| error.to_string())?;
    profile.executions_for(current_platform())?;
    let file = app
        .state::<SharedRuntime>()
        .lock()
        .expect("runtime lock")
        .repository_file
        .clone();
    let icon_profile = profile.clone();
    let icon_dir = file.parent().map(PathBuf::from);
    // Native lookup and PNG encoding do not occupy the UI thread or repository lock.
    let icon = tauri::async_runtime::spawn_blocking(move || {
        icon_dir.and_then(|dir| app_icon::create(&dir, &icon_profile, current_platform()))
    })
    .await
    .ok()
    .flatten();
    let state = app.state::<SharedRuntime>();
    let mut core = state.lock().expect("runtime lock");
    app_icon::persist_created(&mut core.repository, &file, profile, icon)
}
#[tauri::command]
fn get_editable_profile(core: State<SharedRuntime>, profile_id: String) -> Result<Profile, String> {
    let core = core.lock().expect("runtime lock");
    let item = core
        .repository
        .find(&profile_id)
        .ok_or("RuntimeProfile 不存在")?;
    if item.source == repository::ProfileSource::System {
        return Err("系统命令不支持编辑".into());
    }
    Ok(item.profile.clone())
}
#[tauri::command]
async fn update_runtime_profile(
    app: AppHandle,
    profile_id: String,
    profile: serde_json::Value,
    name: String,
) -> Result<(), String> {
    let profile = Profile::from_json(&profile.to_string()).map_err(|e| e.to_string())?;
    let (previous, file) = {
        let state = app.state::<SharedRuntime>();
        let core = state.lock().expect("runtime lock");
        let previous = core
            .repository
            .find(&profile_id)
            .ok_or("RuntimeProfile 不存在")?
            .clone();
        let mut candidate = core.repository.clone();
        candidate.replace_profile(&profile_id, profile.clone(), &name)?;
        (previous, core.repository_file.clone())
    };
    let changed = app_icon::target_changed(&previous.profile, &profile, current_platform());
    let icon_profile = profile.clone();
    let dir = file.parent().map(PathBuf::from);
    let icon_previous = previous.clone();
    let icon = tauri::async_runtime::spawn_blocking(move || {
        app_icon::prepare_edit_icon(
            &icon_previous,
            &icon_profile,
            current_platform(),
            |profile| dir.and_then(|dir| app_icon::create(&dir, profile, current_platform())),
        )
    })
    .await
    .unwrap_or_else(|_| {
        if changed {
            None
        } else {
            previous.icon_id.clone()
        }
    });
    let state = app.state::<SharedRuntime>();
    let mut core = state.lock().expect("runtime lock");
    let result = (|| {
        if let Some(input) = core.bindings.profile_to_physical.get(&profile_id) {
            validate_binding_target(&profile, input)?;
        }
        app_icon::persist_edit(
            &mut core.repository,
            &file,
            &previous,
            profile,
            &name,
            icon.clone(),
        )
    })();
    if result.is_err() && changed {
        if let Some(dir) = file.parent() {
            app_icon::cleanup(dir, icon.as_deref(), &core.repository);
        }
    }
    result
}
#[tauri::command]
fn load_fixture_profile(app: AppHandle) -> Result<(), String> {
    import_profiles(
        &app,
        vec![Profile::from_json(include_str!(
            "../../../packages/blink-contract/fixtures/profile-v2.0.example.json"
        ))
        .map_err(|e| e.to_string())?],
    )
}
#[tauri::command]
fn bind_key(app: AppHandle, profile_id: String, physical_key: String) -> Result<(), String> {
    physical_key
        .replace("META", "SUPER")
        .parse::<Shortcut>()
        .map_err(|e| format!("无效物理按键 {physical_key}: {e}"))?;
    let mut next = {
        let state = app.state::<SharedRuntime>();
        let core = state.lock().expect("runtime lock");
        let item = core
            .repository
            .find(&profile_id)
            .ok_or("RuntimeProfile 不存在")?;
        validate_binding_target(&item.profile, &physical_key)?;
        core.bindings.clone()
    };
    next.bind_profile(&profile_id, &physical_key);
    debug_assert!(next.consistent());
    commit_bindings(&app, next)
}
#[tauri::command]
fn unbind_profile(app: AppHandle, profile_id: String) -> Result<(), String> {
    let mut next = {
        let state = app.state::<SharedRuntime>();
        let bindings = state.lock().expect("runtime lock").bindings.clone();
        bindings
    };
    next.unbind_profile(&profile_id);
    debug_assert!(next.consistent());
    commit_bindings(&app, next)
}
#[tauri::command]
fn rename_profile(app: AppHandle, profile_id: String, name: String) -> Result<(), String> {
    let state = app.state::<SharedRuntime>();
    let mut core = state.lock().expect("runtime lock");
    core.repository.rename(&profile_id, name)?;
    core.repository.save(&core.repository_file)
}
#[tauri::command]
fn set_profile_icon(app: AppHandle, profile_id: String, icon_id: String) -> Result<(), String> {
    let state = app.state::<SharedRuntime>();
    let mut core = state.lock().expect("runtime lock");
    let previous = core
        .repository
        .find(&profile_id)
        .and_then(|p| p.icon_id.clone());
    let mut candidate = core.repository.clone();
    candidate.set_icon(&profile_id, icon_id)?;
    candidate.save(&core.repository_file)?;
    core.repository = candidate;
    if let Some(dir) = core.repository_file.parent() {
        app_icon::cleanup(dir, previous.as_deref(), &core.repository);
    }
    Ok(())
}
#[tauri::command]
fn delete_profile(app: AppHandle, profile_id: String) -> Result<(), String> {
    {
        let state = app.state::<SharedRuntime>();
        let core = state.lock().expect("runtime lock");
        if core
            .repository
            .find(&profile_id)
            .is_some_and(|profile| profile.source == repository::ProfileSource::System)
        {
            return Err("系统内置 Profile 不支持删除".into());
        }
    }
    unbind_profile(app.clone(), profile_id.clone())?;
    let state = app.state::<SharedRuntime>();
    let mut core = state.lock().expect("runtime lock");
    // Keep the record visible/retryable if cleanup cannot be persisted.
    let mut candidate = core.repository.clone();
    let removed = candidate.delete(&profile_id)?;
    candidate.save(&core.repository_file)?;
    core.repository = candidate;
    if let Some(dir) = core.repository_file.parent() {
        app_icon::cleanup(dir, removed.icon_id.as_deref(), &core.repository);
    }
    Ok(())
}
#[tauri::command]
fn delete_external_profiles(app: AppHandle, profile_ids: Vec<String>) -> Result<usize, String> {
    let ids = {
        let state = app.state::<SharedRuntime>();
        let core = state.lock().expect("runtime lock");
        core.repository.external_ids(&profile_ids)
    };
    for id in &ids {
        unbind_profile(app.clone(), id.clone())?;
    }
    let state = app.state::<SharedRuntime>();
    let mut core = state.lock().expect("runtime lock");
    let mut candidate = core.repository.clone();
    let mut removed = Vec::new();
    for id in &ids {
        removed.push(candidate.delete(id)?);
    }
    candidate.save(&core.repository_file)?;
    core.repository = candidate;
    if let Some(dir) = core.repository_file.parent() {
        for item in removed {
            app_icon::cleanup(dir, item.icon_id.as_deref(), &core.repository);
        }
    }
    Ok(ids.len())
}
#[cfg(test)]
mod consistency_tests {
    #[test]
    fn shared_binding_and_edit_reject_direct_self_trigger() {
        let profile = crate::profile::Profile::from_json(&serde_json::json!({"version":"2.0","name":"Copy","actions":[{"type":"COMMAND","executions":{(super::current_platform()):{"type":"SEND_HOTKEY","keys":["CTRL","C"]}}}]}).to_string()).unwrap();
        assert!(super::validate_binding_target(&profile, "CTRL+C").is_err());
        assert!(super::validate_binding_target(&profile, "C+CTRL").is_err());
        assert!(super::validate_binding_target(&profile, "F10").is_ok());
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            let _ = window::show_main_window(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        dispatch_physical_key(app, shortcut)
                    }
                })
                .build(),
        )
        .setup(|app| {
            app.manage(AppLifecycle(AtomicBool::new(false)));
            let dir = app.path().app_data_dir()?;
            let repo_file = dir.join("profiles.json");
            let mut repository = match ProfileRepository::load(&repo_file) {
                Ok(repository) => repository,
                Err(error) => {
                    // Returning this error from setup would panic inside macOS's
                    // non-unwinding launch callback. Do not seed or save on failure.
                    eprintln!("Blink 配置加载失败: {}: {error}", repo_file.display());
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.hide();
                    }
                    let handle = app.handle().clone();
                    app.dialog()
                        .message(format!(
                            "无法加载本地配置，Blink 将退出。\n\n文件：{}\n\n原因：{error}\n\n原配置和绑定未被修改。请先备份，再检查配置格式或重置旧开发数据；当前支持 Profile v2.0 / v2.1。",
                            repo_file.display()
                        ))
                        .title("Blink 配置加载失败")
                        .kind(MessageDialogKind::Error)
                        .show(move |_| {
                            handle.state::<AppLifecycle>().0.store(true, Ordering::SeqCst);
                            handle.exit(1);
                        });
                    return Ok(());
                }
            };
            let seeded = repository
                .ensure_system_profiles()
                .map_err(|error| std::io::Error::other(error))?;
            if seeded {
                repository.save(&repo_file).map_err(std::io::Error::other)?;
            }
            let binding_file = dir.join("bindings.json");
            let bindings = BindingState::load(&binding_file, &ids(&repository));
            bindings.save(&binding_file)?;
            app.manage(Mutex::new(RuntimeCore {
                repository,
                bindings,
                listener_status: "LISTENING".into(),
                binding_capture: false,
                last_error: None,
                last_event: None,
                repository_file: repo_file,
                binding_file,
            }));
            tray::install(app)?;
            refresh_listener(app.handle()).ok();
            #[cfg(not(debug_assertions))]
            if let Some(window) = app.get_webview_window("main") {
                window.hide()?;
            }
            Ok(())
        })
        .on_window_event(window::hide_on_close)
        .invoke_handler(tauri::generate_handler![
            tray::set_ui_language,
            runtime_snapshot,
            toggle_listener_command,
            quit_blink_command,
            begin_binding_capture,
            cancel_binding_capture,
            load_profile,
            create_runtime_profile,
            get_editable_profile,
            update_runtime_profile,
            load_fixture_profile,
            bind_key,
            unbind_profile,
            rename_profile,
            set_profile_icon,
            delete_profile,
            delete_external_profiles
        ])
        .run(tauri::generate_context!())
        .expect("Blink 启动失败");
}
