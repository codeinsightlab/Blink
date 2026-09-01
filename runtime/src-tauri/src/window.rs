use crate::AppLifecycle;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager, Window, WindowEvent};

pub fn show_main_window(app: &AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("主窗口不存在")?;
    window.unminimize().map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

pub fn hide_on_close(window: &Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        if window.app_handle().state::<AppLifecycle>().0.load(Ordering::SeqCst) { return; }
        api.prevent_close();
        let _ = window.hide();
    }
}
