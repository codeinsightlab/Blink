#[allow(dead_code)]
#[path = "../src/profile.rs"]
mod profile;
use profile::Profile;

#[allow(dead_code)]
#[path = "../src/binding.rs"]
mod binding;
#[allow(dead_code)]
#[path = "../src/repository.rs"]
mod repository;

#[test]
fn producer_repository_binding() {
    // npm run test:creator sends actual shared TS Producer output. Plain cargo test
    // still exercises the same adapter/repository/binding path with the portable fixture.
    let raw = std::env::var("BLINK_PRODUCER_PROFILES").unwrap_or_else(|_| {
        include_str!("../../../packages/blink-contract/fixtures/profile-v2.0.example.json").into()
    });
    let profiles = Profile::many_from_json(&raw).unwrap();
    let count = profiles.len();
    let mut repository = repository::ProfileRepository::default();
    let mut bindings = binding::BindingState::default();
    for (index, profile) in profiles.into_iter().enumerate() {
        let expected = serde_json::to_value(&profile).unwrap();
        let item = repository.insert_import(profile).unwrap();
        assert!(!item.id.is_empty());
        assert!(item.local_name_override.is_none());
        assert_eq!(serde_json::to_value(&item.profile).unwrap(), expected);
        let input = format!("F{}", index + 1);
        bindings.bind_profile(&item.id, &input);
        assert_eq!(bindings.physical_to_profile.get(&input), Some(&item.id));
        assert!(bindings.consistent());
    }
    assert_eq!(repository.profiles.len(), count);
    println!("PRODUCER_REPOSITORY_BINDING={count}");
}

use serde::Deserialize;
#[test]
fn producer_edit_replacements() {
    let raw = std::env::var("BLINK_EDIT_PROFILES").unwrap_or_else(|_| {
        include_str!("../../../packages/blink-contract/fixtures/profile-v2.0.example.json").into()
    });
    let profiles = Profile::many_from_json(&raw).unwrap();
    let count = profiles.len();
    let mut repository = repository::ProfileRepository::default();
    let item = repository.insert_import(profiles[0].clone()).unwrap();
    let mut bindings = binding::BindingState::default();
    bindings.bind_profile(&item.id, "F10");
    let before = bindings.bindings.clone();
    for profile in profiles {
        let expected = serde_json::to_value(&profile).unwrap();
        repository
            .replace_profile(&item.id, profile, "Edited")
            .unwrap();
        let updated = repository.find(&item.id).unwrap();
        assert_eq!(updated.id, item.id);
        assert_eq!(updated.source, item.source);
        assert_eq!(serde_json::to_value(&updated.profile).unwrap(), expected);
        assert_eq!(bindings.bindings, before);
    }
    println!("PRODUCER_EDIT_REPLACEMENTS={count}");
}
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
        "../../../packages/blink-contract/fixtures/profile-v2.parity.json"
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
