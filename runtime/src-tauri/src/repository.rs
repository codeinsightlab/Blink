use crate::profile::Profile;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ProfileSource {
    System,
    External,
}

impl Default for ProfileSource {
    fn default() -> Self {
        Self::External
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RuntimeProfile {
    pub id: String,
    pub profile: Profile,
    #[serde(default)]
    pub local_name_override: Option<String>,
    #[serde(default)]
    pub icon_id: Option<String>,
    #[serde(default)]
    pub source: ProfileSource,
}

impl RuntimeProfile {
    pub fn display_name(&self) -> &str {
        self.local_name_override
            .as_deref()
            .unwrap_or(&self.profile.name)
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ProfileRepository {
    pub profiles: Vec<RuntimeProfile>,
}

impl ProfileRepository {
    pub fn change<T>(
        &mut self,
        path: &Path,
        update: impl FnOnce(&mut Self) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut candidate = self.clone();
        let value = update(&mut candidate)?;
        candidate.save(path)?;
        *self = candidate;
        Ok(value)
    }

    pub fn load(path: &Path) -> Result<Self, String> {
        let data = match fs::read_to_string(path) {
            Ok(data) => data,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Self::default())
            }
            Err(error) => return Err(format!("REPOSITORY_RESTORE_FAILED: {error}")),
        };
        let mut repository: Self = serde_json::from_str(&data)
            .map_err(|error| format!("REPOSITORY_RESTORE_FAILED: {error}"))?;
        for item in &mut repository.profiles {
            item.profile = item
                .profile
                .clone()
                .validate()
                .map_err(|error| format!("REPOSITORY_RESTORE_FAILED: {}: {error}", item.id))?;
        }
        Ok(repository)
    }
    pub fn save(&self, path: &Path) -> Result<(), String> {
        let mut validated = self.clone();
        for item in &mut validated.profiles {
            item.profile = item
                .profile
                .clone()
                .validate()
                .map_err(|error| error.to_string())?;
        }
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let temporary = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
        let result = (|| {
            let mut file = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)
                .map_err(|e| e.to_string())?;
            std::io::Write::write_all(
                &mut file,
                &serde_json::to_vec_pretty(&validated).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
            file.sync_all().map_err(|e| e.to_string())?;
            fs::rename(&temporary, path).map_err(|e| e.to_string())
        })();
        if result.is_err() {
            let _ = fs::remove_file(temporary);
        }
        result
    }
    fn insert(
        &mut self,
        profile: Profile,
        source: ProfileSource,
        stable_id: Option<String>,
    ) -> Result<RuntimeProfile, String> {
        let profile = profile.validate().map_err(|error| error.to_string())?;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_millis();
        let item = RuntimeProfile {
            id: stable_id.unwrap_or_else(|| format!("rp-{now}-{}", self.profiles.len())),
            profile,
            local_name_override: None,
            icon_id: None,
            source,
        };
        self.profiles.push(item.clone());
        Ok(item)
    }
    pub fn insert_import(&mut self, profile: Profile) -> Result<RuntimeProfile, String> {
        self.insert(profile, ProfileSource::External, None)
    }
    pub fn replace_profile(
        &mut self,
        id: &str,
        profile: Profile,
        name: &str,
    ) -> Result<(), String> {
        let item = self
            .profiles
            .iter_mut()
            .find(|item| item.id == id)
            .ok_or("RuntimeProfile 不存在")?;
        if item.source == ProfileSource::System {
            return Err("系统命令不支持编辑".into());
        }
        let name = name.trim();
        if name.is_empty() {
            return Err("命令名称不能为空".into());
        }
        let profile = profile.validate().map_err(|error| error.to_string())?;
        if name != item.display_name() {
            item.local_name_override = (name != item.profile.name).then(|| name.to_owned());
        }
        item.profile = profile;
        Ok(())
    }
    pub fn ensure_system_profiles(&mut self) -> Result<bool, String> {
        const IDS: [&str; 2] = ["copy", "paste"];
        let profiles = Profile::many_from_json(include_str!("../fixtures/builtin-profiles.json"))
            .map_err(|error| error.to_string())?;
        if profiles.len() != IDS.len() {
            return Err("builtin Profile 数量不正确".into());
        }
        let expected_ids = IDS.map(|id| format!("system-builtin-{id}"));
        let existing = self
            .profiles
            .iter()
            .map(|profile| profile.id.as_str())
            .collect::<std::collections::HashSet<_>>();
        if expected_ids.iter().all(|id| existing.contains(id.as_str())) {
            return Ok(false);
        }
        for (profile, id) in profiles.into_iter().zip(expected_ids) {
            if self.find(&id).is_none() {
                self.insert(profile, ProfileSource::System, Some(id))?;
            }
        }
        Ok(true)
    }
    pub fn find(&self, id: &str) -> Option<&RuntimeProfile> {
        self.profiles.iter().find(|profile| profile.id == id)
    }
    pub fn rename(&mut self, id: &str, name: String) -> Result<(), String> {
        let profile = self
            .profiles
            .iter_mut()
            .find(|profile| profile.id == id)
            .ok_or("RuntimeProfile 不存在")?;
        let name = name.trim();
        if name.is_empty() {
            return Err("名称不能为空".into());
        }
        profile.local_name_override = Some(name.into());
        Ok(())
    }
    pub fn set_icon(&mut self, id: &str, icon_id: String) -> Result<(), String> {
        let profile = self
            .profiles
            .iter_mut()
            .find(|profile| profile.id == id)
            .ok_or("RuntimeProfile 不存在")?;
        let icon_id = icon_id.trim();
        if icon_id.is_empty() {
            return Err("图标不能为空".into());
        }
        profile.icon_id = Some(icon_id.into());
        Ok(())
    }
    pub fn delete(&mut self, id: &str) -> Result<RuntimeProfile, String> {
        let index = self
            .profiles
            .iter()
            .position(|profile| profile.id == id)
            .ok_or("RuntimeProfile 不存在")?;
        if self.profiles[index].source == ProfileSource::System {
            return Err("系统内置 Profile 不支持删除".into());
        }
        Ok(self.profiles.remove(index))
    }
    pub fn external_ids(&self, ids: &[String]) -> Vec<String> {
        ids.iter()
            .filter(|id| {
                self.find(id)
                    .is_some_and(|profile| profile.source == ProfileSource::External)
            })
            .cloned()
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::ProfileRepository;
    use crate::profile::Profile;
    use std::{
        fs,
        path::Path,
        sync::atomic::{AtomicU64, Ordering},
    };

    fn with_repository_file(test: impl FnOnce(&Path)) {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "blink-repository-test-{}-{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            NEXT.fetch_add(1, Ordering::Relaxed),
        ));
        test(&path);
        if path.exists() {
            fs::remove_file(path).unwrap();
        }
    }

    fn copy_profile() -> Profile {
        Profile::from_json(r#"{"version":"2.0","name":"Copy","actions":[{"type":"COMMAND","executions":{"macos":{"type":"SEND_HOTKEY","keys":["META","C"]}}}]}"#).unwrap()
    }

    #[test]
    fn failed_changes_preserve_memory_and_saved_profiles() {
        let dir = std::env::temp_dir().join(format!("blink-change-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("profiles.json");
        let blocked = dir.join("blocked.json");
        fs::create_dir(&blocked).unwrap();
        let mut repository = ProfileRepository::default();
        let item = repository.insert_import(copy_profile()).unwrap();
        repository.save(&file).unwrap();
        let original = fs::read(&file).unwrap();
        assert!(repository
            .change(&blocked, |r| r.rename(&item.id, "Changed".into()))
            .is_err());
        assert_eq!(repository.find(&item.id).unwrap().display_name(), "Copy");
        assert!(repository
            .change(&blocked, |r| r.insert_import(copy_profile()))
            .is_err());
        assert_eq!(repository.profiles.len(), 1);
        assert!(repository
            .change(&file, |r| -> Result<(), String> {
                r.insert_import(copy_profile())?;
                Err("validation failed".into())
            })
            .is_err());
        assert_eq!(repository.profiles.len(), 1);
        assert_eq!(fs::read(&file).unwrap(), original);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn rejects_legacy_runtime_record_without_overwriting_it() {
        with_repository_file(|path| {
            let original = r#"{"profiles":[{"id":"system-builtin-copy","name":"Copy","sourceProfile":{"version":"1.2","bindings":[]}}]}"#;
            fs::write(path, original).unwrap();
            let error = ProfileRepository::load(path).unwrap_err();
            assert!(error.contains("REPOSITORY_RESTORE_FAILED"));
            assert!(error.contains("unknown field `name`"));
            assert_eq!(fs::read_to_string(path).unwrap(), original);
        });
    }

    #[test]
    fn restores_valid_profiles_and_local_state() {
        with_repository_file(|path| {
            assert!(ProfileRepository::load(path).unwrap().profiles.is_empty());
            let mut repository = ProfileRepository::default();
            let id = repository.insert_import(copy_profile()).unwrap().id;
            repository.rename(&id, "My Copy".into()).unwrap();
            repository.set_icon(&id, "copy".into()).unwrap();
            repository.save(path).unwrap();
            let restored = ProfileRepository::load(path).unwrap();
            let item = restored.find(&id).unwrap();
            assert_eq!(item.display_name(), "My Copy");
            assert_eq!(item.profile.name, "Copy");
            assert_eq!(item.icon_id.as_deref(), Some("copy"));
            let persisted: serde_json::Value =
                serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap();
            assert!(persisted["profiles"][0]["profile"]
                .get("description")
                .is_none());
        });
    }

    fn assert_restore_rejected(profile: serde_json::Value) {
        with_repository_file(|path| {
            let mut repository = ProfileRepository::default();
            repository.insert_import(copy_profile()).unwrap();
            repository.insert_import(copy_profile()).unwrap();
            let mut persisted = serde_json::to_value(repository).unwrap();
            persisted["profiles"][1]["profile"] = profile;
            let original = serde_json::to_string(&persisted).unwrap();
            fs::write(path, &original).unwrap();
            let error = ProfileRepository::load(path).unwrap_err();
            assert!(error.contains("REPOSITORY_RESTORE_FAILED"));
            assert_eq!(fs::read_to_string(path).unwrap(), original);
        });
    }

    #[test]
    fn rejects_invalid_version_on_restore() {
        let mut profile = serde_json::to_value(copy_profile()).unwrap();
        profile["version"] = serde_json::json!("1.2");
        assert_restore_rejected(profile);
    }

    #[test]
    fn rejects_invalid_payload_on_restore() {
        let mut profile = serde_json::to_value(copy_profile()).unwrap();
        profile["actions"] = serde_json::json!([{
            "type": "OPEN_APP", "executions": {"macos": {"type": "LAUNCH_APP", "appNames": [""]}}
        }]);
        assert_restore_rejected(profile);
    }

    #[test]
    fn restore_rejects_every_invalid_protocol_matrix_case() {
        let cases: Vec<serde_json::Value> = serde_json::from_str(include_str!(
            "../../../packages/blink-contract/fixtures/profile-v2.parity.json"
        ))
        .unwrap();
        for case in cases {
            if case["valid"] == false {
                assert_restore_rejected(case["profile"].clone());
            }
        }
    }

    #[test]
    fn insertion_and_save_reject_unvalidated_profiles() {
        with_repository_file(|path| {
            let mut repository = ProfileRepository::default();
            let mut invalid = copy_profile();
            invalid.version = "1.2".into();
            assert!(repository.insert_import(invalid).is_err());
            assert!(repository.profiles.is_empty());
            repository.insert_import(copy_profile()).unwrap();
            repository.save(path).unwrap();
            let original = fs::read_to_string(path).unwrap();
            repository.profiles[0].profile.version = "1.2".into();
            assert!(repository.save(path).is_err());
            assert_eq!(fs::read_to_string(path).unwrap(), original);
        });
    }

    #[test]
    fn duplicate_import_inserts_distinct_runtime_instances() {
        let fixture =
            include_str!("../../../packages/blink-contract/fixtures/profile-v2.0.example.json");
        let profile = Profile::from_json(fixture).unwrap();
        let mut repository = ProfileRepository::default();
        let first = repository.insert_import(profile.clone()).unwrap();
        let second = repository.insert_import(profile).unwrap();
        assert_eq!(repository.profiles.len(), 2);
        assert_ne!(first.id, second.id);
    }

    #[test]
    fn local_rename_preserves_portable_profile_name() {
        let fixture =
            include_str!("../../../packages/blink-contract/fixtures/profile-v2.0.example.json");
        let profile = Profile::from_json(fixture).unwrap();
        let mut repository = ProfileRepository::default();
        let id = repository.insert_import(profile).unwrap().id;
        repository.rename(&id, "我的复制".into()).unwrap();
        let stored = repository.find(&id).unwrap();
        assert_eq!(stored.display_name(), "我的复制");
        assert_eq!(stored.profile.name, "打开工作台");
    }

    #[test]
    fn system_profiles_are_seeded_once_and_cannot_be_deleted() {
        let mut repository = ProfileRepository::default();
        assert!(repository.ensure_system_profiles().unwrap());
        assert_eq!(repository.profiles.len(), 2);
        assert!(!repository.ensure_system_profiles().unwrap());
        assert!(repository.delete("system-builtin-copy").is_err());
    }

    #[test]
    fn edit_preserves_identity_metadata_other_actions_and_platforms() {
        let mut repository = ProfileRepository::default();
        let mut profile = copy_profile();
        profile.actions[0].executions_mut().insert(
            "windows".into(),
            crate::profile::Execution::SendHotkey {
                keys: vec!["CTRL".into(), "C".into()],
            },
        );
        profile.actions.push(profile.actions[0].clone());
        let id = repository.insert_import(profile).unwrap().id;
        repository.set_icon(&id, "star".into()).unwrap();
        let before = serde_json::to_value(repository.find(&id).unwrap()).unwrap();
        let mut replacement = repository.find(&id).unwrap().profile.clone();
        replacement.actions[0].executions_mut().insert(
            "macos".into(),
            crate::profile::Execution::SendHotkey {
                keys: vec!["META".into(), "V".into()],
            },
        );
        repository
            .replace_profile(&id, replacement, "My Paste")
            .unwrap();
        let after = serde_json::to_value(repository.find(&id).unwrap()).unwrap();
        assert_eq!(after["id"], before["id"]);
        assert_eq!(after["iconId"], before["iconId"]);
        assert_eq!(after["source"], before["source"]);
        assert_eq!(after["profile"]["name"], before["profile"]["name"]);
        assert_eq!(
            after["profile"]["actions"][1],
            before["profile"]["actions"][1]
        );
        assert_eq!(
            after["profile"]["actions"][0]["executions"]["windows"],
            before["profile"]["actions"][0]["executions"]["windows"]
        );
        assert_eq!(
            after["profile"]["actions"][0]["executions"]["macos"]["keys"],
            serde_json::json!(["META", "V"])
        );
        assert_eq!(after["localNameOverride"], "My Paste");
        with_repository_file(|path| {
            repository.save(path).unwrap();
            assert_eq!(
                serde_json::to_value(ProfileRepository::load(path).unwrap().find(&id).unwrap())
                    .unwrap(),
                after
            );
        });
        let mut invalid = copy_profile();
        invalid.actions[0].executions_mut().insert(
            "macos".into(),
            crate::profile::Execution::OpenUrl {
                url: "https://example.com".into(),
            },
        );
        assert!(repository.replace_profile(&id, invalid, "Invalid").is_err());
        assert!(repository
            .replace_profile("missing", copy_profile(), "Invalid")
            .is_err());
        assert_eq!(
            serde_json::to_value(repository.find(&id).unwrap()).unwrap(),
            after
        );
        repository.ensure_system_profiles().unwrap();
        assert!(repository
            .replace_profile("system-builtin-copy", copy_profile(), "Invalid")
            .is_err());
    }

    #[test]
    fn new_builtins_preserve_existing_local_state() {
        let mut repository = ProfileRepository::default();
        repository.ensure_system_profiles().unwrap();
        repository.profiles.truncate(1);
        repository
            .rename("system-builtin-copy", "My Copy".into())
            .unwrap();
        repository
            .set_icon("system-builtin-copy", "star".into())
            .unwrap();
        assert!(repository.ensure_system_profiles().unwrap());
        assert_eq!(repository.profiles.len(), 2);
        let copy = repository.find("system-builtin-copy").unwrap();
        assert_eq!(copy.display_name(), "My Copy");
        assert_eq!(copy.icon_id.as_deref(), Some("star"));
    }
}
