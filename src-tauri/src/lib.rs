use serde::Serialize;
use serde_json::Value;
use std::{
    collections::HashSet,
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    sync::{atomic::{AtomicU64, Ordering}, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

const MAX_BYTES: usize = 48 * 1024 * 1024;
const AUTO_INTERVAL_MS: u128 = 10 * 60 * 1000;
const MAX_AUTO: usize = 20;
const MAX_MANUAL: usize = 30;
static SEQUENCE: AtomicU64 = AtomicU64::new(0);
// Serialize native writes, snapshots and restores across all windows.
static WRITE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSummary {
    id: String,
    title: String,
    updated_at: String,
    scenes: usize,
    words: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    template: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    series: Option<Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotSummary {
    id: String,
    kind: String,
    created_at_ms: u128,
    revision: u64,
    title: String,
    words: usize,
    scenes: usize,
}

fn now_ms() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis()
}

fn check_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 80 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("Identificador de proyecto inválido".into());
    }
    Ok(())
}

fn folder(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = root.join("projects");
    fs::create_dir_all(&path).map_err(|e| format!("No se pudo crear la biblioteca: {e}"))?;
    Ok(path)
}

fn project_file(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    check_id(id)?;
    Ok(folder(app)?.join(format!("{id}.json")))
}

fn backup_file(file: &Path) -> PathBuf { file.with_extension("json.bak") }

// Saved independently of the project schema, so v0.1 through v1.1.1 remain readable.
fn binding_file(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    check_id(id)?;
    let dir = folder(app)?.join("file-bindings");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{id}.path")))
}

fn checked_user_path(raw: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw);
    if !path.is_absolute() || path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()) != Some("scriptz".into()) {
        return Err("Elegí una ubicación absoluta con extensión .scriptz".into());
    }
    if !path.parent().map(|d| d.is_dir()).unwrap_or(false) {
        return Err("La carpeta de destino no existe".into());
    }
    Ok(path)
}

fn get_binding(app: &tauri::AppHandle, id: &str) -> Result<Option<PathBuf>, String> {
    let entry = binding_file(app, id)?;
    if !entry.exists() { return Ok(None); }
    let raw = fs::read_to_string(entry).map_err(|e| e.to_string())?;
    Ok(Some(checked_user_path(raw.trim())?))
}

// Crash-safe staged replacement for NTFS/Windows. A valid previous version is
// reachable as the main file or .bak throughout the operation. Old backups are
// never deleted BEFORE the new main file is committed.
fn atomic_replace(path: &Path, bytes: &[u8], previous_is_valid: bool) -> Result<(), String> {
    let seq = SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let temporary = path.with_extension(format!("{}.{}.tmp", std::process::id(), seq));
    let backup = path.with_extension(format!("{}bak", path.extension().and_then(|x| x.to_str()).map(|x| format!("{x}.")).unwrap_or_default()));
    let old_backup = path.with_extension(format!("{}.{}.previous", std::process::id(), seq));
    let quarantined = path.with_extension(format!("{}.{}.corrupt", std::process::id(), seq));
    let mut backup_rotated = false;
    let mut previous_moved = false;
    let mut bad_moved = false;
    let result = (|| -> Result<(), String> {
        {
            let mut f = File::create(&temporary).map_err(|e| e.to_string())?;
            f.write_all(bytes).map_err(|e| e.to_string())?;
            f.sync_all().map_err(|e| e.to_string())?;
        }
        if path.exists() && previous_is_valid {
            if backup.exists() {
                fs::rename(&backup, &old_backup).map_err(|e| format!("No se pudo conservar el respaldo anterior: {e}"))?;
                backup_rotated = true;
            }
            if let Err(e) = fs::rename(path, &backup) {
                if backup_rotated { let _ = fs::rename(&old_backup, &backup); }
                return Err(format!("No se pudo respaldar el archivo principal: {e}"));
            }
            previous_moved = true;
        } else if path.exists() {
            // Keep damaged bytes for diagnosis while preserving the valid .bak.
            fs::rename(path, &quarantined).map_err(|e| format!("No se pudo aislar el archivo dañado: {e}"))?;
            bad_moved = true;
        }
        if let Err(e) = fs::rename(&temporary, path) {
            if previous_moved { let _ = fs::rename(&backup, path); }
            if bad_moved { let _ = fs::rename(&quarantined, path); }
            if backup_rotated && !backup.exists() { let _ = fs::rename(&old_backup, &backup); }
            return Err(format!("No se pudo finalizar el guardado: {e}"));
        }
        // Once the new primary is committed, the previous valid main is .bak.
        if backup_rotated { let _ = fs::remove_file(&old_backup); }
        // Retain quarantined damaged files; never destroy the last recoverable bytes.
        Ok(())
    })();
    if result.is_err() { let _ = fs::remove_file(&temporary); }
    result
}

