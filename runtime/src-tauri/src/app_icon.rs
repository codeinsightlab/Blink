//! Runtime-only presentation cache. Never serializes into portable Profile.
use crate::profile::{Action, Execution, Profile};
use base64::{engine::general_purpose::STANDARD, Engine};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

const PREFIX: &str = "app-icon-";
const MAX_BYTES: usize = 2 * 1024 * 1024;

pub fn persist_created(
    repository: &mut crate::repository::ProfileRepository,
    file: &Path,
    profile: Profile,
    icon: Option<String>,
) -> Result<String, String> {
    let mut candidate = repository.clone();
    let result = (|| {
        let id = candidate.insert_import(profile)?.id;
        if let Some(icon) = &icon {
            candidate.set_icon(&id, icon.clone())?;
        }
        candidate.save(file)?;
        Ok(id)
    })();
    if result.is_ok() {
        *repository = candidate;
    } else if let Some(dir) = file.parent() {
        cleanup(dir, icon.as_deref(), repository);
    }
    result
}

fn cache_path(dir: &Path, id: &str) -> Option<PathBuf> {
    let key = id.strip_prefix(PREFIX)?;
    if uuid::Uuid::parse_str(key).ok()?.to_string() != key {
        return None;
    }
    let icons = dir.join("icons");
    if fs::symlink_metadata(&icons).is_ok_and(|meta| !meta.is_dir()) {
        return None;
    }
    Some(icons.join(format!("{id}.png")))
}

pub fn target_changed(previous: &Profile, updated: &Profile, platform: &str) -> bool {
    let app_target = |profile: &Profile| {
        let [Action::OpenApp { executions } | Action::ToggleApp { executions }] =
            profile.actions.as_slice()
        else {
            return None;
        };
        serde_json::to_value(executions.get(platform)?).ok()
    };
    app_target(previous) != app_target(updated)
}

pub fn prepare_edit_icon(
    previous: &crate::repository::RuntimeProfile,
    updated: &Profile,
    platform: &str,
    extract: impl FnOnce(&Profile) -> Option<String>,
) -> Option<String> {
    if target_changed(&previous.profile, updated, platform) {
        extract(updated)
    } else {
        previous.icon_id.clone()
    }
}

pub fn persist_edit(
    repository: &mut crate::repository::ProfileRepository,
    file: &Path,
    previous: &crate::repository::RuntimeProfile,
    profile: Profile,
    name: &str,
    icon: Option<String>,
) -> Result<(), String> {
    let result = (|| {
        let current = repository
            .find(&previous.id)
            .ok_or("RuntimeProfile 不存在")?;
        if serde_json::to_value(current).map_err(|e| e.to_string())?
            != serde_json::to_value(previous).map_err(|e| e.to_string())?
        {
            return Err("命令已发生变化，请重新打开编辑".into());
        }
        let mut candidate = repository.clone();
        candidate.replace_profile(&previous.id, profile, name)?;
        let updated = candidate
            .profiles
            .iter_mut()
            .find(|item| item.id == previous.id)
            .ok_or("RuntimeProfile 不存在")?;
        // A preset is not an automatically owned app icon; retain it on fallback/type exit.
        updated.icon_id = icon.clone().or_else(|| {
            previous
                .icon_id
                .as_ref()
                .filter(|id| !id.starts_with(PREFIX))
                .cloned()
        });
        candidate.save(file)?;
        *repository = candidate;
        Ok(())
    })();
    if let Some(dir) = file.parent() {
        if result.is_ok() {
            cleanup(dir, previous.icon_id.as_deref(), repository);
        } else {
            cleanup(dir, icon.as_deref(), repository);
        }
    }
    result
}

pub fn create(dir: &Path, profile: &Profile, platform: &str) -> Option<String> {
    let [Action::OpenApp { executions } | Action::ToggleApp { executions }] =
        profile.actions.as_slice()
    else {
        return None;
    };
    let (Execution::LaunchApp { known_paths, .. } | Execution::ToggleApp { known_paths, .. }) =
        executions.get(platform)?
    else {
        return None;
    };
    let path = Path::new(known_paths.first()?);
    let bytes = extract(path)?;
    store(dir, &bytes)
}

