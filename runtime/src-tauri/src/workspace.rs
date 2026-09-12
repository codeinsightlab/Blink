use crate::{
    execution,
    profile::{Action, Execution, Profile},
};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path, sync::Arc};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkspaceItem {
    pub id: String,
    pub action: Action,
    pub enabled: bool,
    pub order: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub items: Vec<WorkspaceItem>,
}

fn action_type(action: &Action) -> &'static str {
    match action {
        Action::OpenApp { .. } => "OPEN_APP",
        Action::OpenUrl { .. } => "OPEN_URL",
        Action::OpenFile { .. } => "OPEN_FILE",
        Action::OpenFolder { .. } => "OPEN_FOLDER",
        Action::Script { .. } => "SCRIPT",
        Action::ToggleApp { .. } => "TOGGLE_APP",
        Action::Command { .. } => "SEND_HOTKEY",
    }
}
fn workspace_action_allowed(action: &Action) -> bool {
    matches!(
        action,
        Action::OpenApp { .. }
            | Action::OpenUrl { .. }
            | Action::OpenFile { .. }
            | Action::OpenFolder { .. }
            | Action::Script { .. }
    )
}

impl Workspace {
    fn validate(mut self) -> Result<Self, String> {
        self.id = self.id.trim().to_owned();
        self.name = self.name.trim().to_owned();
        if self.id.is_empty() || self.name.is_empty() || self.items.is_empty() {
            return Err("Workspace 必须包含 id、名称和至少一个动作".into());
        }
        let mut ids = std::collections::HashSet::new();
        for item in &mut self.items {
            item.id = item.id.trim().to_owned();
            if item.id.is_empty() || !ids.insert(item.id.clone()) {
                return Err("Workspace Item 必须具有唯一 id".into());
            }
            if !workspace_action_allowed(&item.action) {
                return Err(format!(
                    "WORKSPACE_ACTION_NOT_ALLOWED: {}",
                    action_type(&item.action)
                ));
            }
            let validated = Profile {
                version: "2.1".into(),
                name: "Workspace Item".into(),
                description: None,
                actions: vec![item.action.clone()],
            }
            .validate()
            .map_err(|error| error.to_string())?;
            item.action = validated.actions.into_iter().next().expect("one action");
        }
        Ok(self)
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkspaceRepository {
    #[serde(default)]
    pub workspaces: Vec<Workspace>,
}

impl WorkspaceRepository {
    pub fn load(path: &Path) -> Result<Self, String> {
        let data = match fs::read(path) {
            Ok(data) => data,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Self::default())
            }
            Err(error) => return Err(format!("WORKSPACE_LOAD_FAILED: {error}")),
        };
        let value: serde_json::Value = serde_json::from_slice(&data)
            .map_err(|error| format!("WORKSPACE_LOAD_FAILED: {error}"))?;
        let (mut repository, migrated) = if legacy_schema(&value) {
            (migrate_legacy(value)?, true)
        } else {
            (
                serde_json::from_value(value)
                    .map_err(|error| format!("WORKSPACE_LOAD_FAILED: {error}"))?,
                false,
            )
        };
        let mut ids = std::collections::HashSet::new();
        repository.workspaces = repository
            .workspaces
            .into_iter()
            .map(Workspace::validate)
            .collect::<Result<Vec<_>, _>>()?;
        if repository
            .workspaces
            .iter()
            .any(|workspace| !ids.insert(workspace.id.clone()))
        {
            return Err("WORKSPACE_LOAD_FAILED: Workspace id 重复".into());
        }
        if migrated {
            repository.save(path)?;
            eprintln!("workspace_schema_migration legacy_app_members=MIGRATED_TO_OPEN_APP");
        }
        Ok(repository)
    }
    pub fn save(&self, path: &Path) -> Result<(), String> {
        let validated = Self {
            workspaces: self
                .workspaces
                .clone()
                .into_iter()
                .map(Workspace::validate)
                .collect::<Result<Vec<_>, _>>()?,
        };
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        crate::persistence::write_json(path, &validated)
    }
    pub fn upsert(&mut self, workspace: Workspace) -> Result<Workspace, String> {
        let workspace = workspace.validate()?;
        if let Some(existing) = self
            .workspaces
            .iter_mut()
            .find(|item| item.id == workspace.id)
        {
            *existing = workspace.clone();
        } else {
            self.workspaces.push(workspace.clone());
        }
        Ok(workspace)
    }
    pub fn delete(&mut self, id: &str) -> Result<(), String> {
        let index = self
            .workspaces
            .iter()
            .position(|item| item.id == id)
            .ok_or("Workspace 不存在")?;
        self.workspaces.remove(index);
        Ok(())
    }
}

