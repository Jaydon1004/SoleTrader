use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use tauri::{AppHandle, Manager};

const MAX_LOG_BYTES: u64 = 1_048_576;
const MAX_FIELD_CHARS: usize = 16_000;
const MAX_EXPORTED_LOG_BYTES: u64 = 256 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontendErrorInput {
    message: String,
    stack: String,
    component_stack: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticsReport {
    generated_at: String,
    app_version: String,
    operating_system: String,
    architecture: String,
    current_crash_log: String,
    previous_crash_log: String,
}

fn truncate(value: &str) -> String {
    value.chars().take(MAX_FIELD_CHARS).collect()
}

fn write_frontend_error_at(directory: &Path, input: &FrontendErrorInput) -> Result<(), String> {
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let path = directory.join("frontend-crashes.log");
    if path.metadata().map(|metadata| metadata.len()).unwrap_or(0) >= MAX_LOG_BYTES {
        let previous = directory.join("frontend-crashes.previous.log");
        let _ = fs::remove_file(&previous);
        fs::rename(&path, previous).map_err(|error| error.to_string())?;
    }
    let entry = serde_json::json!({
        "timestamp": Utc::now().to_rfc3339(),
        "message": truncate(&input.message),
        "stack": truncate(&input.stack),
        "componentStack": truncate(&input.component_stack),
    });
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| error.to_string())?;
    writeln!(file, "{entry}").map_err(|error| error.to_string())
}

#[tauri::command]
pub fn log_frontend_error(app: AppHandle, input: FrontendErrorInput) -> Result<(), String> {
    let directory = app
        .path()
        .app_log_dir()
        .map_err(|error| error.to_string())?;
    write_frontend_error_at(&directory, &input)
}

fn read_bounded_log(path: &Path) -> String {
    let Ok(bytes) = fs::read(path) else {
        return String::new();
    };
    let start = bytes.len().saturating_sub(MAX_EXPORTED_LOG_BYTES as usize);
    String::from_utf8_lossy(&bytes[start..]).into_owned()
}

fn write_diagnostics_report_at(
    destination: &Path,
    log_directory: &Path,
    app_version: &str,
) -> Result<String, String> {
    let destination = destination
        .canonicalize()
        .map_err(|error| format!("Diagnostics destination is unavailable: {error}"))?;
    if !destination.is_dir() {
        return Err("Choose a folder for the diagnostics report.".into());
    }
    let generated_at = Utc::now();
    let report = DiagnosticsReport {
        generated_at: generated_at.to_rfc3339(),
        app_version: app_version.into(),
        operating_system: std::env::consts::OS.into(),
        architecture: std::env::consts::ARCH.into(),
        current_crash_log: read_bounded_log(&log_directory.join("frontend-crashes.log")),
        previous_crash_log: read_bounded_log(&log_directory.join("frontend-crashes.previous.log")),
    };
    let path = destination.join(format!(
        "soletrader-diagnostics-{}.json",
        generated_at.format("%Y%m%d-%H%M%S")
    ));
    fs::write(
        &path,
        serde_json::to_vec_pretty(&report).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn export_diagnostics(app: AppHandle, destination: String) -> Result<String, String> {
    let log_directory = app
        .path()
        .app_log_dir()
        .map_err(|error| error.to_string())?;
    write_diagnostics_report_at(
        Path::new(&destination),
        &log_directory,
        &app.package_info().version.to_string(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_structured_frontend_error() {
        let directory =
            std::env::temp_dir().join(format!("soletrader-log-{}", uuid::Uuid::new_v4()));
        write_frontend_error_at(
            &directory,
            &FrontendErrorInput {
                message: "Render failed".into(),
                stack: "Error: Render failed".into(),
                component_stack: "at Dashboard".into(),
            },
        )
        .unwrap();

        let contents = fs::read_to_string(directory.join("frontend-crashes.log")).unwrap();
        let entry: serde_json::Value = serde_json::from_str(contents.trim()).unwrap();
        assert_eq!(entry["message"], "Render failed");
        assert_eq!(entry["componentStack"], "at Dashboard");

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn exports_only_bounded_diagnostic_data() {
        let root = std::env::temp_dir().join(format!("soletrader-report-{}", uuid::Uuid::new_v4()));
        let logs = root.join("logs");
        let destination = root.join("export");
        fs::create_dir_all(&logs).unwrap();
        fs::create_dir_all(&destination).unwrap();
        fs::write(logs.join("frontend-crashes.log"), "render failure").unwrap();

        let path = write_diagnostics_report_at(&destination, &logs, "1.2.3").unwrap();
        let report: serde_json::Value = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
        assert_eq!(report["appVersion"], "1.2.3");
        assert_eq!(report["currentCrashLog"], "render failure");
        assert!(report.get("workspace").is_none());

        fs::remove_dir_all(root).unwrap();
    }
}
