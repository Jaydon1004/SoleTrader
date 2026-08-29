use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use std::{
    collections::BTreeSet,
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
    sync::OnceLock,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;
use uuid::Uuid;

const SCHEMA_VERSION: i64 = 25;
const BACKUP_FORMAT_VERSION: u32 = 1;
static CATALOG_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
const MIGRATIONS: [&str; 25] = [
    include_str!("../migrations/001_initial_schema.sql"),
    include_str!("../migrations/002_invoice_workflow.sql"),
    include_str!("../migrations/003_expense_workflow.sql"),
    include_str!("../migrations/004_vehicle_workflow.sql"),
    include_str!("../migrations/005_tax_calculator.sql"),
    include_str!("../migrations/006_vat_management.sql"),
    include_str!("../migrations/007_advanced_tax.sql"),
    include_str!("../migrations/008_document_library.sql"),
    include_str!("../migrations/009_vehicle_cost_documents.sql"),
    include_str!("../migrations/010_bank_reconciliation.sql"),
    include_str!("../migrations/011_reminder_alerts.sql"),
    include_str!("../migrations/012_power_features.sql"),
    include_str!("../migrations/013_correct_bad_debt_records.sql"),
    include_str!("../migrations/014_vat_return_snapshots.sql"),
    include_str!("../migrations/015_filed_period_locks.sql"),
    include_str!("../migrations/016_financial_constraints.sql"),
    include_str!("../migrations/017_tax_year_2026.sql"),
    include_str!("../migrations/018_self_billing_foundation.sql"),
    include_str!("../migrations/019_expanded_audit_trail.sql"),
    include_str!("../migrations/020_integrity_hardening.sql"),
    include_str!("../migrations/021_direct_income.sql"),
    include_str!("../migrations/022_accounts_and_bank_classification.sql"),
    include_str!("../migrations/023_bank_rules_transfers_splits.sql"),
    include_str!("../migrations/024_direct_income_cis.sql"),
    include_str!("../migrations/025_direct_income_editing.sql"),
];

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BusinessWorkspace {
    pub id: String,
    pub name: String,
    pub archived: bool,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifest {
    format_version: u32,
    schema_version: i64,
    workspace_name: String,
    created_at: u64,
    files: Vec<BackupFile>,
}

#[derive(Serialize, Deserialize)]
struct BackupFile {
    path: String,
    size: u64,
    sha256: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileAuditResult {
    missing: Vec<String>,
    orphaned: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFileInput {
    workspace_id: String,
    relative_path: String,
    bytes: Vec<u8>,
}

fn checked_workspace_file(
    app: &AppHandle,
    workspace_id: &str,
    relative_path: &str,
) -> Result<PathBuf, String> {
    let relative = Path::new(relative_path);
    validate_relative_path(relative)?;
    let components: Vec<_> = relative.components().collect();
    if components.len() != 2
        || !matches!(
            components
                .first()
                .and_then(|value| value.as_os_str().to_str()),
            Some("receipts" | "documents" | "invoice-archive")
        )
    {
        return Err("Workspace file path is invalid.".into());
    }
    Ok(workspace_dir(app, workspace_id)?.join(relative))
}

#[tauri::command]
pub async fn write_workspace_file(app: AppHandle, input: WorkspaceFileInput) -> Result<(), String> {
    if input.bytes.is_empty() || input.bytes.len() > 25 * 1024 * 1024 {
        return Err("Workspace files must be between 1 byte and 25 MB.".into());
    }
    let target = checked_workspace_file(&app, &input.workspace_id, &input.relative_path)?;
    if input.relative_path.starts_with("invoice-archive/")
        && (!input.relative_path.to_ascii_lowercase().ends_with(".pdf")
            || !input.bytes.starts_with(b"%PDF"))
    {
        return Err("Invoice archives must be valid PDF files.".into());
    }
    let parent = target.parent().ok_or("Workspace file path is invalid.")?;
    tokio::fs::create_dir_all(parent)
        .await
        .map_err(|error| error.to_string())?;
    let temporary = target.with_extension(format!("{}.staging", Uuid::new_v4().simple()));
    tokio::fs::write(&temporary, &input.bytes)
        .await
        .map_err(|error| error.to_string())?;
    if let Err(error) = tokio::fs::rename(&temporary, &target).await {
        let _ = tokio::fs::remove_file(&temporary).await;
        return Err(error.to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn read_workspace_file(
    app: AppHandle,
    workspace_id: String,
    relative_path: String,
) -> Result<Vec<u8>, String> {
    let path = checked_workspace_file(&app, &workspace_id, &relative_path)?;
    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|error| error.to_string())?;
    if metadata.len() > 25 * 1024 * 1024 {
        return Err("Workspace file exceeds the 25 MB read limit.".into());
    }
    tokio::fs::read(path)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn delete_workspace_file(
    app: AppHandle,
    workspace_id: String,
    relative_path: String,
) -> Result<(), String> {
    if !relative_path.starts_with("receipts/") && !relative_path.starts_with("documents/") {
        return Err("Only staged receipts and documents can be removed.".into());
    }
    let path = checked_workspace_file(&app, &workspace_id, &relative_path)?;
    match tokio::fs::remove_file(path).await {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn now_millis() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as u64)
        .map_err(|error| error.to_string())
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|error| error.to_string())
}

fn businesses_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("businesses"))
}

fn businesses_dir_at(app_data: &Path) -> PathBuf {
    app_data.join("businesses")
}

fn catalog_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(businesses_dir(app)?.join("catalog.json"))
}

fn catalog_path_at(app_data: &Path) -> PathBuf {
    businesses_dir_at(app_data).join("catalog.json")
}

fn workspace_dir(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    validate_id(id)?;
    Ok(businesses_dir(app)?.join(id))
}

fn workspace_dir_at(app_data: &Path, id: &str) -> Result<PathBuf, String> {
    validate_id(id)?;
    Ok(businesses_dir_at(app_data).join(id))
}

pub(crate) fn workspace_database_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    Ok(workspace_dir(app, id)?.join("soletrader.db"))
}

fn validate_id(id: &str) -> Result<(), String> {
    if id.len() < 8
        || id.len() > 64
        || !id.chars().all(|character| {
            character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-'
        })
    {
        return Err("Invalid business workspace identifier.".into());
    }
    Ok(())
}

fn validate_relative_path(path: &Path) -> Result<(), String> {
    if path.as_os_str().is_empty()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("Backup contains an invalid file path.".into());
    }
    Ok(())
}

fn hash_file(path: &Path) -> Result<(u64, String), String> {
    let mut file = fs::File::open(path).map_err(|error| error.to_string())?;
    let mut hasher = Sha256::new();
    let mut size = 0_u64;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        size += read as u64;
    }
    Ok((size, format!("{:x}", hasher.finalize())))
}

