use crate::profile::Profile;
use serde::{Deserialize, Serialize};
use std::{fs, path::Path, time::{SystemTime, UNIX_EPOCH}};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ProfileSource { System, External }

impl Default for ProfileSource { fn default() -> Self { Self::External } }

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeProfile { pub id: String, pub name: String, pub description: Option<String>, #[serde(default)] pub icon_id: Option<String>, #[serde(default)] pub source: ProfileSource, pub source_profile: Profile, pub source_binding_id: String, pub created_at: String }

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ProfileRepository { pub profiles: Vec<RuntimeProfile> }

impl ProfileRepository {
    pub fn load(path: &Path) -> Self { fs::read_to_string(path).ok().and_then(|data| serde_json::from_str(&data).ok()).unwrap_or_default() }
    pub fn save(&self, path: &Path) -> Result<(), String> { if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|error| error.to_string())?; } fs::write(path, serde_json::to_string_pretty(self).map_err(|error| error.to_string())?).map_err(|error| error.to_string()) }
    fn insert(&mut self, source_profile: Profile, source: ProfileSource, stable_ids: bool) -> Vec<RuntimeProfile> {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).expect("clock").as_millis();
        let inserted = source_profile.bindings.iter().enumerate().map(|(index, binding)| RuntimeProfile { id: if stable_ids { format!("system-{}", binding.id) } else { format!("rp-{now}-{index}-{}", self.profiles.len() + index) }, name: binding.name.clone(), description: binding.description.clone(), icon_id: None, source: source.clone(), source_profile: source_profile.clone(), source_binding_id: binding.id.clone(), created_at: now.to_string() }).collect::<Vec<_>>();
        self.profiles.extend(inserted.clone()); inserted
    }
    pub fn insert_import(&mut self, source_profile: Profile) -> Vec<RuntimeProfile> { self.insert(source_profile, ProfileSource::External, false) }
    pub fn ensure_system_profiles(&mut self) -> Result<bool, String> {
        let source_profile = Profile::from_json(include_str!("../fixtures/builtin-profile.json")).map_err(|error| error.to_string())?;
        let expected_ids = source_profile.bindings.iter().map(|binding| format!("system-{}", binding.id)).collect::<Vec<_>>();
        let existing = self.profiles.iter().map(|profile| profile.id.as_str()).collect::<std::collections::HashSet<_>>();
        if expected_ids.iter().all(|id| existing.contains(id.as_str())) { return Ok(false); }
        self.profiles.retain(|profile| !profile.id.starts_with("system-builtin-"));
        self.insert(source_profile, ProfileSource::System, true);
        Ok(true)
    }
    pub fn find(&self, id: &str) -> Option<&RuntimeProfile> { self.profiles.iter().find(|profile| profile.id == id) }
    pub fn rename(&mut self, id: &str, name: String) -> Result<(), String> { let profile = self.profiles.iter_mut().find(|profile| profile.id == id).ok_or("RuntimeProfile 不存在")?; let name = name.trim(); if name.is_empty() { return Err("名称不能为空".into()); } profile.name = name.into(); Ok(()) }
    pub fn set_icon(&mut self, id: &str, icon_id: String) -> Result<(), String> { let profile = self.profiles.iter_mut().find(|profile| profile.id == id).ok_or("RuntimeProfile 不存在")?; let icon_id = icon_id.trim(); if icon_id.is_empty() { return Err("图标不能为空".into()); } profile.icon_id = Some(icon_id.into()); Ok(()) }
    pub fn delete(&mut self, id: &str) -> Result<RuntimeProfile, String> {
        let index = self.profiles.iter().position(|profile| profile.id == id).ok_or("RuntimeProfile 不存在")?;
        if self.profiles[index].source == ProfileSource::System { return Err("系统内置 Profile 不支持删除".into()); }
        Ok(self.profiles.remove(index))
    }
    pub fn external_ids(&self, ids: &[String]) -> Vec<String> { ids.iter().filter(|id| self.find(id).is_some_and(|profile| profile.source == ProfileSource::External)).cloned().collect() }
}

#[cfg(test)]
mod tests {
    use super::ProfileRepository; use crate::profile::Profile;
    #[test]
    fn importing_same_fixture_twice_inserts_independent_profiles() {
        let fixture = include_str!("../../../packages/keyflow-contract/fixtures/profile-v1.2.example.json"); let profile = Profile::from_json(fixture).unwrap(); let mut repository = ProfileRepository::default();
        let first = repository.insert_import(profile.clone()); let second = repository.insert_import(profile);
        assert_eq!(repository.profiles.len(), first.len() + second.len()); assert_ne!(first[0].id, second[0].id);
    }

    #[test]
    fn system_profiles_are_seeded_once_and_cannot_be_deleted() {
        let mut repository = ProfileRepository::default();
        assert!(repository.ensure_system_profiles().unwrap());
        assert_eq!(repository.profiles.len(), 8);
        assert!(!repository.ensure_system_profiles().unwrap());
        assert!(repository.delete("system-builtin-copy").is_err());
    }
}
