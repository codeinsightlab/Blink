use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::Path,
};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PersistedBinding {
    pub runtime_profile_id: String,
    pub physical_input: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct BindingState {
    #[serde(default)]
    pub bindings: Vec<PersistedBinding>,
    #[serde(skip)]
    pub physical_to_profile: HashMap<String, String>,
    #[serde(skip)]
    pub profile_to_physical: HashMap<String, String>,
}

impl BindingState {
    pub fn load(path: &Path, profile_ids: &HashSet<String>) -> Self {
        let mut state: Self = fs::read_to_string(path)
            .ok()
            .and_then(|value| serde_json::from_str(&value).ok())
            .unwrap_or_default();
        state.rebuild(profile_ids);
        state
    }
    pub fn save(&self, path: &Path) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        fs::write(
            path,
            serde_json::to_string_pretty(self).map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())
    }
    pub fn rebuild(&mut self, profile_ids: &HashSet<String>) {
        self.bindings
            .retain(|binding| profile_ids.contains(&binding.runtime_profile_id));
        let persisted = self.bindings.clone();
        self.physical_to_profile.clear();
        self.profile_to_physical.clear();
        for binding in persisted {
            self.bind_profile(&binding.runtime_profile_id, &binding.physical_input);
        }
        self.sync_persisted();
    }
    pub fn bind_profile(&mut self, profile_id: &str, physical_input: &str) {
        if let Some(old_profile) = self.physical_to_profile.remove(physical_input) {
            self.profile_to_physical.remove(&old_profile);
        }
        if let Some(old_input) = self.profile_to_physical.remove(profile_id) {
            self.physical_to_profile.remove(&old_input);
        }
        self.physical_to_profile
            .insert(physical_input.into(), profile_id.into());
        self.profile_to_physical
            .insert(profile_id.into(), physical_input.into());
        self.sync_persisted();
    }
    pub fn unbind_profile(&mut self, profile_id: &str) {
        if let Some(input) = self.profile_to_physical.remove(profile_id) {
            self.physical_to_profile.remove(&input);
        }
        self.sync_persisted();
    }
    pub fn sync_persisted(&mut self) {
        self.bindings = self
            .profile_to_physical
            .iter()
            .map(|(runtime_profile_id, physical_input)| PersistedBinding {
                runtime_profile_id: runtime_profile_id.clone(),
                physical_input: physical_input.clone(),
            })
            .collect();
        self.bindings
            .sort_by(|a, b| a.runtime_profile_id.cmp(&b.runtime_profile_id));
    }
    pub fn consistent(&self) -> bool {
        self.physical_to_profile
            .iter()
            .all(|(input, id)| self.profile_to_physical.get(id) == Some(input))
            && self
                .profile_to_physical
                .iter()
                .all(|(id, input)| self.physical_to_profile.get(input) == Some(id))
    }
}

#[cfg(test)]
mod tests {
    use super::BindingState;
    #[test]
    fn last_binding_wins_and_rebind_releases_old_input() {
        let mut state = BindingState::default();
        state.bind_profile("A", "F11");
        state.bind_profile("B", "F12");
        state.bind_profile("B", "F11");
        assert_eq!(state.profile_to_physical.get("B"), Some(&"F11".to_string()));
        assert!(!state.profile_to_physical.contains_key("A"));
        assert!(!state.physical_to_profile.contains_key("F12"));
        assert!(state.consistent());
        state.unbind_profile("B");
        assert!(state.physical_to_profile.is_empty());
        assert!(state.consistent());
    }
}