fn copy_workspace_files(
    source: &Path,
    destination: &Path,
    relative: &Path,
    files: &mut Vec<BackupFile>,
) -> Result<(), String> {
    for entry in fs::read_dir(source.join(relative)).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if file_type.is_symlink() {
            return Err("Business workspace contains an unsupported symbolic link.".into());
        }
        let child_relative = relative.join(entry.file_name());
        if file_type.is_dir() {
            fs::create_dir_all(destination.join(&child_relative))
                .map_err(|error| error.to_string())?;
            copy_workspace_files(source, destination, &child_relative, files)?;
        } else if file_type.is_file() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name == "soletrader.db-wal" || name == "soletrader.db-shm" {
                continue;
            }
            let target = destination.join(&child_relative);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            }
            fs::copy(entry.path(), &target).map_err(|error| error.to_string())?;
            let (size, sha256) = hash_file(&target)?;
            files.push(BackupFile {
                path: child_relative.to_string_lossy().replace('\\', "/"),
                size,
                sha256,
            });
        }
    }
    Ok(())
}

fn verify_backup_files(source: &Path, manifest: &BackupManifest) -> Result<(), String> {
    if !manifest
        .files
        .iter()
        .any(|file| file.path == "soletrader.db")
    {
        return Err("Backup does not contain a business database.".into());
    }
    for file in &manifest.files {
        let relative = PathBuf::from(&file.path);
        validate_relative_path(&relative)?;
        let path = source.join("data").join(relative);
        if fs::symlink_metadata(&path)
            .map_err(|error| format!("Could not inspect {}: {error}", file.path))?
            .file_type()
            .is_symlink()
        {
            return Err(format!("Backup contains a symbolic link at {}.", file.path));
        }
        let (size, sha256) =
            hash_file(&path).map_err(|error| format!("Could not verify {}: {error}", file.path))?;
        if size != file.size || sha256 != file.sha256 {
            return Err(format!("Backup verification failed for {}.", file.path));
        }
    }
    Ok(())
}

fn verify_staged_files(root: &Path, manifest: &BackupManifest) -> Result<(), String> {
    for file in &manifest.files {
        let relative = PathBuf::from(&file.path);
        validate_relative_path(&relative)?;
        let (size, sha256) = hash_file(&root.join(relative))?;
        if size != file.size || sha256 != file.sha256 {
            return Err(format!(
                "Restored copy verification failed for {}.",
                file.path
            ));
        }
    }
    Ok(())
}

fn cleanup_staging_directories(root: &Path, prefix: &str, suffix: &str) -> Result<(), String> {
    if !root.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(root).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if file_type.is_dir()
            && !file_type.is_symlink()
            && name.starts_with(prefix)
            && name.ends_with(suffix)
        {
            fs::remove_dir_all(entry.path()).map_err(|error| {
                format!(
                    "Could not remove interrupted operation {}: {error}",
                    entry.path().display()
                )
            })?;
        }
    }
    Ok(())
}

fn collect_stored_files(
    root: &Path,
    relative: &Path,
    files: &mut BTreeSet<String>,
) -> Result<(), String> {
    let directory = root.join(relative);
    if !directory.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(directory).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if file_type.is_symlink() {
            return Err("Business file storage contains an unsupported symbolic link.".into());
        }
        let child = relative.join(entry.file_name());
        if file_type.is_dir() {
            collect_stored_files(root, &child, files)?;
        } else if file_type.is_file() {
            files.insert(child.to_string_lossy().replace('\\', "/"));
        }
    }
    Ok(())
}

async fn audit_workspace_files_at(root: &Path) -> Result<FileAuditResult, String> {
    let database = root.join("soletrader.db");
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(database)
                .foreign_keys(true),
        )
        .await
        .map_err(|error| error.to_string())?;
    let active_rows = sqlx::query_scalar::<_, String>(
        "SELECT receipt_path FROM expenses WHERE deleted_at IS NULL AND receipt_path != '' UNION SELECT receipt_path FROM vehicle_costs WHERE deleted_at IS NULL AND receipt_path != '' UNION SELECT file_path FROM documents WHERE deleted_at IS NULL AND file_path != '' UNION SELECT pdf_path FROM invoices WHERE deleted_at IS NULL AND pdf_path != ''",
    ).fetch_all(&pool).await.map_err(|error| error.to_string())?;
    let all_rows = sqlx::query_scalar::<_, String>(
        "SELECT receipt_path FROM expenses WHERE receipt_path != '' UNION SELECT receipt_path FROM vehicle_costs WHERE receipt_path != '' UNION SELECT file_path FROM documents WHERE file_path != '' UNION SELECT pdf_path FROM invoices WHERE pdf_path != ''",
    ).fetch_all(&pool).await.map_err(|error| error.to_string())?;
    pool.close().await;
    let valid = |path: &str| {
        matches!(
            path.split('/').next(),
            Some("receipts" | "documents" | "invoice-archive")
        ) && validate_relative_path(Path::new(path)).is_ok()
    };
    let active: BTreeSet<_> = active_rows.into_iter().filter(|path| valid(path)).collect();
    let referenced: BTreeSet<_> = all_rows.into_iter().filter(|path| valid(path)).collect();
    let mut stored = BTreeSet::new();
    for directory in ["receipts", "documents", "invoice-archive"] {
        collect_stored_files(root, Path::new(directory), &mut stored)?;
    }
    Ok(FileAuditResult {
        missing: active
            .into_iter()
            .filter(|path| !root.join(path).is_file())
            .collect(),
        orphaned: stored.difference(&referenced).cloned().collect(),
    })
}

fn read_catalog(app: &AppHandle) -> Result<Vec<BusinessWorkspace>, String> {
    read_catalog_at(&catalog_path(app)?)
}

fn read_catalog_at(path: &Path) -> Result<Vec<BusinessWorkspace>, String> {
    let backup = path.with_extension("json.bak");
    if !path.exists() && !backup.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path)
        .or_else(|_| fs::read_to_string(&backup))
        .map_err(|error| error.to_string())?;
    serde_json::from_str(&content)
        .or_else(|_| {
            let fallback = fs::read_to_string(backup).map_err(serde_json::Error::io)?;
            serde_json::from_str(&fallback)
        })
        .map_err(|error| format!("Business catalog is invalid: {error}"))
}

fn write_catalog(app: &AppHandle, workspaces: &[BusinessWorkspace]) -> Result<(), String> {
    write_catalog_at(&catalog_path(app)?, workspaces)
}

