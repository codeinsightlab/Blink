use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ProfileError {
    #[error("INVALID_JSON: {0}")]
    InvalidJson(String),
    #[error("UNSUPPORTED_PROFILE_VERSION: 仅支持 Profile v2.0 / v2.1")]
    UnsupportedVersion,
    #[error("INVALID_PROFILE: {0}")]
    InvalidProfile(String),
    #[error("UNKNOWN_EXECUTION: {0}")]
    UnknownExecution(String),
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Profile {
    pub version: String,
    pub name: String,
    #[serde(
        default,
        deserialize_with = "deserialize_description",
        skip_serializing_if = "Option::is_none"
    )]
    pub description: Option<String>,
    pub actions: Vec<Action>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum Action {
    #[serde(rename = "OPEN_APP")]
    OpenApp {
        executions: HashMap<String, Execution>,
    },
    #[serde(rename = "TOGGLE_APP")]
    ToggleApp {
        executions: HashMap<String, Execution>,
    },
    #[serde(rename = "COMMAND")]
    Command {
        executions: HashMap<String, Execution>,
    },
    #[serde(rename = "OPEN_URL")]
    OpenUrl {
        executions: HashMap<String, Execution>,
    },
    #[serde(rename = "OPEN_FILE")]
    OpenFile {
        executions: HashMap<String, Execution>,
    },
    #[serde(rename = "OPEN_FOLDER")]
    OpenFolder {
        executions: HashMap<String, Execution>,
    },
    #[serde(rename = "SCRIPT")]
    Script {
        executions: HashMap<String, Execution>,
    },
}

