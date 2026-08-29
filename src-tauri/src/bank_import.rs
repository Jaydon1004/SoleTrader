use std::{collections::HashSet, path::Path};

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    FromRow,
};
use tauri::AppHandle;

use crate::transactions::tax_year_for_date;
use crate::workspaces::workspace_database_path;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BankImportRowInput {
    transaction_date: String,
    description: String,
    amount_in: f64,
    amount_out: f64,
    balance: Option<f64>,
    fingerprint: String,
    raw_data: String,
    error: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportBankInput {
    workspace_id: String,
    source_file: String,
    rows: Vec<BankImportRowInput>,
}

#[derive(Serialize)]
pub struct ImportBankResult {
    imported: usize,
    duplicates: usize,
    matched: usize,
}

#[derive(FromRow, Clone)]
struct MatchCandidate {
    id: i64,
    record_id: i64,
    date: String,
    amount: f64,
}

fn best_match(
    date: &str,
    amount: f64,
    candidates: &[MatchCandidate],
    used: &HashSet<i64>,
    tolerance_days: i64,
    amount_tolerance: f64,
) -> Result<Option<(MatchCandidate, &'static str)>, String> {
    let date = NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map_err(|_| "Bank transaction date is invalid.")?;
    let mut ranked = Vec::new();
    for candidate in candidates
        .iter()
        .filter(|candidate| !used.contains(&candidate.id))
    {
        let candidate_date = NaiveDate::parse_from_str(&candidate.date, "%Y-%m-%d")
            .map_err(|_| "Match candidate date is invalid.")?;
        let days = (date - candidate_date).num_days().abs();
        let difference = (amount - candidate.amount).abs();
        if days <= tolerance_days && difference <= amount_tolerance {
            ranked.push((candidate.clone(), days, difference));
        }
    }
    ranked.sort_by(|left, right| {
        left.1
            .cmp(&right.1)
            .then_with(|| left.2.total_cmp(&right.2))
    });
    let Some(first) = ranked.first() else {
        return Ok(None);
    };
    if ranked
        .get(1)
        .is_some_and(|second| first.1 == second.1 && (first.2 - second.2).abs() < 0.0001)
    {
        return Ok(None);
    }
    let confidence = if first.1 == 0 && first.2 < 0.005 {
        "exact"
    } else {
        "near"
    };
    Ok(Some((first.0.clone(), confidence)))
}

async fn import_at(path: &Path, input: ImportBankInput) -> Result<ImportBankResult, String> {
    if input.source_file.trim().is_empty() || input.source_file.len() > 255 {
        return Err("Bank statement file name is invalid.".into());
    }
    let valid: Vec<_> = input
        .rows
        .iter()
        .filter(|row| row.error.is_empty())
        .collect();
    if valid.is_empty() {
        return Err("The preview does not contain any valid transactions.".into());
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
    let settings = sqlx::query_as::<_, (i64, f64)>("SELECT match_tolerance_days, amount_tolerance FROM bank_reconciliation_settings WHERE id = 1")
        .fetch_optional(&mut *transaction).await.map_err(|error| error.to_string())?.ok_or("Bank reconciliation settings are unavailable.")?;
    let mut seen = HashSet::new();
    let mut importable = Vec::new();
    for row in valid {
        if row.fingerprint.trim().is_empty()
            || !row.amount_in.is_finite()
            || row.amount_in < 0.0
            || !row.amount_out.is_finite()
            || row.amount_out < 0.0
            || (row.amount_in > 0.0) == (row.amount_out > 0.0)
        {
            return Err("Bank transaction values are invalid.".into());
        }
        tax_year_for_date(&row.transaction_date)?;
        let exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM bank_transactions WHERE hash = ?)",
        )
        .bind(&row.fingerprint)
        .fetch_one(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
        if !exists && seen.insert(row.fingerprint.clone()) {
            importable.push(row);
        }
    }
    let duplicates =
        input.rows.iter().filter(|row| row.error.is_empty()).count() - importable.len();
    if importable.is_empty() {
        transaction
            .rollback()
            .await
            .map_err(|error| error.to_string())?;
        pool.close().await;
        return Ok(ImportBankResult {
            imported: 0,
            duplicates,
            matched: 0,
        });
    }
    if importable.len() > 2000 {
        return Err("This statement contains more than 2,000 new transactions. Split the export into smaller date ranges before importing.".into());
    }
    let date_from = importable
        .iter()
        .map(|row| row.transaction_date.as_str())
        .min()
        .unwrap_or_default();
    let date_to = importable
        .iter()
        .map(|row| row.transaction_date.as_str())
        .max()
        .unwrap_or_default();
    let batch_id = sqlx::query("INSERT INTO bank_import_batches (source_file, imported_rows, duplicate_rows, date_from, date_to) VALUES (?, ?, ?, ?, ?)")
        .bind(input.source_file.trim()).bind(importable.len() as i64).bind(duplicates as i64).bind(date_from).bind(date_to)
        .execute(&mut *transaction).await.map_err(|error| error.to_string())?.last_insert_rowid();
    let payments = sqlx::query_as::<_, MatchCandidate>("SELECT p.id, p.invoice_id AS record_id, p.payment_date AS date, p.amount FROM invoice_payments p INNER JOIN invoices i ON i.id = p.invoice_id WHERE i.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM bank_transactions b WHERE b.matched_payment_id = p.id AND b.status = 'matched')")
        .fetch_all(&mut *transaction).await.map_err(|error| error.to_string())?;
    let expenses = sqlx::query_as::<_, MatchCandidate>("SELECT e.id, e.id AS record_id, e.date, e.amount FROM expenses e WHERE e.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM bank_transactions b WHERE b.matched_expense_id = e.id AND b.status = 'matched')")
        .fetch_all(&mut *transaction).await.map_err(|error| error.to_string())?;
    let mut used_payments = HashSet::new();
    let mut used_expenses = HashSet::new();
    let mut matched = 0;
    for row in &importable {
        let incoming = row.amount_in > 0.0;
        let matched_candidate = if incoming {
            best_match(
                &row.transaction_date,
                row.amount_in,
                &payments,
                &used_payments,
                settings.0,
                settings.1,
            )?
        } else {
            best_match(
                &row.transaction_date,
                row.amount_out,
                &expenses,
                &used_expenses,
                settings.0,
                settings.1,
            )?
        };
        let (record_id, candidate_id, confidence) =
            if let Some((candidate, confidence)) = matched_candidate {
                matched += 1;
                if incoming {
                    used_payments.insert(candidate.id);
                } else {
                    used_expenses.insert(candidate.id);
                }
                (Some(candidate.record_id), Some(candidate.id), confidence)
            } else {
                (None, None, "")
            };
        let classification = if candidate_id.is_none() { "unclassified" } else if incoming { "invoice_payment" } else { "expense" };
        sqlx::query("INSERT INTO bank_transactions (transaction_date, description, amount_in, amount_out, balance, matched_invoice_id, matched_expense_id, matched_payment_id, status, classification, source_file, hash, import_batch_id, tax_year, match_confidence, raw_data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))")
            .bind(&row.transaction_date).bind(row.description.trim()).bind(row.amount_in).bind(row.amount_out).bind(row.balance)
            .bind(if incoming { record_id } else { None }).bind(if incoming { None } else { record_id }).bind(if incoming { candidate_id } else { None })
            .bind(if candidate_id.is_some() { "matched" } else { "unmatched" }).bind(classification).bind(input.source_file.trim()).bind(&row.fingerprint).bind(batch_id)
            .bind(tax_year_for_date(&row.transaction_date)?).bind(confidence).bind(&row.raw_data).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    }
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(ImportBankResult {
        imported: importable.len(),
        duplicates,
        matched,
    })
}

#[tauri::command]
pub async fn import_bank_transactions(
    app: AppHandle,
    input: ImportBankInput,
) -> Result<ImportBankResult, String> {
    let path = workspace_database_path(&app, &input.workspace_id)?;
    import_at(&path, input).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspaces::initialise_database;
    use uuid::Uuid;

    fn row(description: &str, fingerprint: &str) -> BankImportRowInput {
        BankImportRowInput {
            transaction_date: "2026-07-01".into(),
            description: description.into(),
            amount_in: 10.0,
            amount_out: 0.0,
            balance: Some(100.0),
            fingerprint: fingerprint.into(),
            raw_data: "{}".into(),
            error: String::new(),
        }
    }

    #[tokio::test]
    async fn rolls_back_batch_and_rows_when_a_later_insert_fails() {
        let directory = std::env::temp_dir().join(format!(
            "soletrader-bank-import-{}",
            Uuid::new_v4().simple()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        let database = directory.join("soletrader.db");
        initialise_database(&database).await.unwrap();
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(SqliteConnectOptions::new().filename(&database))
            .await
            .unwrap();
        sqlx::query("CREATE TRIGGER reject_bank_row BEFORE INSERT ON bank_transactions WHEN NEW.description = 'Reject' BEGIN SELECT RAISE(ABORT, 'test failure'); END").execute(&pool).await.unwrap();
        pool.close().await;
        let input = ImportBankInput {
            workspace_id: "test".into(),
            source_file: "statement.csv".into(),
            rows: vec![row("First", "one"), row("Reject", "two")],
        };
        assert!(import_at(&database, input).await.is_err());
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(SqliteConnectOptions::new().filename(&database))
            .await
            .unwrap();
        let rows: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM bank_transactions")
            .fetch_one(&pool)
            .await
            .unwrap();
        let batches: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM bank_import_batches")
            .fetch_one(&pool)
            .await
            .unwrap();
        pool.close().await;
        assert_eq!((rows, batches), (0, 0));
        std::fs::remove_dir_all(directory).unwrap();
    }
}
