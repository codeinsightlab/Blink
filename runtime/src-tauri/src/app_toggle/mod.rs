//! Runtime-only state. No serialization or remembered visibility.
#[cfg(target_os = "macos")]
mod macos;
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AppState {
    NotRunning,
    Hidden,
    Minimized,
    Background,
    Foreground,
    Unknown,
}
#[derive(Debug)]
pub struct AppTarget {
    pub bundle_id: String,
    pub path: Option<String>,
}
#[derive(Debug, thiserror::Error)]
pub enum AppControlError {
    #[error("InvalidTarget")]
    InvalidTarget,
    #[error("TargetNotFound")]
    TargetNotFound,
    #[error("Unsupported")]
    Unsupported,
    #[error("LaunchFailed: {0}")]
    LaunchFailed(String),
    #[error("RevealFailed: {0}")]
    RevealFailed(String),
    #[error("ConcealFailed")]
    ConcealFailed,
}
pub trait DesktopAppController {
    fn query_state(&self, target: &AppTarget) -> Result<AppState, AppControlError>;
    fn launch(&self, target: &AppTarget) -> Result<(), AppControlError>;
    fn reveal(&self, target: &AppTarget) -> Result<(), AppControlError>;
    fn conceal(&self, target: &AppTarget) -> Result<(), AppControlError>;
}
pub struct AppToggleService;
impl AppToggleService {
    pub fn toggle(
        controller: &impl DesktopAppController,
        target: &AppTarget,
    ) -> Result<(), AppControlError> {
        let state = controller.query_state(target)?;
        let operation = match state {
            AppState::NotRunning => "Launch+Reveal",
            AppState::Foreground => "Conceal",
            _ => "Reveal",
        };
        let result = match state {
            AppState::NotRunning => controller.launch(target).map(|()| {
                // The adapter polls briefly. A successful asynchronous launch remains successful.
                if let Err(error) = controller.reveal(target) {
                    eprintln!("toggle_app launch_reveal_degraded={error:?}");
                }
            }),
            AppState::Foreground => controller.conceal(target),
            _ => controller.reveal(target),
        };
        eprintln!("toggle_app target={:?} bundle_id={:?} detected_state={state:?} chosen_operation={operation} operation_result={result:?} platform={}", target.path, target.bundle_id, std::env::consts::OS);
        result
    }
}
pub fn dispatch(bundle_ids: &[String], paths: &[String]) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let result = macos::toggle(bundle_ids, paths);
    #[cfg(not(target_os = "macos"))]
    let result: Result<(), AppControlError> = {
        let _ = (bundle_ids, paths);
        Err(AppControlError::Unsupported)
    };
    result.map_err(|error| { eprintln!("toggle_app target={paths:?} bundle_id={bundle_ids:?} dispatch_error={error:?} platform={}", std::env::consts::OS); "TOGGLE_APP_FAILED".into() })
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    struct Mock {
        state: AppState,
        calls: RefCell<Vec<&'static str>>,
        fail_launch: bool,
        fail_reveal: bool,
    }
    impl DesktopAppController for Mock {
        fn query_state(&self, _: &AppTarget) -> Result<AppState, AppControlError> {
            self.calls.borrow_mut().push("query");
            Ok(self.state)
        }
        fn launch(&self, _: &AppTarget) -> Result<(), AppControlError> {
            self.calls.borrow_mut().push("launch");
            if self.fail_launch {
                Err(AppControlError::LaunchFailed("test".into()))
            } else {
                Ok(())
            }
        }
        fn reveal(&self, _: &AppTarget) -> Result<(), AppControlError> {
            self.calls.borrow_mut().push("reveal");
            if self.fail_reveal {
                Err(AppControlError::RevealFailed("test".into()))
            } else {
                Ok(())
            }
        }
        fn conceal(&self, _: &AppTarget) -> Result<(), AppControlError> {
            self.calls.borrow_mut().push("conceal");
            Ok(())
        }
    }
    #[test]
    fn six_states_and_fresh_query_each_time() {
        for (state, expected) in [
            (AppState::NotRunning, vec!["query", "launch", "reveal"]),
            (AppState::Hidden, vec!["query", "reveal"]),
            (AppState::Minimized, vec!["query", "reveal"]),
            (AppState::Background, vec!["query", "reveal"]),
            (AppState::Foreground, vec!["query", "conceal"]),
            (AppState::Unknown, vec!["query", "reveal"]),
        ] {
            let mock = Mock {
                state,
                calls: RefCell::default(),
                fail_launch: false,
                fail_reveal: false,
            };
            let target = AppTarget {
                bundle_id: "test.app".into(),
                path: None,
            };
            AppToggleService::toggle(&mock, &target).unwrap();
            assert_eq!(*mock.calls.borrow(), expected);
            mock.calls.borrow_mut().clear();
            AppToggleService::toggle(&mock, &target).unwrap();
            assert_eq!(*mock.calls.borrow(), expected);
        }
    }
    #[test]
    fn unknown_reveal_failure_never_conceals() {
        let mock = Mock {
            state: AppState::Unknown,
            calls: RefCell::default(),
            fail_launch: false,
            fail_reveal: true,
        };
        let target = AppTarget {
            bundle_id: "test.app".into(),
            path: None,
        };
        assert!(AppToggleService::toggle(&mock, &target).is_err());
        assert_eq!(*mock.calls.borrow(), vec!["query", "reveal"]);
    }
    #[test]
    fn launch_failure_stops_and_delayed_window_is_degraded_success() {
        let target = AppTarget {
            bundle_id: "test.app".into(),
            path: None,
        };
        let mock = Mock {
            state: AppState::NotRunning,
            calls: RefCell::default(),
            fail_launch: true,
            fail_reveal: false,
        };
        assert!(AppToggleService::toggle(&mock, &target).is_err());
        assert_eq!(*mock.calls.borrow(), vec!["query", "launch"]);
        let mock = Mock {
            fail_launch: false,
            fail_reveal: true,
            ..mock
        };
        assert!(AppToggleService::toggle(&mock, &target).is_ok());
    }
}