fn replace_user_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    atomic_replace(path, bytes, true)
}

fn verify_binding(app: &tauri::AppHandle, id: &str, bytes: &[u8]) -> Result<(), String> {
    if let Some(path) = get_binding(app, id)? {
        if path.exists() {
            let external_bytes = fs::read(&path).map_err(|e| e.to_string())?;
            let external: Value = serde_json::from_slice(&external_bytes).map_err(|_| {
                "El archivo vinculado está dañado o fue modificado externamente. Usá Guardar como para elegir otro destino.".to_string()
            })?;
            if external.get("id").and_then(Value::as_str) != Some(id) {
                return Err("El archivo externo pertenece a otro guion. Usá Guardar como.".into());
            }
            let local: Value = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
            let saved_revision = external.get("revision").and_then(Value::as_u64).unwrap_or(0);
            let current_revision = local.get("revision").and_then(Value::as_u64).unwrap_or(0);
            if saved_revision > current_revision || (saved_revision == current_revision && external != local) {
                return Err("El archivo externo fue actualizado fuera de ScriptZ. No se sobrescribió; guardá una copia nueva.".into());
            }
        }
    }
    Ok(())
}

fn sync_binding(app: &tauri::AppHandle, id: &str, bytes: &[u8]) -> Result<(), String> {
    verify_binding(app, id, bytes)?;
    if let Some(path) = get_binding(app, id)? {
        replace_user_file(&path, bytes)?;
    }
    Ok(())
}

#[tauri::command]
fn get_project_file_path(app: tauri::AppHandle, id: String) -> Result<Option<String>, String> {
    Ok(get_binding(&app, &id)?.map(|path| path.to_string_lossy().into_owned()))
}

#[tauri::command]
fn link_project_file(app: tauri::AppHandle, id: String, path: String) -> Result<(), String> {
    let _guard = WRITE_LOCK.lock().map_err(|_| "Bloqueo de guardado no disponible")?;
    let destination = checked_user_path(&path)?;
    let project = load_resilient(&app, &project_file(&app, &id)?, &id)?;
    let bytes = serde_json::to_vec_pretty(&project).map_err(|e| e.to_string())?;
    if bytes.len() > MAX_BYTES { return Err("El guion supera 48 MB".into()); }
    // A path cannot be shared by two projects: autosave would otherwise collide.
    let bindings_folder = folder(&app)?.join("file-bindings");
    // Path names use OsString; compare with the same type on Windows and Unix.
    let current_binding_name = std::ffi::OsString::from(format!("{id}.path"));
    if bindings_folder.is_dir() {
        for entry in fs::read_dir(&bindings_folder).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if entry.file_name() == current_binding_name { continue; }
            if fs::read_to_string(entry.path()).ok().map(|s| PathBuf::from(s.trim())) == Some(destination.clone()) {
                return Err("Este archivo ya pertenece a otro proyecto de ScriptZ".into());
            }
        }
    }
    if destination.exists() {
        // Never overwrite unknown or damaged user files via Guardar como.
        let existing = fs::read(&destination).map_err(|e| e.to_string())?;
        let parsed: Value = serde_json::from_slice(&existing)
            .map_err(|_| "El archivo de destino no es un ScriptZ válido; elegí otra ubicación".to_string())?;
        if parsed.get("id").and_then(Value::as_str) != Some(id.as_str()) {
            return Err("Ese archivo corresponde a otro guion. Elegí otro nombre.".into());
        }
        let old_revision = parsed.get("revision").and_then(Value::as_u64).unwrap_or(0);
        if old_revision > project["revision"].as_u64().unwrap_or(0) {
            return Err("El archivo de destino tiene una revisión más nueva; no se sobrescribió".into());
        }
    }
    replace_user_file(&destination, &bytes)?;
    replace_user_file(&binding_file(&app, &id)?, destination.to_string_lossy().as_bytes())
}