fn legacy_schema(value: &serde_json::Value) -> bool {
    value
        .get("workspaces")
        .and_then(|value| value.as_array())
        .is_some_and(|workspaces| {
            workspaces
                .iter()
                .any(|workspace| workspace.get("members").is_some())
        })
}
fn migrate_legacy(value: serde_json::Value) -> Result<WorkspaceRepository, String> {
    let workspaces = value
        .get("workspaces")
        .and_then(|value| value.as_array())
        .ok_or("WORKSPACE_MIGRATION_FAILED: workspaces 缺失")?;
    let mut migrated = Vec::new();
    for workspace in workspaces {
        let id = workspace
            .get("id")
            .and_then(|value| value.as_str())
            .ok_or("WORKSPACE_MIGRATION_FAILED: id 缺失")?;
        let name = workspace
            .get("name")
            .and_then(|value| value.as_str())
            .ok_or("WORKSPACE_MIGRATION_FAILED: name 缺失")?;
        let members = workspace
            .get("members")
            .and_then(|value| value.as_array())
            .ok_or("WORKSPACE_MIGRATION_FAILED: members 缺失")?;
        let mut items = Vec::new();
        for (index, member) in members.iter().enumerate() {
            let identity = member
                .get("appIdentity")
                .ok_or("WORKSPACE_MIGRATION_FAILED: appIdentity 缺失")?;
            let bundle_id = identity
                .get("bundleId")
                .and_then(|value| value.as_str())
                .ok_or("WORKSPACE_MIGRATION_FAILED: bundleId 缺失")?;
            let known_path = identity.get("knownPath").and_then(|value| value.as_str());
            let app_name = identity.get("name").and_then(|value| value.as_str());
            let mut executions = std::collections::HashMap::new();
            executions.insert(
                "macos".into(),
                Execution::LaunchApp {
                    executable_names: Vec::new(),
                    bundle_ids: vec![bundle_id.into()],
                    app_names: app_name.into_iter().map(str::to_owned).collect(),
                    known_paths: known_path.into_iter().map(str::to_owned).collect(),
                    aliases: Vec::new(),
                },
            );
            items.push(WorkspaceItem {
                id: member
                    .get("id")
                    .and_then(|value| value.as_str())
                    .map(str::to_owned)
                    .unwrap_or_else(|| format!("{id}-item-{}", index + 1)),
                action: Action::OpenApp { executions },
                enabled: true,
                order: index as i32,
            });
        }
        migrated.push(Workspace {
            id: id.into(),
            name: name.into(),
            items,
        });
    }
    Ok(WorkspaceRepository {
        workspaces: migrated,
    })
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum WorkspaceResult {
    Complete,
    Partial,
    Failed,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ItemOutcome {
    Launched,
    AlreadyRunning,
    OpenRequestAccepted,
    Started,
    Failed,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceItemResult {
    pub item_id: String,
    pub action_type: String,
    pub outcome: ItemOutcome,
    pub error: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRun {
    pub id: String,
    pub workspace_id: String,
    pub workspace_name: String,
    pub started_at: u64,
    pub results: Vec<WorkspaceItemResult>,
    pub status: WorkspaceResult,
}

pub fn execute(workspace: &Workspace, platform: &str) -> WorkspaceRun {
    execute_with(workspace, platform, |execution| {
        execution::dispatch_with_intent(execution, execution::ExecutionIntent::PrepareEnvironment)
    })
}
fn execute_with<F>(workspace: &Workspace, platform: &str, dispatch: F) -> WorkspaceRun
where
    F: Fn(&Execution) -> Result<execution::DispatchOutcome, String> + Send + Sync,
{
    let id = uuid::Uuid::new_v4().to_string();
    let started_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let enabled: Vec<_> = workspace
        .items
        .iter()
        .filter(|item| item.enabled)
        .cloned()
        .collect();
    eprintln!("workspace_run id={id} workspace={} intent=PREPARE_ENVIRONMENT enabled_items={} dispatch=FAN_OUT", workspace.id, enabled.len());
    let dispatch = Arc::new(dispatch);
    let mut results = std::thread::scope(|scope| {
        let mut tasks = Vec::new();
        for item in enabled {
            let dispatch = dispatch.clone();
            let platform = platform.to_owned();
            let run_id = id.clone();
            tasks.push(scope.spawn(move || {
                let action_name = action_type(&item.action).to_owned();
                let result = if workspace_action_allowed(&item.action) {
                    item.action
                        .executions()
                        .get(&platform)
                        .ok_or_else(|| "CURRENT_PLATFORM_NOT_CONFIGURED".to_owned())
                        .and_then(|execution| dispatch(execution))
                } else {
                    Err(format!("WORKSPACE_ACTION_NOT_ALLOWED: {action_name}"))
                };
                let (outcome, error) = match result {
                    Ok(execution::DispatchOutcome::Launched) => (ItemOutcome::Launched, None),
                    Ok(execution::DispatchOutcome::AlreadyRunning) => {
                        (ItemOutcome::AlreadyRunning, None)
                    }
                    Ok(execution::DispatchOutcome::OpenRequestAccepted) => {
                        (ItemOutcome::OpenRequestAccepted, None)
                    }
                    Ok(execution::DispatchOutcome::Started) => (ItemOutcome::Started, None),
                    Ok(execution::DispatchOutcome::Completed) => {
                        (ItemOutcome::OpenRequestAccepted, None)
                    }
                    Err(error) => (ItemOutcome::Failed, Some(error)),
                };
                eprintln!(
                    "workspace_item run={run_id} item={} action={} outcome={outcome:?} error={error:?}",
                    item.id, action_name
                );
                (
                    item.order,
                    WorkspaceItemResult {
                        item_id: item.id,
                        action_type: action_name,
                        outcome,
                        error,
                    },
                )
            }));
        }
        tasks
            .into_iter()
            .map(|task| task.join().expect("workspace item task panicked"))
            .collect::<Vec<_>>()
    });
    results.sort_by_key(|(order, _)| *order);
    let results: Vec<_> = results.into_iter().map(|(_, result)| result).collect();
    let succeeded = results
        .iter()
        .filter(|result| result.outcome != ItemOutcome::Failed)
        .count();
    let status = if results.is_empty() || succeeded == 0 {
        WorkspaceResult::Failed
    } else if succeeded == results.len() {
        WorkspaceResult::Complete
    } else {
        WorkspaceResult::Partial
    };
    eprintln!(
        "workspace_run id={id} result={status:?} succeeded={succeeded} total={}",
        results.len()
    );
    WorkspaceRun {
        id,
        workspace_id: workspace.id.clone(),
        workspace_name: workspace.name.clone(),
        started_at,
        results,
        status,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        collections::HashMap,
        sync::{
            atomic::{AtomicUsize, Ordering},
            Arc, Barrier, Mutex,
        },
        time::Duration,
    };
    fn action(kind: &str) -> Action {
        let execution = match kind {
            "app" => Execution::LaunchApp {
                executable_names: vec!["demo".into()],
                bundle_ids: Vec::new(),
                app_names: Vec::new(),
                known_paths: Vec::new(),
                aliases: Vec::new(),
            },
            "url" => Execution::OpenUrl {
                url: "https://example.com".into(),
            },
            "file" => Execution::OpenFile {
                path: "/tmp/demo.txt".into(),
            },
            "folder" => Execution::OpenFolder {
                path: "/tmp".into(),
            },
            "script" => Execution::RunScript {
                path: "/tmp/demo.sh".into(),
            },
            "toggle" => Execution::ToggleApp {
                bundle_ids: vec!["demo".into()],
                known_paths: Vec::new(),
            },
            _ => Execution::SendHotkey {
                keys: vec!["A".into()],
            },
        };
        let mut executions = HashMap::new();
        executions.insert("macos".into(), execution);
        match kind {
            "app" => Action::OpenApp { executions },
            "url" => Action::OpenUrl { executions },
            "file" => Action::OpenFile { executions },
            "folder" => Action::OpenFolder { executions },
            "script" => Action::Script { executions },
            "toggle" => Action::ToggleApp { executions },
            _ => Action::Command { executions },
        }
    }
    fn sample(kinds: &[&str]) -> Workspace {
        Workspace {
            id: "dev".into(),
            name: "Dev".into(),
            items: kinds
                .iter()
                .enumerate()
                .map(|(index, kind)| WorkspaceItem {
                    id: format!("item-{index}"),
                    action: action(kind),
                    enabled: true,
                    order: index as i32,
                })
                .collect(),
        }
    }
    #[test]
    fn whitelist_is_explicit_and_default_deny() {
        for kind in ["app", "url", "file", "folder", "script"] {
            assert!(workspace_action_allowed(&action(kind)));
        }
        assert!(!workspace_action_allowed(&action("toggle")));
        assert!(!workspace_action_allowed(&action("hotkey")));
    }
    #[test]
    fn invalid_actions_are_rejected_before_runtime() {
        assert!(sample(&["toggle"])
            .validate()
            .unwrap_err()
            .contains("NOT_ALLOWED"));
    }
    #[test]
    fn all_success_complete_and_all_failed_failed() {
        let workspace = sample(&["url", "file"]);
        assert_eq!(
            execute_with(&workspace, "macos", |_| Ok(
                execution::DispatchOutcome::OpenRequestAccepted
            ))
            .status,
            WorkspaceResult::Complete
        );
        assert_eq!(
            execute_with(&workspace, "macos", |_| Err("no".into())).status,
            WorkspaceResult::Failed
        );
    }
    #[test]
    fn failure_is_independent_and_disabled_is_excluded() {
        let mut workspace = sample(&["url", "file", "folder"]);
        workspace.items[1].enabled = false;
        let calls = AtomicUsize::new(0);
        let run = execute_with(&workspace, "macos", |_| {
            let call = calls.fetch_add(1, Ordering::SeqCst);
            if call == 0 {
                Err("one failure".into())
            } else {
                Ok(execution::DispatchOutcome::OpenRequestAccepted)
            }
        });
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        assert_eq!(run.results.len(), 2);
        assert_eq!(run.status, WorkspaceResult::Partial);
    }
    #[test]
    fn slow_item_does_not_block_fast_items_starting() {
        let workspace = sample(&["url", "file", "folder"]);
        let barrier = Arc::new(Barrier::new(3));
        let starts = Arc::new(Mutex::new(Vec::new()));
        let run = execute_with(&workspace, "macos", {
            let barrier = barrier.clone();
            let starts = starts.clone();
            move |execution| {
                starts.lock().unwrap().push(std::time::Instant::now());
                barrier.wait();
                if matches!(execution, Execution::OpenUrl { .. }) {
                    std::thread::sleep(Duration::from_millis(40));
                }
                Ok(execution::DispatchOutcome::OpenRequestAccepted)
            }
        });
        let starts = starts.lock().unwrap();
        assert_eq!(run.status, WorkspaceResult::Complete);
        assert_eq!(starts.len(), 3);
        assert!(
            starts
                .iter()
                .max()
                .unwrap()
                .duration_since(*starts.iter().min().unwrap())
                < Duration::from_millis(30)
        );
    }
    #[test]
    fn repeated_runs_are_independent() {
        let workspace = sample(&["url"]);
        let first = execute_with(&workspace, "macos", |_| {
            Ok(execution::DispatchOutcome::OpenRequestAccepted)
        });
        let second = execute_with(&workspace, "macos", |_| {
            Ok(execution::DispatchOutcome::OpenRequestAccepted)
        });
        assert_ne!(first.id, second.id);
    }
    #[test]
    fn legacy_members_migrate_to_open_app() {
        let value = serde_json::json!({"workspaces":[{"id":"old","name":"Old","members":[{"id":"app","appIdentity":{"bundleId":"com.example.App","name":"App","knownPath":"/Applications/App.app"}}]}]});
        let repository = migrate_legacy(value).unwrap();
        assert!(matches!(
            repository.workspaces[0].items[0].action,
            Action::OpenApp { .. }
        ));
    }
}
