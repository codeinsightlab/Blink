use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ProfileError {
    #[error("INVALID_JSON: {0}")]
    InvalidJson(String),
    #[error("UNSUPPORTED_PROFILE_VERSION: 仅支持 Profile v1.2")]
    UnsupportedVersion,
    #[error("INVALID_PROFILE: {0}")]
    InvalidProfile(String),
    #[error("UNKNOWN_EXECUTION: {0}")]
    UnknownExecution(String),
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile { pub version: String, pub id: String, pub name: String, pub bindings: Vec<ProfileBinding>, pub created_at: String, pub updated_at: String }

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ProfileBinding { pub id: String, pub slot: String, pub name: String, pub description: Option<String>, pub actions: Vec<Action> }

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Action { pub executions: HashMap<String, Execution> }

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type")]
pub enum Execution {
    #[serde(rename = "LAUNCH_APP")]
    LaunchApp { #[serde(rename = "executableNames", default)] executable_names: Vec<String>, #[serde(rename = "bundleIds", default)] bundle_ids: Vec<String>, #[serde(rename = "appNames", default)] app_names: Vec<String>, #[serde(rename = "knownPaths", default)] known_paths: Vec<String>, #[serde(default)] aliases: Vec<String> },
    #[serde(rename = "SEND_HOTKEY")]
    SendHotkey { keys: Vec<String> },
}

impl Profile {
    pub fn from_json(input: &str) -> Result<Self, ProfileError> {
        let profile: Profile = serde_json::from_str(input).map_err(|error| {
            let message = error.to_string();
            if message.contains("unknown variant") && message.contains("type") { ProfileError::UnknownExecution(message) } else { ProfileError::InvalidJson(message) }
        })?;
        if profile.version != "1.2" { return Err(ProfileError::UnsupportedVersion); }
        if profile.id.trim().is_empty() || profile.name.trim().is_empty() { return Err(ProfileError::InvalidProfile("id 和 name 不能为空".into())); }
        if profile.bindings.iter().any(|binding| binding.slot.trim().is_empty() || binding.name.trim().is_empty()) { return Err(ProfileError::InvalidProfile("Slot 和功能名称不能为空".into())); }
        for action in profile.bindings.iter().flat_map(|binding| &binding.actions) {
            for execution in action.executions.values() {
                match execution {
                    Execution::LaunchApp { executable_names, bundle_ids, app_names, known_paths, aliases } if executable_names.is_empty() && bundle_ids.is_empty() && app_names.is_empty() && known_paths.is_empty() && aliases.is_empty() => return Err(ProfileError::InvalidProfile("LAUNCH_APP 至少需要一个应用定位线索".into())),
                    Execution::SendHotkey { keys } if keys.is_empty() => return Err(ProfileError::InvalidProfile("SEND_HOTKEY 的 keys 不能为空".into())),
                    _ => {}
                }
            }
        }
        Ok(profile)
    }

    pub fn from_file(path: &str) -> Result<Self, ProfileError> {
        let content = fs::read_to_string(path).map_err(|error| ProfileError::InvalidProfile(format!("无法读取文件：{error}")))?;
        Self::from_json(&content)
    }
}

#[cfg(test)]
mod tests {
    use super::Profile;
    #[test]
    fn parses_contract_v1_2_fixture() {
        let fixture = include_str!("../../../packages/keyflow-contract/fixtures/profile-v1.2.example.json");
        let profile = Profile::from_json(fixture).expect("v1.2 fixture must parse");
        assert_eq!(profile.version, "1.2");
        assert_eq!(profile.bindings[0].slot, "KEY_1");
    }
}