#[tauri::command]
fn sync_project_file(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let _guard = WRITE_LOCK.lock().map_err(|_| "Bloqueo de guardado no disponible")?;
    let project = load_resilient(&app, &project_file(&app, &id)?, &id)?;
    let bytes = serde_json::to_vec_pretty(&project).map_err(|e| e.to_string())?;
    sync_binding(&app, &id, &bytes)
}


fn history_dir(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    check_id(id)?;
    let dir = folder(app)?.join("history").join(id);
    fs::create_dir_all(&dir).map_err(|e| format!("No se pudo preparar el historial: {e}"))?;
    Ok(dir)
}

fn atomic_new_file(path: &Path, contents: &[u8]) -> Result<(), String> {
    let sequence = SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let temp = path.with_extension(format!("{}.{}.tmp", std::process::id(), sequence));
    let result = (|| -> Result<(), String> {
        let mut writer = File::create(&temp).map_err(|e| e.to_string())?;
        writer.write_all(contents).map_err(|e| e.to_string())?;
        writer.sync_all().map_err(|e| e.to_string())?;
        fs::rename(&temp, path).map_err(|e| e.to_string())?;
        Ok(())
    })();
    if result.is_err() { let _ = fs::remove_file(&temp); }
    result
}

fn validate_project(project: &Value, expected_id: &str) -> Result<(), String> {
    let id = project.get("id").and_then(Value::as_str).ok_or("Falta ID")?;
    check_id(id)?;
    if id != expected_id { return Err("El ID no coincide con el archivo".into()); }
    if !matches!(project.get("schemaVersion").and_then(Value::as_u64), Some(1) | Some(2)) {
        return Err("Versión de proyecto incompatible".into());
    }
    if project.get("revision").and_then(Value::as_u64).is_none() {
        return Err("Número de revisión inválido".into());
    }
    let blocks = project.get("blocks").and_then(Value::as_array).ok_or("El guion no contiene bloques válidos")?;
    if blocks.len() > 75_000 { return Err("El guion contiene demasiados párrafos".into()); }
    let mut seen_blocks = HashSet::new();
    for block in blocks {
        // Schema 2 uses "type"; schema 1 used "kind".
        let kind = block.get("type").or_else(|| block.get("kind")).and_then(Value::as_str).ok_or("Tipo de bloque ausente")?;
        let text = block.get("text").and_then(Value::as_str).ok_or("Párrafo sin texto válido")?;
        let block_id = block.get("id").and_then(Value::as_str).ok_or("Párrafo sin identificador")?;
        if !valid_element_type(kind) || text.len() > MAX_BYTES || check_id(block_id).is_err() || !seen_blocks.insert(block_id) {
            return Err("El guion contiene un bloque duplicado o dañado".into());
        }
    }
    Ok(())
}

/// Element types are short lowercase identifiers (scene, action, dialogue, lyrics, panel, video…).
/// Accepting the pattern instead of a fixed list keeps older builds able to open newer scripts.
fn valid_element_type(kind: &str) -> bool {
    !kind.is_empty() && kind.len() <= 24 && kind.chars().all(|c| c.is_ascii_lowercase() || c == '_')
}

fn read_json_file(path: &Path, id: &str) -> Result<Value, String> {
    let raw = fs::read(path).map_err(|e| e.to_string())?;
    if raw.len() > MAX_BYTES { return Err("El archivo supera los 48 MB".into()); }
    let value: Value = serde_json::from_slice(&raw).map_err(|e| e.to_string())?;
    validate_project(&value, id)?;
    Ok(value)
}

