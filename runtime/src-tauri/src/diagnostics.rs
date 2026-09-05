use std::{
    fs,
    io::Write,
    path::Path,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
static LOG_LOCK: Mutex<()> = Mutex::new(());
const MAX_LOG: u64 = 1024 * 1024;
pub fn append(path: &Path, event: &str, error: Option<&str>) -> Result<(), String> {
    let _lock = LOG_LOCK.lock().map_err(|e| e.to_string())?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let line = serde_json::json!({"timestampUnixMs": timestamp, "event": event.chars().take(8192).collect::<String>(), "error": error.map(|e| e.chars().take(8192).collect::<String>())}).to_string() + "\n";
    if fs::metadata(path).is_ok_and(|m| m.len() + line.len() as u64 > MAX_LOG) {
        let previous = path.with_extension("log.1");
        if previous.exists() {
            fs::remove_file(&previous).map_err(|e| e.to_string())?;
        }
        fs::rename(path, previous).map_err(|e| e.to_string())?;
    }
    fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .and_then(|mut f| f.write_all(line.as_bytes()))
        .map_err(|e| e.to_string())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rotates_and_records_structured_time() {
        let dir = std::env::temp_dir().join(format!("blink-log-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("runtime-diagnostics.log");
        fs::write(&path, vec![b'x'; MAX_LOG as usize]).unwrap();
        append(&path, "exec=1 start", Some("line\nbreak")).unwrap();
        let value: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert!(value["timestampUnixMs"].is_number());
        assert_eq!(value["error"], "line\nbreak");
        assert!(path.with_extension("log.1").exists());
        fs::remove_dir_all(dir).unwrap();
    }
}
