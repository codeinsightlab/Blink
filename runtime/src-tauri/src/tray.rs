use crate::window::show_main_window;
use crate::{listener_status_label, toggle_listener};
use tauri::menu::{MenuBuilder, MenuItem, MenuItemBuilder, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

pub struct TrayControls {
    pub tray_icon: TrayIcon<tauri::Wry>,
    pub status_item: MenuItem<tauri::Wry>,
    pub toggle_item: MenuItem<tauri::Wry>,
}

pub fn install(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let status_item = MenuItemBuilder::with_id("runtime-status", "● 正在监听")
        .enabled(false)
        .build(app)?;
    let open_item = MenuItemBuilder::with_id("show-main-window", "显示主界面").build(app)?;
    let toggle_item = MenuItemBuilder::with_id("toggle-listener", "暂停监听").build(app)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItemBuilder::with_id("quit-keyflow", "退出 KeyFlow").build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[
            &status_item,
            &open_item,
            &toggle_item,
            &separator,
            &quit_item,
        ])
        .build()?;

    let tray_icon = TrayIconBuilder::with_id("keyflow-tray")
        .icon(app.default_window_icon().ok_or("缺少默认窗口图标")?.clone())
        .tooltip("KeyFlow Runtime")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show-main-window" => {
                let _ = show_main_window(app);
            }
            "toggle-listener" => {
                let _ = toggle_listener(app);
            }
            "quit-keyflow" => {
                crate::quit_keyflow(app);
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
    });
    Ok(())
}

pub fn update(app: &AppHandle, status: &str) {
    let controls = app.state::<TrayControls>();
    let _ = controls.tray_icon.id();
    let _ = controls.status_item.set_text(listener_status_label(status));
    let _ = controls.toggle_item.set_text(if status == "PAUSED" {
        "恢复监听"
    } else {
        "暂停监听"
    });
}