fn load_valid(file: &Path, id: &str) -> Result<Value, String> {
    match read_json_file(file, id) {
        Ok(project) => Ok(project),
        Err(primary_error) => read_json_file(&backup_file(file), id)
            .map_err(|_| format!("No se pudo recuperar el proyecto {id}: {primary_error}")),
    }
}

// Fall back to the most recent validated historical copy when the main file and
// its legacy .bak are both unusable. Never modify files during read/recovery.
fn load_resilient(app: &tauri::AppHandle, file: &Path, id: &str) -> Result<Value, String> {
    if let Ok(value) = load_valid(file, id) { return Ok(value); }
    for item in snapshots(app, id)? {
        let file = history_dir(app, id)?.join(format!("{}.json", item.id));
        if let Ok(value) = read_json_file(&file, id) { return Ok(value); }
    }
    Err(format!("No se encontró una versión válida del proyecto {id}"))
}

fn summary(id: &str, value: &Value) -> ProjectSummary {
    let blocks = value["blocks"].as_array();
    let scenes = blocks.into_iter().flatten().filter(|block| {
        block["type"].as_str().or_else(|| block["kind"].as_str()) == Some("scene") && block["text"].as_str().is_some_and(|t| !t.trim().is_empty())
    }).count();
    let words = blocks.into_iter().flatten().filter_map(|b| b["text"].as_str())
        .map(|t| t.split_whitespace().count()).sum();
    ProjectSummary {
        id: id.to_owned(),
        title: value["title"].as_str().unwrap_or("Sin título").to_owned(),
        updated_at: value["updatedAt"].as_str().unwrap_or("").to_owned(),
        scenes, words,
        template: value["template"].as_str().map(str::to_owned),
        series: value.get("series").filter(|s| s.is_object()).cloned(),
    }
}

fn snapshot_name(name: &str) -> Option<(u128, &str)> {
    let stem = name.strip_suffix(".json")?;
    let mut parts = stem.split('-');
    let ms = parts.next()?.parse::<u128>().ok()?;
    let kind = parts.next()?;
    if !matches!(kind, "auto" | "manual") || parts.next()?.parse::<u64>().is_err() || parts.next().is_some() { return None; }
    Some((ms, kind))
}

fn snapshots(app: &tauri::AppHandle, id: &str) -> Result<Vec<SnapshotSummary>, String> {
    let dir = history_dir(app, id)?;
    let mut result = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let Some(file_name) = entry.file_name().to_str().map(str::to_owned) else { continue; };
        let Some((created_at_ms, kind)) = snapshot_name(&file_name) else { continue; };
        let Ok(project) = read_json_file(&entry.path(), id) else { continue; };
        let stats = summary(id, &project);
        result.push(SnapshotSummary {
            id: file_name.trim_end_matches(".json").to_owned(), kind: kind.to_owned(), created_at_ms,
            revision: project["revision"].as_u64().unwrap_or(0), title: stats.title,
            words: stats.words, scenes: stats.scenes,
        });
    }
    result.sort_by(|a, b| b.created_at_ms.cmp(&a.created_at_ms).then_with(|| b.id.cmp(&a.id)));
    Ok(result)
}