fn write_catalog_at(path: &Path, workspaces: &[BusinessWorkspace]) -> Result<(), String> {
    let parent = path.parent().ok_or("Business catalog path is invalid.")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temporary = path.with_extension("json.tmp");
    let backup = path.with_extension("json.bak");
    let content = serde_json::to_vec_pretty(workspaces).map_err(|error| error.to_string())?;
    let mut file = fs::File::create(&temporary).map_err(|error| error.to_string())?;
    use std::io::Write;
    file.write_all(&content)
        .map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    if path.exists() {
        fs::copy(&path, &backup).map_err(|error| error.to_string())?;
        fs::remove_file(&path).map_err(|error| error.to_string())?;
    }
    fs::rename(temporary, path).map_err(|error| error.to_string())
}

fn move_legacy_directory(source: &Path, destination: &Path) -> Result<(), String> {
    if !source.exists() || destination.exists() {
        return Ok(());
    }
    fs::rename(source, destination)
        .map_err(|error| format!("Could not move {}: {error}", source.display()))
}

fn merge_legacy_directory(source: &Path, destination: &Path) -> Result<(), String> {
    if !source.exists() {
        return Ok(());
    }
    fs::create_dir_all(destination).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if file_type.is_symlink() {
            return Err("Legacy invoice archive contains an unsupported symbolic link.".into());
        }
        let target = destination.join(entry.file_name());
        if file_type.is_dir() {
            merge_legacy_directory(&entry.path(), &target)?;
        } else if file_type.is_file() && !target.exists() {
            fs::rename(entry.path(), target).map_err(|error| error.to_string())?;
        }
    }
    fs::remove_dir_all(source).map_err(|error| error.to_string())
}

pub(crate) async fn initialise_database(path: &Path) -> Result<(), String> {
    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|error| error.to_string())?;
    for migration in MIGRATIONS {
        let migration = migration.to_owned();
        sqlx::raw_sql(&migration)
            .execute(&pool)
            .await
            .map_err(|error| format!("Business database migration failed: {error}"))?;
    }
    sqlx::query("CREATE TABLE workspace_schema (version INTEGER NOT NULL)")
        .execute(&pool)
        .await
        .map_err(|error| error.to_string())?;
    sqlx::query("INSERT INTO workspace_schema (version) VALUES (?)")
        .bind(SCHEMA_VERSION)
        .execute(&pool)
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(())
}

async fn verify_database(path: &Path, checkpoint: bool) -> Result<(), String> {
    let options = SqliteConnectOptions::new()
        .filename(path)
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|error| error.to_string())?;
    if checkpoint {
        sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
            .execute(&pool)
            .await
            .map_err(|error| {
                format!("Could not checkpoint the existing business database: {error}")
            })?;
    }
    let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_one(&pool)
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    if integrity != "ok" {
        return Err(format!(
            "Business database integrity check failed: {integrity}"
        ));
    }
    Ok(())
}

async fn snapshot_database(source: &Path, target: &Path) -> Result<(), String> {
    if target.exists() {
        fs::remove_file(target).map_err(|error| error.to_string())?;
    }
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(source)
                .foreign_keys(true),
        )
        .await
        .map_err(|error| error.to_string())?;
    let escaped = target.to_string_lossy().replace('\'', "''");
    let result = sqlx::query(&format!("VACUUM INTO '{escaped}'"))
        .execute(&pool)
        .await
        .map_err(|error| format!("Could not create the database snapshot: {error}"));
    pool.close().await;
    result?;
    verify_database(target, false).await
}

async fn prepare_database(path: &Path) -> Result<(), String> {
    let connect = || {
        SqlitePoolOptions::new().max_connections(1).connect_with(
            SqliteConnectOptions::new()
                .filename(path)
                .foreign_keys(true),
        )
    };
    let pool = connect().await.map_err(|error| error.to_string())?;
    let workspace_version =
        sqlx::query_scalar::<_, i64>("SELECT version FROM workspace_schema LIMIT 1")
            .fetch_optional(&pool)
            .await
            .ok()
            .flatten();
    let migration_version = sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(MAX(version), 0) FROM _sqlx_migrations WHERE success = 1",
    )
    .fetch_optional(&pool)
    .await
    .ok()
    .flatten();
    let current_version = workspace_version.or(migration_version).unwrap_or(0);
    if current_version > SCHEMA_VERSION {
        pool.close().await;
        return Err("This business was created by a newer version of SoleTrader.".into());
    }
    if current_version < 14 {
        pool.close().await;
        return Err(
            "This business database is too old to upgrade safely with this version.".into(),
        );
    }
    let pool = if current_version < SCHEMA_VERSION {
        pool.close().await;
        verify_database(path, true).await?;
        let backup = path.with_file_name(format!("soletrader.pre-migration-v{current_version}.db"));
        if !backup.exists() {
            fs::copy(path, &backup)
                .map_err(|error| format!("Could not create the pre-migration backup: {error}"))?;
            if let Err(error) = verify_database(&backup, false).await {
                let _ = fs::remove_file(&backup);
                return Err(format!("Pre-migration backup verification failed: {error}"));
            }
        }
        connect().await.map_err(|error| error.to_string())?
    } else {
        pool
    };
    sqlx::query("BEGIN IMMEDIATE")
        .execute(&pool)
        .await
        .map_err(|error| error.to_string())?;
    let migration_result: Result<(), String> = async {
        for (index, migration) in MIGRATIONS.iter().enumerate().skip(current_version as usize) {
            sqlx::raw_sql(migration)
                .execute(&pool)
                .await
                .map_err(|error| {
                    format!("Business database migration {} failed: {error}", index + 1)
                })?;
        }
        sqlx::query("CREATE TABLE IF NOT EXISTS workspace_schema (version INTEGER NOT NULL)")
            .execute(&pool)
            .await
            .map_err(|error| error.to_string())?;
        sqlx::query("DELETE FROM workspace_schema")
            .execute(&pool)
            .await
            .map_err(|error| error.to_string())?;
        sqlx::query("INSERT INTO workspace_schema (version) VALUES (?)")
            .bind(SCHEMA_VERSION)
            .execute(&pool)
            .await
            .map_err(|error| error.to_string())?;
        Ok(())
    }
    .await;
    if let Err(error) = migration_result {
        let _ = sqlx::query("ROLLBACK").execute(&pool).await;
        pool.close().await;
        return Err(error);
    }
    sqlx::query("COMMIT")
        .execute(&pool)
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    verify_database(path, false).await
}

