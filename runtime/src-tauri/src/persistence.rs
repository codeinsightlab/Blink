//! Durable undo record for operations changing both configuration files.
use crate::{binding::BindingState, repository::ProfileRepository};
use serde::{Deserialize, Serialize};
use std::{fs, io::Write, path::Path};

#[derive(Serialize, Deserialize)]
struct Undo {
    repository: ProfileRepository,
    bindings: BindingState,
}

pub fn write_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let temporary = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|e| e.to_string())?;
        file.write_all(&serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        fs::rename(&temporary, path).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result
}

pub fn recover(dir: &Path) -> Result<(), String> {
    let journal = dir.join("configuration-undo.json");
    let data = match fs::read(&journal) {
        Ok(data) => data,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(format!("TRANSACTION_RECOVERY_FAILED: {e}")),
    };
    let undo: Undo =
        serde_json::from_slice(&data).map_err(|e| format!("TRANSACTION_RECOVERY_FAILED: {e}"))?;
    undo.repository.save(&dir.join("profiles.json"))?;
    undo.bindings.save(&dir.join("bindings.json"))?;
    fs::remove_file(journal).map_err(|e| e.to_string())
}

pub fn commit(
    dir: &Path,
    old_repo: &ProfileRepository,
    old_bindings: &BindingState,
    next_repo: &ProfileRepository,
    next_bindings: &BindingState,
) -> Result<(), String> {
    if dir.join("configuration-undo.json").exists() {
        return Err("配置恢复尚未完成，请重启 Blink 后重试".into());
    }
    write_json(
        &dir.join("configuration-undo.json"),
        &Undo {
            repository: old_repo.clone(),
            bindings: old_bindings.clone(),
        },
    )?;
    let result = next_repo
        .save(&dir.join("profiles.json"))
        .and_then(|()| next_bindings.save(&dir.join("bindings.json")))
        .and_then(|()| {
            fs::remove_file(dir.join("configuration-undo.json")).map_err(|e| e.to_string())
        });
    if let Err(error) = result {
        return match recover(dir) {
            Ok(()) => Err(error),
            Err(recovery) => Err(format!("{error}; RECOVERY_REQUIRED: {recovery}")),
        };
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn committed_pair_has_no_undo_and_survives_restart() {
        let dir = std::env::temp_dir().join(format!("blink-pair-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let mut old = ProfileRepository::default();
        old.ensure_system_profiles().unwrap();
        let mut bindings = BindingState::default();
        bindings.bind_profile(&old.profiles[0].id, "F10");
        old.save(&dir.join("profiles.json")).unwrap();
        bindings.save(&dir.join("bindings.json")).unwrap();
        let next = ProfileRepository::default();
        let empty = BindingState::default();
        commit(&dir, &old, &bindings, &next, &empty).unwrap();
        recover(&dir).unwrap();
        assert!(ProfileRepository::load(&dir.join("profiles.json"))
            .unwrap()
            .profiles
            .is_empty());
        assert!(
            BindingState::load(&dir.join("bindings.json"), &Default::default())
                .unwrap()
                .bindings
                .is_empty()
        );
        assert!(!dir.join("configuration-undo.json").exists());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn interrupted_pair_write_recovers_both_files() {
        let dir = std::env::temp_dir().join(format!("blink-undo-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let repository = ProfileRepository::default();
        let mut bindings = BindingState::default();
        bindings.bind_profile("old", "F10");
        write_json(
            &dir.join("configuration-undo.json"),
            &Undo {
                repository: repository.clone(),
                bindings: bindings.clone(),
            },
        )
        .unwrap();
        fs::write(dir.join("profiles.json"), "partial").unwrap();
        fs::write(dir.join("bindings.json"), "partial").unwrap();
        recover(&dir).unwrap();
        assert!(ProfileRepository::load(&dir.join("profiles.json")).is_ok());
        assert_eq!(
            BindingState::load(
                &dir.join("bindings.json"),
                &["old".into()].into_iter().collect()
            )
            .unwrap()
            .bindings,
            bindings.bindings
        );
        assert!(!dir.join("configuration-undo.json").exists());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn failed_second_write_retains_recovery_record_until_repair() {
        let dir = std::env::temp_dir().join(format!("blink-undo-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(dir.join("bindings.json")).unwrap();
        let repo = ProfileRepository::default();
        let bindings = BindingState::default();
        assert!(commit(&dir, &repo, &bindings, &repo, &bindings)
            .unwrap_err()
            .contains("RECOVERY_REQUIRED"));
        assert!(dir.join("configuration-undo.json").exists());
        fs::remove_dir(dir.join("bindings.json")).unwrap();
        recover(&dir).unwrap();
        assert!(!dir.join("configuration-undo.json").exists());
        fs::remove_dir_all(dir).unwrap();
    }
}
