use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::Manager;

struct DataRoot(PathBuf);

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenameLogEntry {
  old_path: String,
  new_path: String,
  doi: Option<String>,
  title: Option<String>,
  timestamp: String,
  #[serde(default)]
  status: String,
  #[serde(default)]
  error: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct LastRunFile {
  log_path: String,
  entries: Vec<RenameLogEntry>,
}

fn resolve_data_root(app: &tauri::AppHandle) -> PathBuf {
  let exe_dir = std::env::current_exe()
    .ok()
    .and_then(|p| p.parent().map(|p| p.to_path_buf()));

  if let Some(dir) = exe_dir {
    let portable = dir.join("ALR Renamer Data");
    if std::fs::create_dir_all(&portable).is_ok() {
      return portable;
    }
  }

  let fallback = app
    .path()
    .app_data_dir()
    .unwrap_or_else(|_| std::env::temp_dir())
    .join("ALR Renamer Data");

  let _ = std::fs::create_dir_all(&fallback);
  fallback
}

#[tauri::command]
fn get_data_root(state: tauri::State<DataRoot>) -> String {
  state.0.to_string_lossy().to_string()
}

#[tauri::command]
fn write_rename_log(
  state: tauri::State<DataRoot>,
  entries: Vec<RenameLogEntry>,
) -> Result<String, String> {
  let logs_dir = state.0.join("logs");
  std::fs::create_dir_all(&logs_dir).map_err(|e| e.to_string())?;

  let now = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map_err(|e| e.to_string())?;

  let file_name = format!("rename-log-{}.json", now.as_secs());
  let log_path = logs_dir.join(file_name);

  let json = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;
  std::fs::write(&log_path, json).map_err(|e| e.to_string())?;

  let last_run = LastRunFile {
    log_path: log_path.to_string_lossy().to_string(),
    entries,
  };
  let last_run_path = logs_dir.join("last-run.json");
  let last_run_json = serde_json::to_string_pretty(&last_run).map_err(|e| e.to_string())?;
  std::fs::write(last_run_path, last_run_json).map_err(|e| e.to_string())?;

  Ok(log_path.to_string_lossy().to_string())
}

#[tauri::command]
fn read_last_run_entries(state: tauri::State<DataRoot>) -> Result<Vec<RenameLogEntry>, String> {
  let last_run_path = state.0.join("logs").join("last-run.json");
  let raw = match std::fs::read_to_string(last_run_path) {
    Ok(v) => v,
    Err(_) => return Ok(vec![]),
  };

  let parsed: LastRunFile = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
  Ok(parsed.entries)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![
      get_data_root,
      write_rename_log,
      read_last_run_entries
    ])
    .setup(|app| {
      let handle = app.handle();
      let data_root = resolve_data_root(handle);
      app.manage(DataRoot(data_root.clone()));

      if let Some(window_config) = handle.config().app.windows.get(0) {
        let label = window_config.label.clone();
        let webview_data_dir = data_root.join("webview").join(&label);
        let _ = std::fs::create_dir_all(&webview_data_dir);

        tauri::WebviewWindowBuilder::from_config(handle, window_config)?
          .data_directory(webview_data_dir)
          .build()?;
      }

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