impl Action {
    pub fn executions_mut(&mut self) -> &mut HashMap<String, Execution> {
        match self {
            Self::OpenApp { executions }
            | Self::ToggleApp { executions }
            | Self::Command { executions }
            | Self::OpenUrl { executions }
            | Self::OpenFile { executions }
            | Self::OpenFolder { executions }
            | Self::Script { executions } => executions,
        }
    }
    pub fn executions(&self) -> &HashMap<String, Execution> {
        match self {
            Self::OpenApp { executions }
            | Self::ToggleApp { executions }
            | Self::Command { executions }
            | Self::OpenUrl { executions }
            | Self::OpenFile { executions }
            | Self::OpenFolder { executions }
            | Self::Script { executions } => executions,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum Execution {
    #[serde(rename = "LAUNCH_APP")]
    LaunchApp {
        #[serde(
            rename = "executableNames",
            default,
            skip_serializing_if = "Vec::is_empty"
        )]
        executable_names: Vec<String>,
        #[serde(rename = "bundleIds", default, skip_serializing_if = "Vec::is_empty")]
        bundle_ids: Vec<String>,
        #[serde(rename = "appNames", default, skip_serializing_if = "Vec::is_empty")]
        app_names: Vec<String>,
        #[serde(rename = "knownPaths", default, skip_serializing_if = "Vec::is_empty")]
        known_paths: Vec<String>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        aliases: Vec<String>,
    },
    #[serde(rename = "TOGGLE_APP")]
    ToggleApp {
        #[serde(rename = "bundleIds", default, skip_serializing_if = "Vec::is_empty")]
        bundle_ids: Vec<String>,
        #[serde(rename = "knownPaths", default, skip_serializing_if = "Vec::is_empty")]
        known_paths: Vec<String>,
    },
    #[serde(rename = "SEND_HOTKEY")]
    SendHotkey { keys: Vec<String> },
    #[serde(rename = "OPEN_URL")]
    OpenUrl { url: String },
    #[serde(rename = "OPEN_FILE")]
    OpenFile { path: String },
    #[serde(rename = "OPEN_FOLDER")]
    OpenFolder { path: String },
    #[serde(rename = "RUN_SCRIPT")]
    RunScript { path: String },
}

pub fn valid_http_url(value: &str) -> bool {
    if value.chars().any(|c| {
        c == '\\' || c <= '\u{1f}' || c == '\u{7f}' || trim_protocol_text(&c.to_string()).is_empty()
    }) {
        return false;
    }
    let Some(rest) = value
        .strip_prefix("https://")
        .or_else(|| value.strip_prefix("http://"))
    else {
        return false;
    };
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    let parts: Vec<_> = authority.split(':').collect();
    parts.len() <= 2
        && parts[0].starts_with(|c: char| c.is_ascii_alphanumeric())
        && parts[0]
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
        && (parts.len() == 1
            || (!parts[1].is_empty()
                && parts[1].bytes().all(|c| c.is_ascii_digit())
                && parts[1].parse::<u16>().is_ok_and(|port| port > 0)))
}

pub fn valid_target_path(platform: &str, path: &str) -> bool {
    if path.is_empty() || path.chars().any(|c| c <= '\u{1f}' || c == '\u{7f}') {
        return false;
    }
    if platform == "macos" {
        return path.starts_with('/');
    }
    let bytes = path.as_bytes();
    (bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/'))
        || path.strip_prefix("\\\\").is_some_and(|rest| {
            let mut parts = rest.split('\\');
            parts.next().is_some_and(|s| !s.is_empty())
                && parts.next().is_some_and(|s| !s.is_empty())
        })
}

fn valid_windows_toggle_target(path: &str) -> bool {
    let normalized = path.replace('/', "\\").to_ascii_lowercase();
    valid_target_path("windows", path)
        && normalized.ends_with(".exe")
        && !normalized.contains("\\program files\\windowsapps\\")
        && !normalized.contains("\\appdata\\local\\microsoft\\windowsapps\\")
}

impl Profile {
    pub fn executions_for(&self, platform: &str) -> Result<Vec<Execution>, String> {
        self.actions
            .iter()
            .map(|action| {
                action
                    .executions()
                    .get(platform)
                    .cloned()
                    .ok_or_else(|| "CURRENT_PLATFORM_NOT_CONFIGURED".into())
            })
            .collect()
    }

    pub fn validate(mut self) -> Result<Self, ProfileError> {
        if self.version != "2.0" && self.version != "2.1" {
            return Err(ProfileError::UnsupportedVersion);
        }
        self.name = trim_protocol_text(&self.name).into();
        self.description = self
            .description
            .map(|value| trim_protocol_text(&value).into());
        if self.name.is_empty() {
            return Err(ProfileError::InvalidProfile("name 不能为空".into()));
        }
        if self
            .description
            .as_ref()
            .is_some_and(|value| value.is_empty())
        {
            return Err(ProfileError::InvalidProfile(
                "description 不能为空字符串".into(),
            ));
        }
        if self.actions.is_empty() {
            return Err(ProfileError::InvalidProfile("actions 不能为空".into()));
        }
        for action in &self.actions {
            if self.version == "2.0"
                && !matches!(action, Action::OpenApp { .. } | Action::Command { .. })
            {
                return Err(ProfileError::InvalidProfile(
                    "新增动作需要 Profile v2.1".into(),
                ));
            }
            let executions = action.executions();
            if executions.is_empty()
                || !executions
                    .keys()
                    .all(|key| key == "windows" || key == "macos")
            {
                return Err(ProfileError::InvalidProfile(
                    "Action 至少需要一个合法平台实现".into(),
                ));
            }
            for (platform, execution) in executions {
                match (action, execution) {
                    (
                        Action::ToggleApp { .. },
                        Execution::ToggleApp {
                            bundle_ids,
                            known_paths,
                        },
                    ) if platform == "macos"
                        && bundle_ids.len() <= 1
                        && known_paths.len() <= 1
                        && !(bundle_ids.is_empty() && known_paths.is_empty())
                        && bundle_ids.iter().all(|s| {
                            !s.is_empty()
                                && trim_protocol_text(s) == s
                                && !s.chars().any(|c| c <= '\u{1f}' || c == '\u{7f}')
                        })
                        && known_paths.iter().all(|s| {
                            valid_target_path("macos", s)
                                && s.to_ascii_lowercase().ends_with(".app")
                        }) => {}
                    (
                        Action::ToggleApp { .. },
                        Execution::ToggleApp {
                            bundle_ids,
                            known_paths,
                        },
                    ) if platform == "windows"
                        && bundle_ids.is_empty()
                        && known_paths.len() == 1
                        && valid_windows_toggle_target(&known_paths[0]) => {}
                    (Action::OpenUrl { .. }, Execution::OpenUrl { url }) if valid_http_url(url) => {
                    }
                    (Action::OpenFile { .. }, Execution::OpenFile { path })
                    | (Action::OpenFolder { .. }, Execution::OpenFolder { path })
                        if valid_target_path(platform, path) => {}
                    (Action::Script { .. }, Execution::RunScript { path })
                        if valid_target_path(platform, path)
                            && path.to_ascii_lowercase().ends_with(if platform == "macos" {
                                ".sh"
                            } else {
                                ".ps1"
                            }) => {}
                    (
                        Action::OpenApp { .. },
                        Execution::LaunchApp {
                            executable_names,
                            bundle_ids,
                            app_names,
                            known_paths,
                            aliases,
                        },
                    ) => {
                        if executable_names
                            .iter()
                            .chain(bundle_ids)
                            .chain(app_names)
                            .chain(known_paths)
                            .chain(aliases)
                            .next()
                            .is_none()
                        {
                            return Err(ProfileError::InvalidProfile(
                                "LAUNCH_APP 至少需要一个应用定位线索".into(),
                            ));
                        }
                        if executable_names
                            .iter()
                            .chain(bundle_ids)
                            .chain(app_names)
                            .chain(known_paths)
                            .chain(aliases)
                            .any(|value| trim_protocol_text(value).is_empty())
                        {
                            return Err(ProfileError::InvalidProfile(
                                "LAUNCH_APP 的每个定位线索必须为非空字符串".into(),
                            ));
                        }
                    }
                    (Action::Command { .. }, Execution::SendHotkey { keys })
                        if !keys.is_empty()
                            && keys.iter().all(|key| valid_key_code(key))
                            && keys.iter().collect::<std::collections::HashSet<_>>().len()
                                == keys.len() => {}
                    (Action::Command { .. }, Execution::SendHotkey { .. }) => {
                        return Err(ProfileError::InvalidProfile(
                            "SEND_HOTKEY 的 keys 必须非空、合法且不重复".into(),
                        ))
                    }
                    _ => {
                        return Err(ProfileError::InvalidProfile(
                            "Action.type 与 Execution.type 不匹配".into(),
                        ))
                    }
                }
            }
        }
        for action in &mut self.actions {
            let (Action::OpenApp { executions }
            | Action::ToggleApp { executions }
            | Action::Command { executions }
            | Action::OpenUrl { executions }
            | Action::OpenFile { executions }
            | Action::OpenFolder { executions }
            | Action::Script { executions }) = action;
            for execution in executions.values_mut() {
                if let Execution::LaunchApp {
                    executable_names,
                    bundle_ids,
                    app_names,
                    known_paths,
                    aliases,
                } = execution
                {
                    for value in executable_names
                        .iter_mut()
                        .chain(bundle_ids)
                        .chain(app_names)
                        .chain(known_paths)
                        .chain(aliases)
                    {
                        *value = trim_protocol_text(value).into();
                    }
                }
            }
        }
        Ok(self)
    }

    pub fn from_json(input: &str) -> Result<Self, ProfileError> {
        serde_json::from_str::<Profile>(input)
            .map_err(map_json_error)?
            .validate()
    }

    pub fn many_from_json(input: &str) -> Result<Vec<Self>, ProfileError> {
        let value: serde_json::Value = serde_json::from_str(input)
            .map_err(|error| ProfileError::InvalidJson(error.to_string()))?;
        if value.is_array() {
            let profiles = serde_json::from_value::<Vec<Profile>>(value).map_err(map_json_error)?;
            profiles.into_iter().map(Profile::validate).collect()
        } else {
            Ok(vec![serde_json::from_value::<Profile>(value)
                .map_err(map_json_error)?
                .validate()?])
        }
    }

    pub fn many_from_file(path: &str) -> Result<Vec<Self>, ProfileError> {
        let content = fs::read_to_string(path)
            .map_err(|error| ProfileError::InvalidProfile(format!("无法读取文件：{error}")))?;
        Self::many_from_json(&content)
    }
}

fn deserialize_description<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    // Missing uses default; a present value must be a string, never null.
    String::deserialize(deserializer).map(Some)
}

fn trim_protocol_text(value: &str) -> &str {
    // Match JavaScript String.trim (used by Zod), not Rust's broader Unicode whitespace set.
    value.trim_matches(|character| {
        matches!(character, '\u{0009}'..='\u{000d}' | '\u{0020}' | '\u{00a0}' | '\u{1680}'
            | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}'
            | '\u{205f}' | '\u{3000}' | '\u{feff}')
    })
}