async fn adopt_legacy_business_at(app_data: &Path) -> Result<Vec<BusinessWorkspace>, String> {
    let legacy_database = app_data.join("soletrader.db");
    if !legacy_database.exists() {
        return Ok(Vec::new());
    }
    let id = format!("business-{}", Uuid::new_v4().simple());
    let directory = workspace_dir_at(app_data, &id)?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    verify_database(&legacy_database, true).await?;
    let workspace_database = directory.join("soletrader.db");
    fs::copy(&legacy_database, &workspace_database)
        .map_err(|error| format!("Could not copy the existing business database: {error}"))?;
    if let Err(error) = verify_database(&workspace_database, false).await {
        let _ = fs::remove_dir_all(&directory);
        return Err(error);
    }
    let timestamp = now_millis()?;
    let workspace = BusinessWorkspace {
        id,
        name: "My Business".into(),
        archived: false,
        created_at: timestamp,
        updated_at: timestamp,
    };
    write_catalog_at(&catalog_path_at(app_data), &[workspace.clone()])?;
    move_legacy_directory(&app_data.join("receipts"), &directory.join("receipts"))?;
    move_legacy_directory(&app_data.join("documents"), &directory.join("documents"))?;
    merge_legacy_directory(
        &app_data.join("invoice-archive"),
        &directory.join("invoice-archive"),
    )?;
    fs::rename(
        &legacy_database,
        app_data.join("soletrader.pre-workspaces.db"),
    )
    .map_err(|error| format!("Could not retain the pre-workspace database backup: {error}"))?;
    Ok(vec![workspace])
}

async fn adopt_legacy_business(app: &AppHandle) -> Result<Vec<BusinessWorkspace>, String> {
    adopt_legacy_business_at(&app_data_dir(app)?).await
}

async fn set_business_archived_at(app_data: &Path, id: &str, archived: bool) -> Result<(), String> {
    let catalog = catalog_path_at(app_data);
    let mut workspaces = read_catalog_at(&catalog)?;
    let workspace = workspaces
        .iter_mut()
        .find(|workspace| workspace.id == id)
        .ok_or("Business workspace was not found.")?;
    if !archived {
        prepare_database(&workspace_dir_at(app_data, id)?.join("soletrader.db")).await?;
    }
    workspace.archived = archived;
    workspace.updated_at = now_millis()?;
    write_catalog_at(&catalog, &workspaces)
}

#[tauri::command]
pub async fn list_business_workspaces(app: AppHandle) -> Result<Vec<BusinessWorkspace>, String> {
    let _guard = CATALOG_LOCK.get_or_init(|| Mutex::new(())).lock().await;
    cleanup_staging_directories(&businesses_dir(&app)?, ".business-", ".restore")?;
    let workspaces = read_catalog(&app)?;
    if workspaces.is_empty() {
        return adopt_legacy_business(&app).await;
    }
    if let Some(original) = workspaces
        .iter()
        .min_by_key(|workspace| workspace.created_at)
    {
        merge_legacy_directory(
            &app_data_dir(&app)?.join("invoice-archive"),
            &workspace_dir(&app, &original.id)?.join("invoice-archive"),
        )?;
    }
    for workspace in workspaces.iter().filter(|workspace| !workspace.archived) {
        prepare_database(&workspace_database_path(&app, &workspace.id)?).await?;
    }
    Ok(workspaces)
}

#[tauri::command]
pub async fn prepare_business_workspace(app: AppHandle, id: String) -> Result<(), String> {
    let _guard = CATALOG_LOCK.get_or_init(|| Mutex::new(())).lock().await;
    if !read_catalog(&app)?
        .iter()
        .any(|workspace| workspace.id == id && !workspace.archived)
    {
        return Err("Active business workspace was not found.".into());
    }
    prepare_database(&workspace_database_path(&app, &id)?).await
}

#[tauri::command]
pub async fn create_business_workspace(
    app: AppHandle,
    name: String,
) -> Result<BusinessWorkspace, String> {
    let _guard = CATALOG_LOCK.get_or_init(|| Mutex::new(())).lock().await;
    let name = name.trim();
    if name.len() < 2 || name.len() > 100 {
        return Err("Business name must be between 2 and 100 characters.".into());
    }
    let mut workspaces = read_catalog(&app)?;
    let id = format!("business-{}", Uuid::new_v4().simple());
    let directory = workspace_dir(&app, &id)?;
    fs::create_dir_all(directory.join("receipts")).map_err(|error| error.to_string())?;
    fs::create_dir_all(directory.join("documents")).map_err(|error| error.to_string())?;
    fs::create_dir_all(directory.join("invoice-archive")).map_err(|error| error.to_string())?;
    if let Err(error) = initialise_database(&directory.join("soletrader.db")).await {
        let _ = fs::remove_dir_all(&directory);
        return Err(error);
    }
    let timestamp = now_millis()?;
    let workspace = BusinessWorkspace {
        id,
        name: name.into(),
        archived: false,
        created_at: timestamp,
        updated_at: timestamp,
    };
    workspaces.push(workspace.clone());
    write_catalog(&app, &workspaces)?;
    Ok(workspace)
}

#[tauri::command]
pub async fn set_business_archived(
    app: AppHandle,
    id: String,
    archived: bool,
) -> Result<(), String> {
    let _guard = CATALOG_LOCK.get_or_init(|| Mutex::new(())).lock().await;
    set_business_archived_at(&app_data_dir(&app)?, &id, archived).await
}

#[tauri::command]
pub async fn audit_business_files(app: AppHandle, id: String) -> Result<FileAuditResult, String> {
    let _guard = CATALOG_LOCK.get_or_init(|| Mutex::new(())).lock().await;
    if !read_catalog(&app)?
        .iter()
        .any(|workspace| workspace.id == id)
    {
        return Err("Business workspace was not found.".into());
    }
    audit_workspace_files_at(&workspace_dir(&app, &id)?).await
}