fn store(dir: &Path, bytes: &[u8]) -> Option<String> {
    if !valid_png(bytes) {
        return None;
    }
    let id = format!("{PREFIX}{}", uuid::Uuid::new_v4());
    let path = cache_path(dir, &id)?;
    fs::create_dir_all(path.parent()?).ok()?;
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .ok()?;
    if file.write_all(bytes).is_err() {
        drop(file);
        let _ = fs::remove_file(path);
        return None;
    }
    Some(id)
}

fn valid_png(bytes: &[u8]) -> bool {
    if bytes.len() > MAX_BYTES {
        return false;
    }
    let Ok(reader) = png::Decoder::new(bytes).read_info() else {
        return false;
    };
    let info = reader.info();
    info.width > 0 && info.height > 0 && info.width <= 2048 && info.height <= 2048
}

pub fn source(dir: &Path, id: Option<&str>) -> Option<String> {
    let path = cache_path(dir, id?)?;
    // Do not follow links outside our owned cache.
    let meta = fs::symlink_metadata(&path).ok()?;
    if !meta.is_file() || meta.len() > MAX_BYTES as u64 {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    valid_png(&bytes).then(|| format!("data:image/png;base64,{}", STANDARD.encode(bytes)))
}

pub fn cleanup(dir: &Path, id: Option<&str>, repository: &crate::repository::ProfileRepository) {
    let Some(id) = id else {
        return;
    };
    if repository
        .profiles
        .iter()
        .any(|p| p.icon_id.as_deref() == Some(id))
    {
        return;
    }
    if let Some(path) = cache_path(dir, id) {
        let _ = fs::remove_file(path);
    }
}

pub fn extract(path: &Path) -> Option<Vec<u8>> {
    if !path.is_absolute() || !path.exists() {
        return None;
    }
    #[cfg(target_os = "macos")]
    {
        objc2::exception::catch(|| extract_macos(path))
            .ok()
            .flatten()
    }
    #[cfg(target_os = "windows")]
    {
        windows::extract(path)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        None
    }
}

#[cfg(target_os = "macos")]
fn extract_macos(path: &Path) -> Option<Vec<u8>> {
    use objc2::AnyThread;
    use objc2_app_kit::{
        NSBitmapImageFileType, NSBitmapImageRep, NSCompositingOperation, NSDeviceRGBColorSpace,
        NSGraphicsContext, NSWorkspace,
    };
    use objc2_foundation::{NSDictionary, NSPoint, NSRect, NSSize, NSString};
    if !path.is_dir() || path.extension()?.to_str()? != "app" {
        return None;
    }
    let image = NSWorkspace::sharedWorkspace().iconForFile(&NSString::from_str(path.to_str()?));
    // AppKit allocates a transparent RGBA buffer and scales the native representation.
    let bitmap = unsafe {
        NSBitmapImageRep::initWithBitmapDataPlanes_pixelsWide_pixelsHigh_bitsPerSample_samplesPerPixel_hasAlpha_isPlanar_colorSpaceName_bytesPerRow_bitsPerPixel(
            NSBitmapImageRep::alloc(), std::ptr::null_mut(), 64, 64, 8, 4, true, false, NSDeviceRGBColorSpace, 0, 0
        )
    }?;
    let context = NSGraphicsContext::graphicsContextWithBitmapImageRep(&bitmap)?;
    struct RestoreContext;
    impl Drop for RestoreContext {
        fn drop(&mut self) {
            NSGraphicsContext::restoreGraphicsState_class();
        }
    }
    NSGraphicsContext::saveGraphicsState_class();
    let restore = RestoreContext;
    NSGraphicsContext::setCurrentContext(Some(&context));
    image.drawInRect_fromRect_operation_fraction(
        NSRect::new(NSPoint::new(0., 0.), NSSize::new(64., 64.)),
        NSRect::new(NSPoint::new(0., 0.), NSSize::new(0., 0.)),
        NSCompositingOperation::Copy,
        1.,
    );
    drop(restore);
    // Empty properties dictionary; NSData remains retained while copying its bytes.
    let png = unsafe {
        bitmap.representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new())
    }?;
    Some(png.to_vec())
}

