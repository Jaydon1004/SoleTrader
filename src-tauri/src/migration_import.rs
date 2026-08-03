use std::{collections::HashMap, path::Path};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use tauri::AppHandle;

use crate::transactions::tax_year_for_date;
use crate::workspaces::workspace_database_path;

#[derive(Deserialize)]
pub struct MigrationRowInput {
    values: Map<String, Value>,
    error: String,
}

#[derive(Deserialize)]
pub struct MigrationImportInput {
    workspace_id: String,
    kind: String,
    rows: Vec<MigrationRowInput>,
    default_category_id: Option<i64>,
}

#[derive(Debug, PartialEq, Serialize)]
pub struct MigrationImportResult {
    imported: u64,
    duplicates: u64,
    invalid: u64,
}

fn text(values: &Map<String, Value>, key: &str) -> String {
    values
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn number(values: &Map<String, Value>, key: &str) -> Result<f64, String> {
    values
        .get(key)
        .and_then(|value| value.as_f64().or_else(|| value.as_str()?.parse().ok()))
        .ok_or_else(|| format!("Import row has an invalid {key} value."))
}

async fn import_at(
    path: &Path,
    input: MigrationImportInput,
) -> Result<MigrationImportResult, String> {
    if !matches!(input.kind.as_str(), "clients" | "expenses") {
        return Err("Import type is invalid.".into());
    }
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(path)
                .foreign_keys(true),
        )
        .await
        .map_err(|error| error.to_string())?;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let invalid = input
        .rows
        .iter()
        .filter(|row| !row.error.is_empty())
        .count() as u64;
    let mut imported = 0;
    let mut duplicates = 0;

    if input.kind == "clients" {
        for row in input.rows.iter().filter(|row| row.error.is_empty()) {
            let name = text(&row.values, "name");
            if name.is_empty() {
                return Err("Imported clients require a name.".into());
            }
            let company = text(&row.values, "company");
            let email = text(&row.values, "email");
            let exists = sqlx::query_scalar::<_, i64>("SELECT EXISTS(SELECT 1 FROM clients WHERE (lower(name) = lower(?) AND lower(company) = lower(?)) OR (? != '' AND lower(email) = lower(?)))")
                .bind(&name).bind(&company).bind(&email).bind(&email).fetch_one(&mut *transaction).await.map_err(|error| error.to_string())?;
            if exists == 1 {
                duplicates += 1;
                continue;
            }
            sqlx::query("INSERT INTO clients (name, company, email, phone, address_line_1, city, county, postcode, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
                .bind(name).bind(company).bind(email).bind(text(&row.values, "phone")).bind(text(&row.values, "address"))
                .bind(text(&row.values, "city")).bind(text(&row.values, "county")).bind(text(&row.values, "postcode")).bind(text(&row.values, "notes"))
                .execute(&mut *transaction).await.map_err(|error| error.to_string())?;
            imported += 1;
        }
    } else {
        let fallback = input
            .default_category_id
            .ok_or("Choose a fallback expense category.")?;
        let categories =
            sqlx::query_as::<_, (i64, String)>("SELECT id, name FROM expense_categories")
                .fetch_all(&mut *transaction)
                .await
                .map_err(|error| error.to_string())?;
        if !categories.iter().any(|category| category.0 == fallback) {
            return Err("Fallback expense category was not found.".into());
        }
        let category_ids: HashMap<String, i64> = categories
            .into_iter()
            .map(|category| (category.1.trim().to_lowercase(), category.0))
            .collect();
        for row in input.rows.iter().filter(|row| row.error.is_empty()) {
            let date = text(&row.values, "date");
            let description = text(&row.values, "description");
            let amount = number(&row.values, "amount")?;
            let vat = number(&row.values, "vat")?;
            let business_percent = number(&row.values, "businessPercent")?;
            let tax_year = tax_year_for_date(&date)?;
            if description.is_empty()
                || !amount.is_finite()
                || amount <= 0.0
                || !vat.is_finite()
                || vat < 0.0
                || vat > amount
                || !business_percent.is_finite()
                || !(0.0..=100.0).contains(&business_percent)
                || business_percent == 0.0
            {
                return Err("Imported expense values are invalid.".into());
            }
            let exists = sqlx::query_scalar::<_, i64>("SELECT EXISTS(SELECT 1 FROM expenses WHERE date = ? AND amount = ? AND lower(description) = lower(?) AND deleted_at IS NULL)")
                .bind(&date).bind(amount).bind(&description).fetch_one(&mut *transaction).await.map_err(|error| error.to_string())?;
            if exists == 1 {
                duplicates += 1;
                continue;
            }
            let category_id = category_ids
                .get(&text(&row.values, "category").to_lowercase())
                .copied()
                .unwrap_or(fallback);
            sqlx::query("INSERT INTO expenses (category_id, date, supplier, description, amount, vat_amount, business_percent, notes, tax_year, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))")
                .bind(category_id).bind(date).bind(text(&row.values, "supplier")).bind(description).bind(amount).bind(vat).bind(business_percent).bind(text(&row.values, "notes")).bind(tax_year)
                .execute(&mut *transaction).await.map_err(|error| error.to_string())?;
            imported += 1;
        }
    }
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(MigrationImportResult {
        imported,
        duplicates,
        invalid,
    })
}

#[tauri::command]
pub async fn import_migration_rows(
    app: AppHandle,
    input: MigrationImportInput,
) -> Result<MigrationImportResult, String> {
    let path = workspace_database_path(&app, &input.workspace_id)?;
    import_at(&path, input).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspaces::initialise_database;
    use uuid::Uuid;

    fn row(values: Value) -> MigrationRowInput {
        MigrationRowInput {
            values: values.as_object().unwrap().clone(),
            error: String::new(),
        }
    }

    #[tokio::test]
    async fn rolls_back_import_when_a_later_row_fails_native_validation() {
        let directory =
            std::env::temp_dir().join(format!("soletrader-import-{}", Uuid::new_v4().simple()));
        std::fs::create_dir_all(&directory).unwrap();
        let database = directory.join("soletrader.db");
        initialise_database(&database).await.unwrap();
        let input = MigrationImportInput {
            workspace_id: "test".into(),
            kind: "clients".into(),
            default_category_id: None,
            rows: vec![
                row(
                    serde_json::json!({"name":"Valid Client","company":"","email":"","phone":"","address":"","city":"","county":"","postcode":"","notes":""}),
                ),
                row(
                    serde_json::json!({"name":"","company":"","email":"","phone":"","address":"","city":"","county":"","postcode":"","notes":""}),
                ),
            ],
        };
        assert!(import_at(&database, input).await.is_err());
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(SqliteConnectOptions::new().filename(&database))
            .await
            .unwrap();
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM clients")
            .fetch_one(&pool)
            .await
            .unwrap();
        pool.close().await;
        assert_eq!(count, 0);
        std::fs::remove_dir_all(directory).unwrap();
    }
}