#[tauri::command]
pub async fn backup_business_workspace(
    app: AppHandle,
    id: String,
    destination: String,
) -> Result<String, String> {
    let _guard = CATALOG_LOCK.get_or_init(|| Mutex::new(())).lock().await;
    let workspace = read_catalog(&app)?
        .into_iter()
        .find(|workspace| workspace.id == id)
        .ok_or("Business workspace was not found.")?;
    let source = workspace_dir(&app, &workspace.id)?;
    prepare_database(&source.join("soletrader.db")).await?;
    verify_database(&source.join("soletrader.db"), true).await?;
    let destination = PathBuf::from(destination)
        .canonicalize()
        .map_err(|error| format!("Backup destination is unavailable: {error}"))?;
    let canonical_source = source.canonicalize().map_err(|error| error.to_string())?;
    if destination.starts_with(&canonical_source) {
        return Err("Choose a backup destination outside the business workspace.".into());
    }
    cleanup_staging_directories(&destination, ".soletrader-backup-", ".creating")?;
    let backup_name = format!("soletrader-backup-{}", now_millis()?);
    let backup = destination.join(&backup_name);
    let temporary = destination.join(format!(".{backup_name}.creating"));
    if backup.exists() {
        return Err("The backup destination already exists.".into());
    }
    let data = temporary.join("data");
    fs::create_dir_all(&data).map_err(|error| error.to_string())?;
    let mut files = Vec::new();
    if let Err(error) = copy_workspace_files(&source, &data, Path::new(""), &mut files) {
        let _ = fs::remove_dir_all(&temporary);
        return Err(error);
    }
    files.retain(|file| file.path != "soletrader.db");
    let snapshot = data.join("soletrader.db");
    if let Err(error) = snapshot_database(&source.join("soletrader.db"), &snapshot).await {
        let _ = fs::remove_dir_all(&temporary);
        return Err(error);
    }
    let (size, sha256) = hash_file(&snapshot)?;
    files.push(BackupFile {
        path: "soletrader.db".into(),
        size,
        sha256,
    });
    files.sort_by(|left, right| left.path.cmp(&right.path));
    let manifest = BackupManifest {
        format_version: BACKUP_FORMAT_VERSION,
        schema_version: SCHEMA_VERSION,
        workspace_name: workspace.name,
        created_at: now_millis()?,
        files,
    };
    if let Err(error) = fs::write(
        temporary.join("manifest.json"),
        serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?,
    ) {
        let _ = fs::remove_dir_all(&temporary);
        return Err(error.to_string());
    }
    if let Err(error) = fs::rename(&temporary, &backup) {
        let _ = fs::remove_dir_all(&temporary);
        return Err(format!("Could not publish the completed backup: {error}"));
    }
    Ok(backup.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn restore_business_workspace(
    app: AppHandle,
    source: String,
) -> Result<BusinessWorkspace, String> {
    let _guard = CATALOG_LOCK.get_or_init(|| Mutex::new(())).lock().await;
    cleanup_staging_directories(&businesses_dir(&app)?, ".business-", ".restore")?;
    let source = PathBuf::from(source);
    let manifest: BackupManifest = serde_json::from_slice(
        &fs::read(source.join("manifest.json"))
            .map_err(|error| format!("Could not read the backup manifest: {error}"))?,
    )
    .map_err(|error| format!("Backup manifest is invalid: {error}"))?;
    if manifest.format_version != BACKUP_FORMAT_VERSION
        || !(14..=SCHEMA_VERSION).contains(&manifest.schema_version)
    {
        return Err("This backup version is not supported by the installed application.".into());
    }
    if manifest.workspace_name.trim().len() < 2 || manifest.workspace_name.len() > 100 {
        return Err("Backup contains an invalid business name.".into());
    }
    verify_backup_files(&source, &manifest)?;
    let id = format!("business-{}", Uuid::new_v4().simple());
    let temporary = businesses_dir(&app)?.join(format!(".{id}.restore"));
    let directory = workspace_dir(&app, &id)?;
    fs::create_dir_all(&temporary).map_err(|error| error.to_string())?;
    for file in &manifest.files {
        let relative = PathBuf::from(&file.path);
        let target = temporary.join(&relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        if let Err(error) = fs::copy(source.join("data").join(&relative), target) {
            let _ = fs::remove_dir_all(&temporary);
            return Err(error.to_string());
        }
    }
    if let Err(error) = verify_staged_files(&temporary, &manifest) {
        let _ = fs::remove_dir_all(&temporary);
        return Err(error);
    }
    if let Err(error) = verify_database(&temporary.join("soletrader.db"), false).await {
        let _ = fs::remove_dir_all(&temporary);
        return Err(error);
    }
    if let Err(error) = prepare_database(&temporary.join("soletrader.db")).await {
        let _ = fs::remove_dir_all(&temporary);
        return Err(error);
    }
    if let Err(error) = fs::rename(&temporary, &directory) {
        let _ = fs::remove_dir_all(&temporary);
        return Err(error.to_string());
    }
    let timestamp = now_millis()?;
    let suffix = " (Restored)";
    let mut restored_name = manifest.workspace_name;
    restored_name.truncate(100 - suffix.len());
    restored_name.push_str(suffix);
    let workspace = BusinessWorkspace {
        id,
        name: restored_name,
        archived: false,
        created_at: timestamp,
        updated_at: timestamp,
    };
    let mut workspaces = read_catalog(&app)?;
    workspaces.push(workspace.clone());
    if let Err(error) = write_catalog(&app, &workspaces) {
        let _ = fs::remove_dir_all(&directory);
        return Err(error);
    }
    Ok(workspace)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary_directory(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!("soletrader-{label}-{}", Uuid::new_v4().simple()))
    }

    #[tokio::test]
    async fn initialises_a_current_schema_database() {
        let directory = temporary_directory("database-test");
        fs::create_dir_all(&directory).unwrap();
        let database = directory.join("soletrader.db");
        initialise_database(&database).await.unwrap();
        verify_database(&database, false).await.unwrap();
        let options = SqliteConnectOptions::new().filename(&database);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .unwrap();
        let version: i64 = sqlx::query_scalar("SELECT version FROM workspace_schema")
            .fetch_one(&pool)
            .await
            .unwrap();
        let current_year = sqlx::query_as::<_, (String, String, String, f64, f64, f64)>(
            "SELECT year_start, year_end, tax_year, class2_small_profits_threshold, student_loan_plan1_threshold, dividend_basic_rate FROM tax_year_config WHERE tax_year = '2026/27'",
        ).fetch_one(&pool).await.unwrap();
        pool.close().await;
        assert_eq!(version, SCHEMA_VERSION);
        assert_eq!(
            current_year,
            (
                "2026-04-06".into(),
                "2027-04-05".into(),
                "2026/27".into(),
                7105.0,
                26900.0,
                10.75
            )
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn keeps_business_database_records_isolated() {
        let directory = temporary_directory("workspace-isolation-test");
        fs::create_dir_all(&directory).unwrap();
        let first_database = directory.join("first.db");
        let second_database = directory.join("second.db");
        initialise_database(&first_database).await.unwrap();
        initialise_database(&second_database).await.unwrap();

        let first_pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(SqliteConnectOptions::new().filename(&first_database))
            .await
            .unwrap();
        sqlx::query("INSERT INTO clients (name) VALUES ('First business client')")
            .execute(&first_pool)
            .await
            .unwrap();
        first_pool.close().await;

        let second_pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(SqliteConnectOptions::new().filename(&second_database))
            .await
            .unwrap();
        let leaked_records: i64 =
            sqlx::query_scalar("SELECT COUNT(1) FROM clients WHERE name = 'First business client'")
                .fetch_one(&second_pool)
                .await
                .unwrap();
        second_pool.close().await;

        assert_eq!(leaked_records, 0);
        fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn adopts_legacy_database_and_files_non_destructively() {
        let app_data = temporary_directory("legacy-adoption-test");
        fs::create_dir_all(&app_data).unwrap();
        let legacy_database = app_data.join("soletrader.db");
        initialise_database(&legacy_database).await.unwrap();
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(SqliteConnectOptions::new().filename(&legacy_database))
            .await
            .unwrap();
        sqlx::query("INSERT INTO clients (name) VALUES ('Retained legacy client')")
            .execute(&pool)
            .await
            .unwrap();
        pool.close().await;
        for (directory, file) in [
            ("receipts", "receipt.jpg"),
            ("documents", "contract.pdf"),
            ("invoice-archive", "invoice.pdf"),
        ] {
            fs::create_dir_all(app_data.join(directory)).unwrap();
            fs::write(app_data.join(directory).join(file), b"retained evidence").unwrap();
        }

        let workspaces = adopt_legacy_business_at(&app_data).await.unwrap();

        assert_eq!(workspaces.len(), 1);
        let workspace = &workspaces[0];
        let adopted_directory = workspace_dir_at(&app_data, &workspace.id).unwrap();
        assert!(!legacy_database.exists());
        assert!(app_data.join("soletrader.pre-workspaces.db").exists());
        assert!(adopted_directory.join("receipts/receipt.jpg").exists());
        assert!(adopted_directory.join("documents/contract.pdf").exists());
        assert!(adopted_directory
            .join("invoice-archive/invoice.pdf")
            .exists());
        let adopted_pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                SqliteConnectOptions::new().filename(adopted_directory.join("soletrader.db")),
            )
            .await
            .unwrap();
        let retained_clients: i64 = sqlx::query_scalar(
            "SELECT COUNT(1) FROM clients WHERE name = 'Retained legacy client'",
        )
        .fetch_one(&adopted_pool)
        .await
        .unwrap();
        adopted_pool.close().await;
        assert_eq!(retained_clients, 1);
        assert_eq!(
            read_catalog_at(&catalog_path_at(&app_data)).unwrap().len(),
            1
        );
        fs::remove_dir_all(app_data).unwrap();
    }

    #[tokio::test]
    async fn archives_and_reopens_an_existing_workspace_without_changing_its_data() {
        let app_data = temporary_directory("workspace-archive-test");
        let workspace = BusinessWorkspace {
            id: "business-archive-test".into(),
            name: "Archive Test".into(),
            archived: false,
            created_at: 1,
            updated_at: 1,
        };
        let directory = workspace_dir_at(&app_data, &workspace.id).unwrap();
        fs::create_dir_all(&directory).unwrap();
        initialise_database(&directory.join("soletrader.db"))
            .await
            .unwrap();
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(SqliteConnectOptions::new().filename(directory.join("soletrader.db")))
            .await
            .unwrap();
        sqlx::query("INSERT INTO clients (name) VALUES ('Archived client')")
            .execute(&pool)
            .await
            .unwrap();
        pool.close().await;
        write_catalog_at(&catalog_path_at(&app_data), &[workspace]).unwrap();

        set_business_archived_at(&app_data, "business-archive-test", true)
            .await
            .unwrap();
        assert!(read_catalog_at(&catalog_path_at(&app_data)).unwrap()[0].archived);
        set_business_archived_at(&app_data, "business-archive-test", false)
            .await
            .unwrap();

        let reopened = read_catalog_at(&catalog_path_at(&app_data)).unwrap();
        assert!(!reopened[0].archived);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(SqliteConnectOptions::new().filename(directory.join("soletrader.db")))
            .await
            .unwrap();
        let retained_clients: i64 =
            sqlx::query_scalar("SELECT COUNT(1) FROM clients WHERE name = 'Archived client'")
                .fetch_one(&pool)
                .await
                .unwrap();
        pool.close().await;
        assert_eq!(retained_clients, 1);
        fs::remove_dir_all(app_data).unwrap();
    }

    #[tokio::test]
    async fn current_year_expense_reaches_dashboard_money_out() {
        let directory = temporary_directory("dashboard-expense-test");
        fs::create_dir_all(&directory).unwrap();
        let database = directory.join("soletrader.db");
        initialise_database(&database).await.unwrap();
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(&database)
                    .foreign_keys(true),
            )
            .await
            .unwrap();
        let category: i64 =
            sqlx::query_scalar("SELECT id FROM expense_categories ORDER BY id LIMIT 1")
                .fetch_one(&pool)
                .await
                .unwrap();
        sqlx::query("INSERT INTO expenses (category_id, date, supplier, description, amount, business_percent, tax_year) VALUES (?, '2026-07-30', 'Screwfix', 'Work Boots', 99.99, 100, '2026/27')")
            .bind(category).execute(&pool).await.unwrap();
        let current_money_out: f64 = sqlx::query_scalar(
            "SELECT CAST(COALESCE(SUM((amount - CASE WHEN (SELECT vat_status FROM user_profile WHERE id = 1) != 'unregistered' THEN vat_amount ELSE 0 END) * business_percent / 100), 0) AS REAL) FROM expenses WHERE deleted_at IS NULL AND date BETWEEN '2026-04-06' AND '2027-04-05'",
        ).fetch_one(&pool).await.unwrap();
        let previous_money_out: f64 = sqlx::query_scalar(
            "SELECT CAST(COALESCE(SUM(amount * business_percent / 100), 0) AS REAL) FROM expenses WHERE deleted_at IS NULL AND date BETWEEN '2025-04-06' AND '2026-04-05'",
        ).fetch_one(&pool).await.unwrap();
        assert!((current_money_out - 99.99).abs() < 0.001);
        assert_eq!(previous_money_out, 0.0);
        pool.close().await;
        fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn upgrades_version_14_and_enforces_filed_period_locks() {
        let directory = temporary_directory("migration-test");
        fs::create_dir_all(&directory).unwrap();
        let database = directory.join("soletrader.db");
        let options = SqliteConnectOptions::new()
            .filename(&database)
            .create_if_missing(true)
            .foreign_keys(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .unwrap();
        for migration in MIGRATIONS.iter().take(14) {
            sqlx::raw_sql(migration).execute(&pool).await.unwrap();
        }
        sqlx::query("CREATE TABLE workspace_schema (version INTEGER NOT NULL)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO workspace_schema VALUES (14)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO clients (id, name) VALUES (1, 'Client')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO tax_year_config (tax_year, year_start, year_end) VALUES ('2026/27', '2026-04-06', '2027-04-05')").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO invoices (id, client_id, invoice_number, status, issue_date, due_date, subtotal, vat_amount, total) VALUES (1, 1, 'INV-001', 'sent', '2026-04-10', '2026-05-10', 100, 20, 120)").execute(&pool).await.unwrap();
        let category: i64 = sqlx::query_scalar("SELECT id FROM expense_categories LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO expenses (id, category_id, date, description, amount, vat_amount) VALUES (1, ?, '2026-04-10', 'Asset', 120, 20)")
            .bind(category).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO vat_return_snapshots (period_start, period_end, tax_year, scheme, box1, box2, box3, box4, box5, box6, box7, box8, box9) VALUES ('2026-04-01', '2026-06-30', '2026/27', 'standard', 20, 0, 20, 0, 20, 100, 0, 0, 0)").execute(&pool).await.unwrap();
        pool.close().await;
        prepare_database(&database).await.unwrap();
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(&database)
                    .foreign_keys(true),
            )
            .await
            .unwrap();
        let version: i64 = sqlx::query_scalar("SELECT version FROM workspace_schema")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(version, SCHEMA_VERSION);
        sqlx::query("UPDATE invoices SET status = 'overdue' WHERE id = 1")
            .execute(&pool)
            .await
            .unwrap();
        let locked = sqlx::query("UPDATE invoices SET subtotal = 110, total = 130 WHERE id = 1")
            .execute(&pool)
            .await
            .unwrap_err();
        assert!(locked.to_string().contains("filed VAT period"));
        assert!(
            sqlx::query("UPDATE invoices SET vat_ec_supply = 1 WHERE id = 1")
                .execute(&pool)
                .await
                .unwrap_err()
                .to_string()
                .contains("filed VAT period")
        );
        assert!(
            sqlx::query("UPDATE expenses SET vat_capital_asset = 1 WHERE id = 1")
                .execute(&pool)
                .await
                .unwrap_err()
                .to_string()
                .contains("filed VAT period")
        );
        sqlx::query("INSERT INTO vat_adjustments (filed_return_id, adjustment_date, reason, box1) VALUES (1, '2026-07-01', 'Late correction', 2)").execute(&pool).await.unwrap();
        let immutable = sqlx::query("UPDATE vat_adjustments SET reason = 'Changed' WHERE id = 1")
            .execute(&pool)
            .await
            .unwrap_err();
        assert!(immutable.to_string().contains("cannot be changed"));
        assert!(sqlx::query("DELETE FROM audit_log")
            .execute(&pool)
            .await
            .unwrap_err()
            .to_string()
            .contains("cannot be deleted"));
        pool.close().await;
        fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn upgrades_every_supported_previous_schema_version() {
        for starting_version in 14..SCHEMA_VERSION {
            let directory = temporary_directory(&format!("migration-{starting_version}-test"));
            fs::create_dir_all(&directory).unwrap();
            let database = directory.join("soletrader.db");
            let options = SqliteConnectOptions::new()
                .filename(&database)
                .create_if_missing(true)
                .foreign_keys(true);
            let pool = SqlitePoolOptions::new()
                .max_connections(1)
                .connect_with(options)
                .await
                .unwrap();
            for migration in MIGRATIONS.iter().take(starting_version as usize) {
                sqlx::raw_sql(migration).execute(&pool).await.unwrap();
            }
            sqlx::query("CREATE TABLE workspace_schema (version INTEGER NOT NULL)")
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query("INSERT INTO workspace_schema VALUES (?)")
                .bind(starting_version)
                .execute(&pool)
                .await
                .unwrap();
            pool.close().await;

            prepare_database(&database).await.unwrap();
            verify_database(&database, false).await.unwrap();
            let backup = directory.join(format!("soletrader.pre-migration-v{starting_version}.db"));
            assert!(backup.exists());
            verify_database(&backup, false).await.unwrap();
            let backup_pool = SqlitePoolOptions::new()
                .max_connections(1)
                .connect_with(SqliteConnectOptions::new().filename(&backup))
                .await
                .unwrap();
            let backup_version: i64 = sqlx::query_scalar("SELECT version FROM workspace_schema")
                .fetch_one(&backup_pool)
                .await
                .unwrap();
            backup_pool.close().await;
            assert_eq!(backup_version, starting_version);
            let pool = SqlitePoolOptions::new()
                .max_connections(1)
                .connect_with(SqliteConnectOptions::new().filename(&database))
                .await
                .unwrap();
            let version: i64 = sqlx::query_scalar("SELECT version FROM workspace_schema")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(
                version, SCHEMA_VERSION,
                "failed upgrade from schema {starting_version}"
            );
            pool.close().await;
            fs::remove_dir_all(directory).unwrap();
        }
    }

    #[tokio::test]
    async fn audits_financial_import_and_settings_mutations() {
        let directory = temporary_directory("expanded-audit-test");
        fs::create_dir_all(&directory).unwrap();
        let database = directory.join("soletrader.db");
        initialise_database(&database).await.unwrap();
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(&database)
                    .foreign_keys(true),
            )
            .await
            .unwrap();

        sqlx::query("UPDATE user_profile SET trading_name = 'Audited business' WHERE id = 1")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("UPDATE vat_settings SET reminders_enabled = 0 WHERE id = 1")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO bank_import_batches (source_file, imported_rows, date_from, date_to) VALUES ('statement.csv', 1, '2026-07-01', '2026-07-01')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO clients (id, name) VALUES (9001, 'Audit client')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO invoices (id, client_id, invoice_number, status, issue_date, due_date, subtotal, vat_amount, total, tax_year) VALUES (9001, 9001, 'AUDIT-001', 'sent', '2026-07-01', '2026-07-31', 100, 20, 120, '2026/27')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO invoice_payments (invoice_id, amount, payment_date) VALUES (9001, 50, '2026-07-10')")
            .execute(&pool)
            .await
            .unwrap();

        for entity_type in ["profile", "vat_settings", "bank_import", "invoice_payment"] {
            let count: i64 =
                sqlx::query_scalar("SELECT COUNT(1) FROM audit_log WHERE entity_type = ?")
                    .bind(entity_type)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert!(count > 0, "missing audit event for {entity_type}");
        }

        pool.close().await;
        fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn enforces_financial_relationships_at_the_database_boundary() {
        let directory = temporary_directory("constraints-test");
        fs::create_dir_all(&directory).unwrap();
        let database = directory.join("soletrader.db");
        initialise_database(&database).await.unwrap();
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(&database)
                    .foreign_keys(true),
            )
            .await
            .unwrap();
        sqlx::query("INSERT INTO clients (id, name) VALUES (1, 'Client')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO invoices (id, client_id, invoice_number, status, issue_date, due_date, subtotal, vat_amount, total) VALUES (1, 1, 'INV-001', 'sent', '2026-07-01', '2026-07-31', 100, 20, 120)").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO invoice_payments (id, invoice_id, amount, payment_date) VALUES (1, 1, 80, '2026-07-10')").execute(&pool).await.unwrap();
        let paid: f64 = sqlx::query_scalar("SELECT amount_paid FROM invoices WHERE id = 1")
            .fetch_one(&pool)
            .await
            .unwrap();
        let cash: f64 = sqlx::query_scalar("SELECT cash_amount FROM invoice_payments WHERE id = 1")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(paid, 80.0);
        assert_eq!(cash, 80.0);
        assert!(sqlx::query("INSERT INTO invoice_payments (invoice_id, amount, payment_date) VALUES (1, 50, '2026-07-11')").execute(&pool).await.unwrap_err().to_string().contains("cannot exceed"));
        sqlx::query("INSERT INTO credit_notes (invoice_id, credit_number, amount, issue_date) VALUES (1, 'CN-001', 100, '2026-07-12')").execute(&pool).await.unwrap();
        assert!(sqlx::query("INSERT INTO credit_notes (invoice_id, credit_number, amount, issue_date) VALUES (1, 'CN-002', 21, '2026-07-13')").execute(&pool).await.unwrap_err().to_string().contains("cannot exceed"));
        let category: i64 = sqlx::query_scalar("SELECT id FROM expense_categories LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(sqlx::query("INSERT INTO expenses (category_id, date, description, amount, vat_amount) VALUES (?, '2026-07-01', 'Invalid', 10, 11)").bind(category).execute(&pool).await.unwrap_err().to_string().contains("invalid financial"));
        sqlx::query("INSERT INTO bank_transactions (id, transaction_date, description, amount_in, matched_payment_id, status) VALUES (1, '2026-07-10', 'Payment one', 80, 1, 'matched')").execute(&pool).await.unwrap();
        assert!(sqlx::query("INSERT INTO bank_transactions (id, transaction_date, description, amount_in, matched_payment_id, status) VALUES (2, '2026-07-10', 'Payment two', 80, 1, 'matched')").execute(&pool).await.is_err());
        pool.close().await;
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn verifies_backup_files_and_rejects_tampering() {
        let source = temporary_directory("backup-source");
        let backup = temporary_directory("backup-package");
        fs::create_dir_all(source.join("receipts")).unwrap();
        fs::create_dir_all(backup.join("data")).unwrap();
        fs::write(source.join("soletrader.db"), b"database").unwrap();
        fs::write(source.join("receipts/receipt.txt"), b"receipt").unwrap();
        let mut files = Vec::new();
        copy_workspace_files(&source, &backup.join("data"), Path::new(""), &mut files).unwrap();
        let manifest = BackupManifest {
            format_version: BACKUP_FORMAT_VERSION,
            schema_version: SCHEMA_VERSION,
            workspace_name: "Test Business".into(),
            created_at: 1,
            files,
        };
        verify_backup_files(&backup, &manifest).unwrap();
        fs::write(backup.join("data/receipts/receipt.txt"), b"changed").unwrap();
        assert!(verify_backup_files(&backup, &manifest)
            .unwrap_err()
            .contains("verification failed"));
        fs::remove_dir_all(source).unwrap();
        fs::remove_dir_all(backup).unwrap();
    }

    #[tokio::test]
    async fn round_trips_a_database_and_attachments() {
        let source = temporary_directory("roundtrip-source");
        let package = temporary_directory("roundtrip-package");
        let restored = temporary_directory("roundtrip-restored");
        fs::create_dir_all(source.join("receipts")).unwrap();
        fs::create_dir_all(package.join("data")).unwrap();
        fs::create_dir_all(&restored).unwrap();
        initialise_database(&source.join("soletrader.db"))
            .await
            .unwrap();
        fs::write(source.join("receipts/evidence.txt"), b"receipt evidence").unwrap();
        let mut files = Vec::new();
        copy_workspace_files(&source, &package.join("data"), Path::new(""), &mut files).unwrap();
        let manifest = BackupManifest {
            format_version: BACKUP_FORMAT_VERSION,
            schema_version: SCHEMA_VERSION,
            workspace_name: "Round Trip".into(),
            created_at: 1,
            files,
        };
        verify_backup_files(&package, &manifest).unwrap();
        for file in &manifest.files {
            let relative = PathBuf::from(&file.path);
            let target = restored.join(&relative);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).unwrap();
            }
            fs::copy(package.join("data").join(relative), target).unwrap();
        }
        verify_database(&restored.join("soletrader.db"), false)
            .await
            .unwrap();
        assert_eq!(
            fs::read(restored.join("receipts/evidence.txt")).unwrap(),
            b"receipt evidence"
        );
        fs::remove_dir_all(source).unwrap();
        fs::remove_dir_all(package).unwrap();
        fs::remove_dir_all(restored).unwrap();
    }

    #[test]
    fn removes_interrupted_backup_staging_without_touching_published_backups() {
        let root = temporary_directory("backup-interruption");
        let staging = root.join(".soletrader-backup-123.creating");
        let published = root.join("soletrader-backup-122");
        fs::create_dir_all(&staging).unwrap();
        fs::create_dir_all(&published).unwrap();
        fs::write(staging.join("partial"), b"partial").unwrap();
        fs::write(published.join("manifest.json"), b"published").unwrap();
        cleanup_staging_directories(&root, ".soletrader-backup-", ".creating").unwrap();
        assert!(!staging.exists());
        assert_eq!(
            fs::read(published.join("manifest.json")).unwrap(),
            b"published"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn removes_interrupted_restore_staging_without_touching_workspaces() {
        let root = temporary_directory("restore-interruption");
        let staging = root.join(".business-12345678.restore");
        let workspace = root.join("business-87654321");
        fs::create_dir_all(&staging).unwrap();
        fs::create_dir_all(&workspace).unwrap();
        fs::write(staging.join("soletrader.db"), b"partial").unwrap();
        fs::write(workspace.join("soletrader.db"), b"active").unwrap();
        cleanup_staging_directories(&root, ".business-", ".restore").unwrap();
        assert!(!staging.exists());
        assert_eq!(
            fs::read(workspace.join("soletrader.db")).unwrap(),
            b"active"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn reports_missing_and_orphaned_business_files() {
        let root = temporary_directory("file-audit");
        fs::create_dir_all(root.join("receipts")).unwrap();
        fs::create_dir_all(root.join("documents")).unwrap();
        initialise_database(&root.join("soletrader.db"))
            .await
            .unwrap();
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(root.join("soletrader.db"))
                    .foreign_keys(true),
            )
            .await
            .unwrap();
        let category: i64 = sqlx::query_scalar("SELECT id FROM expense_categories LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO expenses (category_id, date, description, amount, receipt_path, tax_year) VALUES (?, '2026-07-01', 'Missing receipt', 10, 'receipts/missing.pdf', '2026/27')").bind(category).execute(&pool).await.unwrap();
        pool.close().await;
        fs::write(root.join("documents/orphan.pdf"), b"orphan").unwrap();
        let audit = audit_workspace_files_at(&root).await.unwrap();
        assert_eq!(audit.missing, vec!["receipts/missing.pdf"]);
        assert_eq!(audit.orphaned, vec!["documents/orphan.pdf"]);
        fs::remove_dir_all(root).unwrap();
    }
}