fn valid_key_code(value: &str) -> bool {
    matches!(
        value,
        "CTRL"
            | "META"
            | "ALT"
            | "SHIFT"
            | "ENTER"
            | "ESCAPE"
            | "TAB"
            | "SPACE"
            | "BACKSPACE"
            | "DELETE"
            | "UP"
            | "DOWN"
            | "LEFT"
            | "RIGHT"
            | "-"
            | "="
            | "BACKQUOTE"
            | "BRACKETLEFT"
            | "BRACKETRIGHT"
            | "SEMICOLON"
            | "QUOTE"
            | "COMMA"
            | "PERIOD"
            | "SLASH"
            | "F1"
            | "F2"
            | "F3"
            | "F4"
            | "F5"
            | "F6"
            | "F7"
            | "F8"
            | "F9"
            | "F10"
            | "F11"
            | "F12"
    ) || value.len() == 1
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() && !character.is_ascii_lowercase())
}

fn map_json_error(error: serde_json::Error) -> ProfileError {
    let message = error.to_string();
    if message.contains("unknown variant") && message.contains("type") {
        ProfileError::UnknownExecution(message)
    } else {
        ProfileError::InvalidJson(message)
    }
}

#[cfg(test)]
mod tests {
    use super::{valid_windows_toggle_target, Action, Execution, Profile};

