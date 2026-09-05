use crate::{binding::BindingState, repository::ProfileRepository};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    io::{Read, Write},
    path::Path,
};
const MAX_BACKUP: u64 = 32 * 1024 * 1024;
const MAX_ICON: usize = 2 * 1024 * 1024;
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Backup {
    format: String,
    version: u32,
    platform: String,
    pub repository: ProfileRepository,
    pub bindings: BindingState,
    pub icons: BTreeMap<String, String>,
}
fn icon_id(id: &str) -> bool {
    id.strip_prefix("app-icon-")
        .and_then(|s| uuid::Uuid::parse_str(s).ok().map(|u| u.to_string() == s))
        .unwrap_or(false)
}
fn validate_png(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() > MAX_ICON {
        return Err("备份图标过大".into());
    }
    let mut decoder = png::Decoder::new(bytes);
    decoder.set_limits(png::Limits { bytes: MAX_ICON });
    let mut reader = decoder.read_info().map_err(|e| e.to_string())?;
    let info = reader.info();
    if info.width > 512 || info.height > 512 {
        return Err("备份图标尺寸过大".into());
    }
    let mut output = vec![0; reader.output_buffer_size()];
    reader.next_frame(&mut output).map_err(|e| e.to_string())?;
    Ok(())
}
pub fn capture(
    dir: &Path,
    repository: &ProfileRepository,
    bindings: &BindingState,
    platform: &str,
) -> Result<Backup, String> {
    let mut backup = Backup {
        format: "blink-runtime-backup".into(),
        version: 1,
        platform: platform.into(),
        repository: repository.clone(),
        bindings: bindings.clone(),
        icons: BTreeMap::new(),
    };
    for item in &repository.profiles {
        if let Some(id) = item.icon_id.as_deref().filter(|id| icon_id(id)) {
            let path = dir.join("icons").join(format!("{id}.png"));
            match fs::File::open(path) {
                Ok(file) => {
                    let mut bytes = Vec::new();
                    file.take(MAX_ICON as u64 + 1)
                        .read_to_end(&mut bytes)
                        .map_err(|e| e.to_string())?;
                    validate_png(&bytes)?;
                    backup.icons.insert(id.into(), STANDARD.encode(bytes));
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(e.to_string()),
            }
        }
    }
    if serde_json::to_vec(&backup)
        .map_err(|e| e.to_string())?
        .len() as u64
        > MAX_BACKUP / 2
    {
        return Err("备份超过大小限制".into());
    }
    Ok(backup)
}
pub fn read(path: &Path, platform: &str) -> Result<Backup, String> {
    let mut data = Vec::new();
    fs::File::open(path)
        .map_err(|e| e.to_string())?
        .take(MAX_BACKUP + 1)
        .read_to_end(&mut data)
        .map_err(|e| e.to_string())?;
    if data.len() as u64 > MAX_BACKUP {
        return Err("备份超过大小限制".into());
    }
    let mut backup: Backup = serde_json::from_slice(&data).map_err(|e| e.to_string())?;
    if backup.format != "blink-runtime-backup" || backup.version != 1 {
        return Err("不支持的备份格式或版本".into());
    }
    if backup.platform != platform {
        return Err("本机备份仅支持同一操作系统；跨平台请导出命令配置".into());
    }
    let mut ids = HashSet::new();
    for item in &mut backup.repository.profiles {
        if item.id.is_empty()
            || item.id.len() > 128
            || !item
                .id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
            || !ids.insert(item.id.clone())
        {
            return Err("备份命令编号重复或为空".into());
        }
        item.profile = item.profile.clone().validate().map_err(|e| e.to_string())?;
    }
    let mut inputs = HashSet::new();
    let mut targets = HashSet::new();
    for binding in &backup.bindings.bindings {
        if !ids.contains(&binding.runtime_profile_id)
            || !inputs.insert(&binding.physical_input)
            || !targets.insert(&binding.runtime_profile_id)
        {
            return Err("备份存在重复或无效绑定".into());
        }
    }
    for (id, encoded) in &backup.icons {
        if !icon_id(id) {
            return Err("无效图标编号".into());
        }
        validate_png(&STANDARD.decode(encoded).map_err(|e| e.to_string())?)?;
    }
    backup.bindings.rebuild(&ids);
    Ok(backup)
}
pub fn install_icons(
    dir: &Path,
    repository: &mut ProfileRepository,
    icons: &BTreeMap<String, String>,
) -> Result<Vec<String>, String> {
    let directory = dir.join("icons");
    if fs::symlink_metadata(&directory).is_ok_and(|m| !m.is_dir()) {
        return Err("图标目录无效".into());
    }
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let mut installed = Vec::new();
    let result = (|| {
        for item in &mut repository.profiles {
            if let Some(old) = item.icon_id.as_deref().filter(|id| icon_id(id)) {
                item.icon_id = if let Some(encoded) = icons.get(old) {
                    let id = format!("app-icon-{}", uuid::Uuid::new_v4());
                    let mut file = fs::OpenOptions::new()
                        .write(true)
                        .create_new(true)
                        .open(directory.join(format!("{id}.png")))
                        .map_err(|e| e.to_string())?;
                    installed.push(id.clone());
                    file.write_all(&STANDARD.decode(encoded).map_err(|e| e.to_string())?)
                        .map_err(|e| e.to_string())?;
                    file.sync_all().map_err(|e| e.to_string())?;
                    Some(id)
                } else {
                    None
                };
            }
        }
        Ok(installed.clone())
    })();
    if result.is_err() {
        for id in installed {
            let _ = fs::remove_file(directory.join(format!("{id}.png")));
        }
    }
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn backup_roundtrip_preserves_names_bindings_and_rejects_wrong_platform() {
        let dir = std::env::temp_dir().join(format!("blink-backup-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let mut repository = ProfileRepository::default();
        repository.ensure_system_profiles().unwrap();
        let id = repository.profiles[0].id.clone();
        repository.rename(&id, "My name".into()).unwrap();
        let mut bindings = BindingState::default();
        bindings.bind_profile(&id, "F10");
        let icon = format!("app-icon-{}", uuid::Uuid::new_v4());
        repository.profiles[0].icon_id = Some(icon.clone());
        fs::create_dir_all(dir.join("icons")).unwrap();
        let mut bytes = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut bytes, 1, 1);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            encoder
                .write_header()
                .unwrap()
                .write_image_data(&[255, 0, 0, 255])
                .unwrap();
        }
        fs::write(dir.join("icons").join(format!("{icon}.png")), &bytes).unwrap();
        let backup = capture(&dir, &repository, &bindings, "macos").unwrap();
        let path = dir.join("backup.json");
        crate::persistence::write_json(&path, &backup).unwrap();
        let restored = read(&path, "macos").unwrap();
        assert_eq!(restored.repository.profiles[0].display_name(), "My name");
        assert_eq!(restored.bindings.bindings, bindings.bindings);
        let mut installed_repository = restored.repository.clone();
        let installed = install_icons(&dir, &mut installed_repository, &restored.icons).unwrap();
        assert_eq!(installed.len(), 1);
        assert_ne!(installed[0], icon);
        assert_eq!(
            fs::read(dir.join("icons").join(format!("{}.png", installed[0]))).unwrap(),
            bytes
        );
        assert!(dir.join("icons").join(format!("{icon}.png")).exists());
        assert!(read(&path, "windows").is_err());
        let mut invalid = backup;
        invalid.bindings.bindings[0].runtime_profile_id = "missing".into();
        crate::persistence::write_json(&path, &invalid).unwrap();
        assert!(read(&path, "macos").is_err());
        fs::remove_dir_all(dir).unwrap();
    }
}
