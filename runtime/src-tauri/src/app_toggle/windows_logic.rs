//! Platform-neutral predicates used by the Windows adapter and tested on every host.
//! A title, window area, or EnumWindows order must never decide app identity.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct WindowFacts {
    pub top_level: bool,
    pub pid_matches: bool,
    pub cloaked: bool,
    pub tool_window: bool,
    pub app_window: bool,
    pub visible: bool,
    pub iconic: bool,
}

pub(crate) fn is_candidate(window: WindowFacts) -> bool {
    window.top_level
        && window.pid_matches
        && !window.cloaked
        && (!window.tool_window || window.app_window)
        && (window.visible || window.iconic)
}

#[cfg(test)]
mod tests {
    use super::*;

    const BASE: WindowFacts = WindowFacts {
        top_level: true,
        pid_matches: true,
        cloaked: false,
        tool_window: false,
        app_window: false,
        visible: true,
        iconic: false,
    };

    #[test]
    fn candidate_predicate_has_no_presentation_heuristics() {
        assert!(is_candidate(BASE));
        assert!(is_candidate(WindowFacts {
            iconic: true,
            visible: false,
            ..BASE
        }));
        assert!(!is_candidate(WindowFacts {
            top_level: false,
            ..BASE
        }));
        assert!(!is_candidate(WindowFacts {
            pid_matches: false,
            ..BASE
        }));
        assert!(!is_candidate(WindowFacts {
            cloaked: true,
            ..BASE
        }));
        assert!(!is_candidate(WindowFacts {
            tool_window: true,
            ..BASE
        }));
        assert!(is_candidate(WindowFacts {
            tool_window: true,
            app_window: true,
            ..BASE
        }));
        assert!(!is_candidate(WindowFacts {
            visible: false,
            iconic: false,
            ..BASE
        }));
    }
}
