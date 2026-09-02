#[allow(dead_code)]
#[path = "../src/profile.rs"]
mod profile;
use profile::Profile;
use serde::Deserialize;
use serde_json::{json, Value};
#[derive(Deserialize)]
struct Case {
    id: String,
    valid: bool,
    profile: Value,
}
#[test]
fn shared_protocol_matrix() {
    let cases: Vec<Case> = serde_json::from_str(include_str!(
        "../../../packages/keyflow-contract/fixtures/profile-v2.parity.json"
    ))
    .unwrap();
    let mut results = Vec::new();
    for case in cases {
        let raw = case.profile.to_string();
        let parsed = Profile::from_json(&raw);
        assert_eq!(parsed.is_ok(), case.valid, "single: {}", case.id);
        assert_eq!(
            Profile::many_from_json(&raw).is_ok(),
            case.valid,
            "object import: {}",
            case.id
        );
        assert_eq!(
            Profile::many_from_json(&format!("[{raw}]")).is_ok(),
            case.valid,
            "array import: {}",
            case.id
        );
        let serialized = parsed.ok().map(|profile| {
            let value = serde_json::to_value(profile).unwrap();
            Profile::from_json(&value.to_string()).expect("Rust round-trip");
            value
        });
        results.push(
            json!({ "id": case.id, "accepted": serialized.is_some(), "serialized": serialized }),
        );
    }
    // Consumed by tests/profile-parity.ts; test output, not a product API.
    println!(
        "PROFILE_PARITY_REPORT={}",
        serde_json::to_string(&results).unwrap()
    );
}