fn prune_snapshots(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    let all = snapshots(app, id)?;
    let dir = history_dir(app, id)?;
    let mut auto = 0;
    let mut manual = 0;
    for snapshot in all {
        let count = if snapshot.kind == "auto" { &mut auto } else { &mut manual };
        *count += 1;
        if *count > if snapshot.kind == "auto" { MAX_AUTO } else { MAX_MANUAL } {
            fs::remove_file(dir.join(format!("{}.json", snapshot.id))).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn make_snapshot(app: &tauri::AppHandle, id: &str, kind: &str, value: &Value) -> Result<SnapshotSummary, String> {
    check_id(id)?;
    validate_project(value, id)?;
    let dir = history_dir(app, id)?;
    let ms = now_ms();
    let sequence = SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let name = format!("{ms}-{kind}-{sequence}");
    let payload = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    if payload.len() > MAX_BYTES { return Err("El respaldo supera los 48 MB".into()); }
    atomic_new_file(&dir.join(format!("{name}.json")), &payload)?;
    prune_snapshots(app, id)?;
    let stats = summary(id, value);
    Ok(SnapshotSummary { id: name, kind: kind.into(), created_at_ms: ms,
        revision: value["revision"].as_u64().unwrap_or(0), title: stats.title,
        words: stats.words, scenes: stats.scenes })
}

// Every write is staged in the project directory and fsynced before replacing the active file.
// The legacy .json.bak is retained so 0.1–0.3 backups remain compatible.
fn write_primary(file: &Path, contents: &[u8], primary_valid: bool) -> Result<(), String> {
    atomic_replace(file, contents, primary_valid)
}

#[tauri::command]
fn list_projects(app: tauri::AppHandle) -> Result<Vec<ProjectSummary>, String> {
    let mut projects = Vec::new();
    let mut seen = HashSet::new();
    for entry in fs::read_dir(folder(&app)?).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_name = entry.file_name();
        let Some(name) = file_name.to_str() else { continue; };
        let id = name.strip_suffix(".json").or_else(|| name.strip_suffix(".json.bak"));
        let Some(id) = id else { continue; };
        if check_id(id).is_err() || !seen.insert(id.to_owned()) { continue; }
        let file = project_file(&app, id)?;
        if let Ok(project) = load_resilient(&app, &file, id) { projects.push(summary(id, &project)); }
    }
    // Projects interrupted before an active file existed are discoverable from history too.
    let history_root = folder(&app)?.join("history");
    if history_root.exists() {
        for entry in fs::read_dir(history_root).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if !entry.path().is_dir() { continue; }
            let name = entry.file_name();
            let Some(id) = name.to_str() else { continue; };
            if check_id(id).is_err() || !seen.insert(id.to_owned()) { continue; }
            let file = project_file(&app, id)?;
            if let Ok(project) = load_resilient(&app, &file, id) { projects.push(summary(id, &project)); }
        }
    }
    projects.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(projects)
}

#[tauri::command]
fn load_project(app: tauri::AppHandle, id: String) -> Result<Value, String> {
    let file = project_file(&app, &id)?;
    load_resilient(&app, &file, &id)
}

#[tauri::command]
fn project_storage_status(app: tauri::AppHandle, id: String) -> Result<String, String> {
    let file = project_file(&app, &id)?;
    if read_json_file(&file, &id).is_ok() { return Ok("primary".into()); }
    if read_json_file(&backup_file(&file), &id).is_ok() { return Ok("backup".into()); }
    if !snapshots(&app, &id)?.is_empty() { return Ok("history".into()); }
    Err("No hay una versión guardada válida".into())
}

#[tauri::command]
fn save_project(app: tauri::AppHandle, project: Value) -> Result<(), String> {
    let _guard = WRITE_LOCK.lock().map_err(|_| "Bloqueo de guardado no disponible")?;
    let id = project.get("id").and_then(Value::as_str).ok_or("Falta ID")?;
    validate_project(&project, id)?;
    let file = project_file(&app, id)?;
    let contents = serde_json::to_vec_pretty(&project).map_err(|e| e.to_string())?;
    if contents.len() > MAX_BYTES { return Err("Este proyecto supera el máximo de 48 MB".into()); }
    if file.exists() || backup_file(&file).exists() || !snapshots(&app, id)?.is_empty() {
        let old = load_resilient(&app, &file, id)?;
        if old != project {
            if project["revision"].as_u64().unwrap_or(0) <= old["revision"].as_u64().unwrap_or(0) {
                return Err("Conflicto: existe una revisión más reciente. No se sobrescribió el guion.".into());
            }
            let all = snapshots(&app, id)?;
            let last_auto = all.iter().filter(|s| s.kind == "auto").map(|s| s.created_at_ms).max();
            // Corrupt primary + valid backup: preserve the backup regardless of interval.
            let must_preserve = read_json_file(&file, id).is_err();
            if must_preserve || last_auto.map_or(true, |last| now_ms().saturating_sub(last) >= AUTO_INTERVAL_MS) {
                make_snapshot(&app, id, "auto", &old)?;
            }
        }
    }
    let primary_valid = read_json_file(&file, id).is_ok();
    // Detect a newer external version BEFORE touching the internal primary.
    verify_binding(&app, id, &contents)?;
    if primary_valid && read_json_file(&file, id).ok().as_ref() == Some(&project) {
        return sync_binding(&app, id, &contents);
    }
    write_primary(&file, &contents, primary_valid)?;
    sync_binding(&app, id, &contents)
}

#[tauri::command]
fn list_snapshots(app: tauri::AppHandle, id: String) -> Result<Vec<SnapshotSummary>, String> { snapshots(&app, &id) }

#[tauri::command]
fn create_snapshot(app: tauri::AppHandle, id: String) -> Result<SnapshotSummary, String> {
    let _guard = WRITE_LOCK.lock().map_err(|_| "Bloqueo de guardado no disponible")?;
    let file = project_file(&app, &id)?;
    let current = load_resilient(&app, &file, &id)?;
    make_snapshot(&app, &id, "manual", &current)
}

/// Reads one historical copy without touching the project (used to compare versions).
#[tauri::command]
fn load_snapshot(app: tauri::AppHandle, id: String, snapshot_id: String) -> Result<Value, String> {
    check_id(&id)?;
    if snapshot_name(&format!("{snapshot_id}.json")).is_none() { return Err("Versión de historial inválida".into()); }
    let target = history_dir(&app, &id)?.join(format!("{snapshot_id}.json"));
    read_json_file(&target, &id)
}

#[tauri::command]
fn restore_snapshot(app: tauri::AppHandle, id: String, snapshot_id: String) -> Result<Value, String> {
    let _guard = WRITE_LOCK.lock().map_err(|_| "Bloqueo de guardado no disponible")?;
    check_id(&id)?;
    if snapshot_name(&format!("{snapshot_id}.json")).is_none() { return Err("Versión de historial inválida".into()); }
    let target = history_dir(&app, &id)?.join(format!("{snapshot_id}.json"));
    let mut restored = read_json_file(&target, &id)?;
    let file = project_file(&app, &id)?;
    let current = load_resilient(&app, &file, &id)?;
    // The pre-restoration state is saved independently, before touching the primary file.
    make_snapshot(&app, &id, "manual", &current)?;
    let next_revision = current["revision"].as_u64().unwrap_or(0)
        .max(restored["revision"].as_u64().unwrap_or(0)).saturating_add(1);
    restored["revision"] = Value::from(next_revision);
    restored["updatedAt"] = Value::from(format_timestamp(now_ms()));
    let bytes = serde_json::to_vec_pretty(&restored).map_err(|e| e.to_string())?;
    if bytes.len() > MAX_BYTES { return Err("El proyecto supera 48 MB".into()); }
    verify_binding(&app, &id, &bytes)?;
    write_primary(&file, &bytes, read_json_file(&file, &id).is_ok())?;
    sync_binding(&app, &id, &bytes)?;
    Ok(restored)
}

// RFC 3339 UTC timestamp without an additional date crate (used only for restored projects).
fn format_timestamp(milliseconds: u128) -> String {
    let secs = (milliseconds / 1000) as i64;
    let days = secs.div_euclid(86400);
    let sod = secs.rem_euclid(86400);
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let mut year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    if month <= 2 { year += 1; }
    format!("{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        sod / 3600, (sod % 3600) / 60, sod % 60, milliseconds % 1000)
}

#[tauri::command]
fn delete_project(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let _guard = WRITE_LOCK.lock().map_err(|_| "Bloqueo de guardado no disponible")?;
    let file = project_file(&app, &id)?;
    if file.exists() { fs::remove_file(&file).map_err(|e| e.to_string())?; }
    let backup = backup_file(&file);
    if backup.exists() { fs::remove_file(&backup).map_err(|e| e.to_string())?; }
    let history = history_dir(&app, &id)?;
    if history.exists() { fs::remove_dir_all(history).map_err(|e| e.to_string())?; }
    let binding = binding_file(&app, &id)?;
    if binding.exists() { fs::remove_file(binding).map_err(|e| e.to_string())?; }
    // External .scriptz file remains the user's property.
    Ok(())
}

#[cfg(target_os="windows")]
#[tauri::command]
async fn list_windows_voices() -> Result<Vec<serde_json::Value>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let command = "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $v=@($s.GetInstalledVoices() | Where-Object Enabled | ForEach-Object { [pscustomobject]@{name=$_.VoiceInfo.Name;lang=$_.VoiceInfo.Culture.Name} }); ConvertTo-Json -InputObject $v -Compress";
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: prevent a visible PowerShell console flashing over the studio.
        let output=std::process::Command::new("powershell.exe").creation_flags(0x08000000).args(["-NoProfile","-NonInteractive","-Command",command]).output().map_err(|e|e.to_string())?;
        if !output.status.success(){return Err(String::from_utf8_lossy(&output.stderr).chars().take(500).collect());}
        let text=String::from_utf8_lossy(&output.stdout).trim().trim_start_matches('\u{feff}').to_string();
        serde_json::from_str::<Vec<serde_json::Value>>(&text).map_err(|e|format!("No se pudo leer la lista de voces Windows: {e}"))
    }).await.map_err(|e|e.to_string())?
}
#[cfg(not(target_os="windows"))]
#[tauri::command]
async fn list_windows_voices() -> Result<Vec<serde_json::Value>, String> {Ok(vec![])}

