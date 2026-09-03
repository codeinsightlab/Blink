use crate::toggle_listener;
use crate::window::show_main_window;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    OnceLock,
};
use tauri::menu::{MenuBuilder, MenuItem, MenuItemBuilder, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

pub struct TrayControls {
    pub tray_icon: TrayIcon<tauri::Wry>,
    pub status_item: MenuItem<tauri::Wry>,
    pub toggle_item: MenuItem<tauri::Wry>,
    pub open_item: MenuItem<tauri::Wry>,
    pub quit_item: MenuItem<tauri::Wry>,
    english: AtomicBool,
}

fn text(english: bool, key: &str) -> &'static str {
    static ZH: OnceLock<serde_json::Value> = OnceLock::new();
    static EN: OnceLock<serde_json::Value> = OnceLock::new();
    let resource = if english {
        EN.get_or_init(|| {
            serde_json::from_str(include_str!("../../src/locales/en.json"))
                .expect("English UI resource")
        })
    } else {
        ZH.get_or_init(|| {
            serde_json::from_str(include_str!("../../src/locales/zh-CN.json"))
                .expect("Chinese UI resource")
        })
    };
    resource[key].as_str().expect("UI resource key")
}

#[tauri::command]
pub fn set_ui_language(app: AppHandle, language: String) -> Result<(), String> {
    if language != "en" && language != "zh-CN" {
        return Err("UNSUPPORTED_UI_LANGUAGE".into());
    }
    let controls = app.state::<TrayControls>();
    let english = language == "en";
    controls.english.store(english, Ordering::Relaxed);
    controls
        .open_item
        .set_text(text(english, "showWindow"))
        .map_err(|e| e.to_string())?;
    controls
        .quit_item
        .set_text(text(english, "quitBlink"))
        .map_err(|e| e.to_string())?;
    let status = app
        .state::<crate::SharedRuntime>()
        .lock()
        .expect("runtime lock")
        .listener_status
        .clone();
    update(&app, &status);
    Ok(())
}

pub fn install(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let status_item = MenuItemBuilder::with_id("runtime-status", text(false, "listening"))
        .enabled(false)
        .build(app)?;
    let open_item =
        MenuItemBuilder::with_id("show-main-window", text(false, "showWindow")).build(app)?;
    let toggle_item =
        MenuItemBuilder::with_id("toggle-listener", text(false, "pauseListening")).build(app)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItemBuilder::with_id("quit-blink", text(false, "quitBlink")).build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[
            &status_item,
            &open_item,
            &toggle_item,
            &separator,
            &quit_item,
        ])
        .build()?;

    let tray_icon = TrayIconBuilder::with_id("blink-tray")
        .icon(tauri::include_image!("icons/32x32.png"))
        .tooltip("Blink")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show-main-window" => {
                let _ = show_main_window(app);
            }
            "toggle-listener" => {
                let _ = toggle_listener(app);
            }
            "quit-blink" => {
                crate::quit_blink(app);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    app.manage(TrayControls {
        tray_icon,
        status_item,
        toggle_item,
        open_item,
        quit_item,
        english: AtomicBool::new(false),
    });
    Ok(())
}

pub fn update(app: &AppHandle, status: &str) {
    let controls = app.state::<TrayControls>();
    let _ = controls.tray_icon.id();
    let english = controls.english.load(Ordering::Relaxed);
    let _ = controls.status_item.set_text(text(
        english,
        match status {
            "LISTENING" => "listening",
            "PAUSED" => "paused",
            _ => "attention",
        },
    ));
    let _ = controls.toggle_item.set_text(text(
        english,
        if status == "PAUSED" {
            "resumeListening"
        } else {
            "pauseListening"
        },
    ));
}

#[cfg(test)]
mod tests {
    #[test]
    fn tray_uses_shared_complete_locale_resources() {
        for key in [
            "showWindow",
            "quitBlink",
            "listening",
            "paused",
            "attention",
            "resumeListening",
            "pauseListening",
        ] {
            assert!(!super::text(false, key).is_empty());
            assert!(!super::text(true, key).is_empty());
            assert_ne!(super::text(false, key), super::text(true, key));
        }
    }
}