#[cfg(target_os = "windows")]
#[path = "app_icon_windows.rs"]
mod windows;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::ProfileRepository;
    fn png_bytes() -> Vec<u8> {
        let mut bytes = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut bytes, 1, 1);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            encoder
                .write_header()
                .unwrap()
                .write_image_data(&[255, 0, 0, 128])
                .unwrap();
        }
        bytes
    }
    #[test]
    fn invalid_application_is_optional() {
        assert!(extract(Path::new("/missing/application.app")).is_none());
        assert!(extract(Path::new(r"C:\missing\application.exe")).is_none());
        let profile = Profile::from_json(include_str!(
            "../../../packages/blink-contract/fixtures/profile-v2.0.example.json"
        ))
        .unwrap();
        let mut repo = ProfileRepository::default();
        assert!(repo.insert_import(profile).is_ok());
    }
    #[cfg(target_os = "windows")]
    #[test]
    fn damaged_executable_returns_no_icon() {
        let path =
            std::env::temp_dir().join(format!("blink-bad-icon-{}.exe", uuid::Uuid::new_v4()));
        fs::write(&path, b"not a PE executable").unwrap();
        assert!(extract(&path).is_none());
        fs::remove_file(path).unwrap();
    }
    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "Reads installed macOS application icons; run explicitly"]
    fn installed_macos_icons() {
        let dir = std::env::temp_dir().join("blink-native-icon-verification");
        fs::create_dir_all(&dir).unwrap();
        for (name, path) in [
            ("calculator", "/System/Applications/Calculator.app"),
            ("chrome", "/Applications/Google Chrome.app"),
        ] {
            let bytes = extract(Path::new(path)).expect("native icon");
            assert!(valid_png(&bytes));
            let reader = png::Decoder::new(bytes.as_slice()).read_info().unwrap();
            println!(
                "{name}: {}x{}, {:?}",
                reader.info().width,
                reader.info().height,
                reader.info().color_type
            );
            fs::write(dir.join(format!("{name}.png")), bytes).unwrap();
        }
        println!("icons: {}", dir.display());
    }
    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "Reads installed macOS apps to verify real icon replacement"]
    fn native_macos_reselect_lifecycle() {
        let dir = std::env::temp_dir().join(format!("blink-reselect-{}", uuid::Uuid::new_v4()));
        let file = dir.join("profiles.json");
        let profile = |path: &str| {
            Profile::from_json(&serde_json::json!({"version":"2.0","name":"App","actions":[{"type":"OPEN_APP","executions":{"macos":{"type":"LAUNCH_APP","knownPaths":[path]}}}]}).to_string()).unwrap()
        };
        let a = profile("/System/Applications/Calculator.app");
        let b = profile("/Applications/Google Chrome.app");
        let mut repo = ProfileRepository::default();
        let a_icon = create(&dir, &a, "macos").unwrap();
        let id = persist_created(&mut repo, &file, a, Some(a_icon.clone())).unwrap();
        let previous = repo.find(&id).unwrap().clone();
        let b_icon = prepare_edit_icon(&previous, &b, "macos", |profile| {
            create(&dir, profile, "macos")
        })
        .unwrap();
        assert_ne!(source(&dir, Some(&a_icon)), source(&dir, Some(&b_icon)));
        persist_edit(
            &mut repo,
            &file,
            &previous,
            b,
            "Chrome",
            Some(b_icon.clone()),
        )
        .unwrap();
        assert!(source(&dir, Some(&a_icon)).is_none());
        let loaded = ProfileRepository::load(&file).unwrap();
        assert_eq!(
            loaded.find(&id).unwrap().icon_id.as_deref(),
            Some(b_icon.as_str())
        );
        assert!(source(&dir, Some(&b_icon)).is_some());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn cache_persistence_ownership_and_rollback_cleanup() {
        let dir = std::env::temp_dir().join(format!("blink-icon-test-{}", uuid::Uuid::new_v4()));
        let id = store(&dir, &png_bytes()).unwrap();
        let mut repo = ProfileRepository::default();
        let profile = Profile::from_json(include_str!(
            "../../../packages/blink-contract/fixtures/profile-v2.0.example.json"
        ))
        .unwrap();
        let item = repo.insert_import(profile).unwrap();
        repo.set_icon(&item.id, id.clone()).unwrap();
        repo.save(&dir.join("profiles.json")).unwrap();
        let mut restored = ProfileRepository::load(&dir.join("profiles.json")).unwrap();
        assert_eq!(
            restored.find(&item.id).unwrap().icon_id.as_deref(),
            Some(id.as_str())
        );
        assert!(source(&dir, Some(&id))
            .unwrap()
            .starts_with("data:image/png;base64,"));
        cleanup(&dir, Some(&id), &restored);
        assert!(source(&dir, Some(&id)).is_some()); // still referenced
        let removed = restored.delete(&item.id).unwrap(); // same delete used by Creator rollback
        cleanup(&dir, removed.icon_id.as_deref(), &restored);
        assert!(source(&dir, Some(&id)).is_none());
        fs::write(dir.join("shared.png"), png_bytes()).unwrap();
        for shared in ["copy", "../shared", "app-icon-../../shared"] {
            cleanup(&dir, Some(shared), &restored);
            assert!(source(&dir, Some(shared)).is_none());
        }
        assert!(dir.join("shared.png").exists());
        assert!(store(&dir, b"broken").is_none());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn creator_success_failure_and_failed_save() {
        let dir = std::env::temp_dir().join(format!("blink-icon-test-{}", uuid::Uuid::new_v4()));
        let mut repo = ProfileRepository::default();
        let profile = Profile::from_json(include_str!(
            "../../../packages/blink-contract/fixtures/profile-v2.0.example.json"
        ))
        .unwrap();
        let icon = store(&dir, &png_bytes()).unwrap();
        let id = persist_created(
            &mut repo,
            &dir.join("profiles.json"),
            profile.clone(),
            Some(icon.clone()),
        )
        .unwrap();
        assert_eq!(
            repo.find(&id).unwrap().icon_id.as_deref(),
            Some(icon.as_str())
        );
        let fallback =
            persist_created(&mut repo, &dir.join("profiles.json"), profile.clone(), None).unwrap();
        assert!(repo.find(&fallback).unwrap().icon_id.is_none());
        let failed_icon = store(&dir, &png_bytes()).unwrap();
        fs::create_dir(dir.join("blocked.json")).unwrap();
        assert!(persist_created(
            &mut repo,
            &dir.join("blocked.json"),
            profile,
            Some(failed_icon.clone())
        )
        .is_err());
        assert_eq!(repo.profiles.len(), 2);
        assert!(source(&dir, Some(&failed_icon)).is_none());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn missing_platform_multi_action_and_bad_target_do_not_extract() {
        let dir = std::env::temp_dir().join(format!("blink-icon-test-{}", uuid::Uuid::new_v4()));
        let profile = Profile::from_json(r#"{"version":"2.0","name":"Missing","actions":[{"type":"OPEN_APP","executions":{"macos":{"type":"LAUNCH_APP","knownPaths":["/missing.app"]},"windows":{"type":"LAUNCH_APP","knownPaths":["C:\\missing.exe"]}}}]}"#).unwrap();
        for platform in ["macos", "windows"] {
            let mut repo = ProfileRepository::default();
            let icon = create(&dir, &profile, platform);
            assert!(icon.is_none());
            let id = persist_created(&mut repo, &dir.join("profiles.json"), profile.clone(), icon)
                .unwrap();
            assert!(repo.find(&id).unwrap().icon_id.is_none());
        }
        assert!(create(&dir, &profile, "linux").is_none());
        let mut multi = profile.clone();
        multi.actions.push(profile.actions[0].clone());
        assert!(create(&dir, &multi, "macos").is_none());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn edited_target_clears_only_automatic_icon() {
        let profile = Profile::from_json(r#"{"version":"2.0","name":"App","actions":[{"type":"OPEN_APP","executions":{"macos":{"type":"LAUNCH_APP","knownPaths":["/Applications/Old.app"]}}}]}"#).unwrap();
        let mut repo = ProfileRepository::default();
        let mut previous = repo.insert_import(profile).unwrap();
        previous.icon_id = Some(format!("{PREFIX}{}", uuid::Uuid::new_v4()));
        let mut updated = previous.clone();
        updated.local_name_override = Some("Rename".into());
        assert!(!target_changed(
            &previous.profile,
            &updated.profile,
            "macos"
        ));
        assert_eq!(updated.icon_id, previous.icon_id);
        updated.profile.actions[0].executions_mut().insert(
            "macos".into(),
            serde_json::from_value(
                serde_json::json!({"type":"LAUNCH_APP","knownPaths":["/Applications/New.app"]}),
            )
            .unwrap(),
        );
        assert!(target_changed(&previous.profile, &updated.profile, "macos"));
    }
    #[test]
    fn edit_icon_lifecycle_and_failed_commit_are_atomic() {
        let dir = std::env::temp_dir().join(format!("blink-edit-icon-{}", uuid::Uuid::new_v4()));
        let file = dir.join("profiles.json");
        let app = |name: &str| {
            Profile::from_json(&format!(r#"{{"version":"2.0","name":"App","actions":[{{"type":"OPEN_APP","executions":{{"macos":{{"type":"LAUNCH_APP","knownPaths":["/Applications/{name}.app"]}}}}}}]}}"#)).unwrap()
        };
        let url = Profile::from_json(r#"{"version":"2.1","name":"App","actions":[{"type":"OPEN_URL","executions":{"macos":{"type":"OPEN_URL","url":"https://example.com"}}}]}"#).unwrap();
        let mut repo = ProfileRepository::default();
        let a = store(&dir, &png_bytes()).unwrap();
        let id = persist_created(&mut repo, &file, app("A"), Some(a.clone())).unwrap();
        let mut binding = crate::binding::BindingState::default();
        binding.bind_profile(&id, "F10");
        let before_binding = binding.bindings.clone();
        let previous = repo.find(&id).unwrap().clone();
        let same = prepare_edit_icon(&previous, &app("A"), "macos", |_| {
            panic!("unchanged target must not extract")
        });
        persist_edit(&mut repo, &file, &previous, app("A"), "My App", same).unwrap();
        assert_eq!(repo.find(&id).unwrap().icon_id.as_deref(), Some(a.as_str()));

        let previous = repo.find(&id).unwrap().clone();
        let b = prepare_edit_icon(&previous, &app("B"), "macos", |_| store(&dir, &png_bytes()))
            .unwrap();
        assert_ne!(a, b);
        persist_edit(
            &mut repo,
            &file,
            &previous,
            app("B"),
            "App B",
            Some(b.clone()),
        )
        .unwrap();
        assert!(source(&dir, Some(&a)).is_none());
        assert!(source(&dir, Some(&b)).is_some());
        let previous = repo.find(&id).unwrap().clone();
        let before_disk = fs::read(&file).unwrap();
        let failed_icon = store(&dir, &png_bytes()).unwrap();
        fs::create_dir(dir.join("blocked.json")).unwrap();
        assert!(persist_edit(
            &mut repo,
            &dir.join("blocked.json"),
            &previous,
            url.clone(),
            "URL",
            Some(failed_icon.clone())
        )
        .is_err());
        assert_eq!(
            serde_json::to_value(repo.find(&id).unwrap()).unwrap(),
            serde_json::to_value(&previous).unwrap()
        );
        assert_eq!(fs::read(&file).unwrap(), before_disk);
        assert!(source(&dir, Some(&b)).is_some());
        assert!(source(&dir, Some(&failed_icon)).is_none());

        let missing = prepare_edit_icon(&previous, &app("Missing"), "macos", |_| None);
        persist_edit(
            &mut repo,
            &file,
            &previous,
            app("Missing"),
            "Missing",
            missing,
        )
        .unwrap();
        assert!(repo.find(&id).unwrap().icon_id.is_none());
        assert!(source(&dir, Some(&b)).is_none());
        let previous = repo.find(&id).unwrap().clone();
        persist_edit(&mut repo, &file, &previous, url.clone(), "URL", None).unwrap();
        let previous = repo.find(&id).unwrap().clone();
        let c = prepare_edit_icon(&previous, &app("C"), "macos", |_| store(&dir, &png_bytes()))
            .unwrap();
        persist_edit(&mut repo, &file, &previous, app("C"), "C", Some(c.clone())).unwrap();
        let previous = repo.find(&id).unwrap().clone();
        persist_edit(&mut repo, &file, &previous, url, "URL", None).unwrap();
        assert!(source(&dir, Some(&c)).is_none());
        assert!(repo.find(&id).unwrap().icon_id.is_none());
        assert_eq!(repo.find(&id).unwrap().id, id);
        assert_eq!(binding.bindings, before_binding);
        assert_eq!(
            ProfileRepository::load(&file)
                .unwrap()
                .find(&id)
                .unwrap()
                .profile
                .version,
            "2.1"
        );
        fs::remove_dir_all(dir).unwrap();
    }
}