// Audio export is intentionally offline and Windows-only. Scripts are fixed resources,
// not generated from screenplay text. The screenplay is passed in a JSON data file.
#[cfg(target_os="windows")]
#[tauri::command]
async fn render_script_audio(path: String, lines: Vec<serde_json::Value>, voice_map: serde_json::Value, pronunciation: serde_json::Value, speed: f64) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if lines.is_empty() || lines.len() > 4000 { return Err("Seleccioná entre 1 y 4000 parlamentos".into()); }
        let bytes = serde_json::to_vec(&serde_json::json!({"lines":lines,"voices":voice_map,"pronunciation":pronunciation,"speed":speed.clamp(0.5,2.0)})).map_err(|e|e.to_string())?;
        if bytes.len() > 2_000_000 { return Err("La lectura supera el límite de 2 MB".into()); }
        let destination = std::path::PathBuf::from(&path);
        if !destination.is_absolute() || destination.extension().and_then(|x| x.to_str()).map(|x| x.to_ascii_lowercase()) != Some("wav".into()) || !destination.parent().map(|p|p.is_dir()).unwrap_or(false) { return Err("Elegí un archivo WAV en una carpeta existente".into()); }
        let counter=SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let temp=std::env::temp_dir().join(format!("scriptz-audio-{}-{}",std::process::id(),counter));
        fs::create_dir(&temp).map_err(|e|e.to_string())?;
        let result=(|| -> Result<String,String> {
            let script=temp.join("render.ps1");let input=temp.join("input.json");let rendered=temp.join("rendered.wav");
            fs::write(&script,include_str!("../scripts/render.ps1")).map_err(|e|e.to_string())?;
            fs::write(&input,&bytes).map_err(|e|e.to_string())?;
            use std::os::windows::process::CommandExt;
            let output=std::process::Command::new("powershell.exe").creation_flags(0x08000000).args(["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File"])
                .arg(&script).arg("-InputFile").arg(&input).arg("-OutputFile").arg(&rendered).output().map_err(|e|e.to_string())?;
            if !output.status.success(){let stderr=String::from_utf8_lossy(&output.stderr);return Err(format!("No se pudo sintetizar el audio: {}",stderr.chars().take(400).collect::<String>()));}
            let meta=fs::metadata(&rendered).map_err(|e|e.to_string())?;
            if meta.len()<44 || meta.len()>250_000_000 {return Err("Audio WAV inválido o demasiado grande".into());}
            let destination_tmp=destination.with_extension(format!("wav.{counter}.scriptz-tmp"));
            fs::copy(&rendered,&destination_tmp).map_err(|e|e.to_string())?;
            // Keep the prior WAV as .bak before replacing; restore on failure.
            let previous=destination.with_extension("wav.bak");
            let had_previous=destination.exists();
            if had_previous {
                if previous.exists() { fs::remove_file(&previous).map_err(|e|e.to_string())?; }
                if let Err(e)=fs::rename(&destination,&previous) {
                    let _=fs::remove_file(&destination_tmp);
                    return Err(format!("No se pudo respaldar WAV existente: {e}"));
                }
            }
            if let Err(e)=fs::rename(&destination_tmp,&destination){
                if had_previous {let _=fs::rename(&previous,&destination);}
                let _=fs::remove_file(&destination_tmp);
                return Err(format!("No se pudo guardar el WAV: {e}"));
            }
            Ok(destination.to_string_lossy().to_string())
        })();
        let _=fs::remove_dir_all(&temp);
        result
    }).await.map_err(|e|e.to_string())?
}