    #[test]
    fn windows_toggle_accepts_only_traditional_executables() {
        assert!(valid_windows_toggle_target(
            "C:\\Program Files\\Example\\Example.exe"
        ));
        assert!(!valid_windows_toggle_target(
            "C:\\Program Files\\WindowsApps\\Example.exe"
        ));
        assert!(!valid_windows_toggle_target(
            "C:\\Users\\a\\AppData\\Local\\Microsoft\\WindowsApps\\Example.exe"
        ));
        assert!(!valid_windows_toggle_target("C:\\Example\\launcher.cmd"));
    }

    #[test]
    fn parses_handwritten_v2_profile_without_registry_ids() {
        let fixture =
            include_str!("../../../packages/blink-contract/fixtures/profile-v2.0.example.json");
        let profile = Profile::from_json(fixture).expect("v2 fixture must parse");
        assert_eq!(profile.version, "2.0");
        assert_eq!(profile.name, "打开工作台");
        assert_eq!(profile.actions.len(), 2);
        assert!(matches!(profile.actions[0], Action::OpenApp { .. }));
    }

    #[test]
    fn accepts_macos_only_profile_and_rejects_action_execution_mismatch() {
        let mac_only = r#"{"version":"2.0","name":"Copy","actions":[{"type":"COMMAND","executions":{"macos":{"type":"SEND_HOTKEY","keys":["META","C"]}}}]}"#;
        let profile = Profile::from_json(mac_only).unwrap();
        assert_eq!(
            profile.executions_for("windows").unwrap_err(),
            "CURRENT_PLATFORM_NOT_CONFIGURED"
        );
        let mismatch = r#"{"version":"2.0","name":"Bad","actions":[{"type":"COMMAND","executions":{"macos":{"type":"LAUNCH_APP","appNames":["Bad.app"]}}}]}"#;
        assert!(Profile::from_json(mismatch).is_err());
    }

    #[test]
    fn preserves_multi_action_execution_order() {
        let fixture =
            include_str!("../../../packages/blink-contract/fixtures/profile-v2.0.example.json");
        let profile = Profile::from_json(fixture).unwrap();
        let executions = profile.executions_for("macos").unwrap();
        assert!(matches!(executions[0], Execution::LaunchApp { .. }));
        assert!(matches!(executions[1], Execution::SendHotkey { .. }));
    }
}