#[cfg(not(target_os="windows"))]
#[tauri::command]
async fn render_script_audio(_path:String,_lines:Vec<serde_json::Value>,_voice_map:serde_json::Value,_pronunciation:serde_json::Value,_speed:f64) -> Result<String,String> {
    Err("La exportación de voces SAPI requiere Windows".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_projects, load_project, save_project, delete_project,
            list_snapshots, create_snapshot, load_snapshot, restore_snapshot, project_storage_status,
            get_project_file_path, link_project_file, sync_project_file, render_script_audio, list_windows_voices
        ])
        .run(tauri::generate_context!())
        .expect("No se pudo iniciar ScriptZ");
}

#[cfg(test)]
mod safety_tests {
    use super::*;
    fn path(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("scriptz-durability-{}-{}", std::process::id(), SEQUENCE.fetch_add(1, Ordering::Relaxed)));
        fs::create_dir_all(&dir).unwrap();
        dir.join(name)
    }
    #[test]
    fn accepts_schema_1_and_2_projects() {
        let v1 = serde_json::json!({"id": "p1", "schemaVersion": 1, "revision": 3, "blocks": [{"id": "b1", "kind": "scene", "text": "INT. CASA - DÍA"}]});
        let v2 = serde_json::json!({"id": "p1", "schemaVersion": 2, "revision": 1, "blocks": [{"id": "b1", "type": "lyrics", "text": "la la"}, {"id": "b2", "type": "panel", "text": ""}]});
        assert!(validate_project(&v1, "p1").is_ok());
        assert!(validate_project(&v2, "p1").is_ok());
        let bad = serde_json::json!({"id": "p1", "schemaVersion": 2, "revision": 1, "blocks": [{"id": "b1", "type": "Scene<script>", "text": ""}]});
        assert!(validate_project(&bad, "p1").is_err());
        let dup = serde_json::json!({"id": "p1", "schemaVersion": 2, "revision": 1, "blocks": [{"id": "b1", "type": "action", "text": ""}, {"id": "b1", "type": "action", "text": ""}]});
        assert!(validate_project(&dup, "p1").is_err());
        assert_eq!(summary("p1", &v2).scenes, 0);
        assert_eq!(summary("p1", &v1).scenes, 1);
    }
    #[test]
    fn creates_primary_and_retains_previous() {
        let file = path("story.json");
        atomic_replace(&file, b"one", true).unwrap();
        atomic_replace(&file, b"two", true).unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"two");
        assert_eq!(fs::read(file.with_extension("json.bak")).unwrap(), b"one");
        let _ = fs::remove_dir_all(file.parent().unwrap());
    }
    #[test]
    fn quarantines_corrupt_primary_without_erasing_valid_backup() {
        let file = path("story.json");
        fs::write(&file, b"damaged").unwrap();
        fs::write(file.with_extension("json.bak"), b"valid previous").unwrap();
        atomic_replace(&file, b"recovered", false).unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"recovered");
        assert_eq!(fs::read(file.with_extension("json.bak")).unwrap(), b"valid previous");
        let _ = fs::remove_dir_all(file.parent().unwrap());
    }
    #[test]
    fn source_is_intact_if_temporary_file_cannot_be_written() {
        let file = path("story.json");
        fs::write(&file, b"original").unwrap();
        // An invalid directory path prevents replacement before the first move.
        let missing = file.parent().unwrap().join("missing").join("story.json");
        assert!(atomic_replace(&missing, b"replacement", true).is_err());
        assert_eq!(fs::read(&file).unwrap(), b"original");
        let _ = fs::remove_dir_all(file.parent().unwrap());
    }
}
