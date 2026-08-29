use chrono::{Datelike, NaiveDate};
use serde::Deserialize;
use serde::Serialize;
use serde_json::Value;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use tauri::AppHandle;

use crate::workspaces::workspace_database_path;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionStatement {
    sql: String,
    values: Vec<Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionResult {
    rows_affected: u64,
    last_insert_id: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteStatementInput {
    workspace_id: String,
    sql: String,
    values: Vec<Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BankExpenseInput {
    workspace_id: String,
    bank_transaction_id: i64,
    category_id: i64,
    supplier: String,
    description: String,
    vat_amount: f64,
    business_percent: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BankPaymentInput {
    workspace_id: String,
    bank_transaction_id: i64,
    invoice_id: i64,
}

#[derive(Deserialize)]
pub struct DirectIncomeInput {
    workspace_id: String,
    income_date: String,
    description: String,
    income_type: String,
    amount: f64,
    gross_amount: f64,
    cis_rate: f64,
    cis_deduction_amount: f64,
    cis_party_name: String,
    cis_party_utr: String,
    vat_amount: f64,
    vat_rate: Option<f64>,
    payment_method: String,
    client_id: Option<i64>,
    notes: String,
    is_recurring: bool,
    recurring_frequency: Option<String>,
    recurring_next_date: Option<String>,
    recurring_auto_create: bool,
}

#[derive(Deserialize)]
pub struct UpdateDirectIncomeInput {
    id: i64,
    #[serde(flatten)]
    income: DirectIncomeInput,
}

#[derive(Deserialize)]
pub struct BankIncomeInput {
    workspace_id: String,
    bank_transaction_id: i64,
    description: String,
    income_type: String,
    vat_amount: f64,
    vat_rate: Option<f64>,
    payment_method: String,
    client_id: Option<i64>,
    notes: String,
    gross_amount: Option<f64>,
    cis_rate: Option<f64>,
    cis_deduction_amount: Option<f64>,
    cis_party_name: Option<String>,
    cis_party_utr: Option<String>,
}

#[derive(Deserialize)]
pub struct BankClassificationInput {
    workspace_id: String,
    bank_transaction_id: i64,
    classification: String,
}

#[derive(Deserialize)]
pub struct BulkBankClassificationInput {
    workspace_id: String,
    bank_transaction_ids: Vec<i64>,
    classification: String,
}

#[derive(Deserialize)]
pub struct LinkTransferInput {
    workspace_id: String,
    first_transaction_id: i64,
    second_transaction_id: i64,
}

#[derive(Deserialize)]
pub struct SplitBankInput {
    workspace_id: String,
    bank_transaction_id: i64,
    first_description: String,
    first_amount: f64,
    first_classification: String,
    second_description: String,
    second_amount: f64,
    second_classification: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkDocumentInput {
    workspace_id: String,
    document_id: i64,
    expense_id: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentExpenseInput {
    workspace_id: String,
    document_id: i64,
    category_id: i64,
    supplier: String,
    date: String,
    amount: f64,
    vat_amount: f64,
    bank_transaction_id: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderPreferencesInput {
    workspace_id: String,
    registration_lead_days: i64,
    paper_return_lead_days: i64,
    online_return_lead_days: i64,
    payment_on_account_lead_days: i64,
    vat_lead_days: i64,
    invoice_overdue_days: i64,
    vat_threshold_percent: i64,
    expense_nudge_days: i64,
    custom_lead_days: i64,
    system_notifications: bool,
}

#[derive(Deserialize)]
pub struct RecycleItemInput {
    kind: String,
    id: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreRecycleInput {
    workspace_id: String,
    items: Vec<RecycleItemInput>,
}

pub(crate) fn tax_year_for_date(value: &str) -> Result<String, String> {
    let date =
        NaiveDate::parse_from_str(value, "%Y-%m-%d").map_err(|_| "Transaction date is invalid.")?;
    let year = date.year();
    let month = date.month();
    let day = date.day();
    let start = if month > 4 || (month == 4 && day >= 6) {
        year
    } else {
        year - 1
    };
    Ok(format!("{start}/{:02}", (start + 1) % 100))
}

fn is_mutation(sql: &str) -> bool {
    let operation = sql
        .trim_start()
        .split_whitespace()
        .next()
        .unwrap_or_default();
    operation.eq_ignore_ascii_case("INSERT")
        || operation.eq_ignore_ascii_case("UPDATE")
        || operation.eq_ignore_ascii_case("DELETE")
}

fn mutation_table(sql: &str) -> Result<String, String> {
    if sql.contains(';') || sql.contains("--") || sql.contains("/*") {
        return Err("SQL comments and multiple statements are not allowed.".into());
    }
    let words: Vec<_> = sql.split_whitespace().collect();
    let table = match words.as_slice() {
        [operation, into, table, ..]
            if operation.eq_ignore_ascii_case("INSERT") && into.eq_ignore_ascii_case("INTO") =>
        {
            table
        }
        [operation, table, ..] if operation.eq_ignore_ascii_case("UPDATE") => table,
        [operation, from, table, ..]
            if operation.eq_ignore_ascii_case("DELETE") && from.eq_ignore_ascii_case("FROM") =>
        {
            table
        }
        _ => return Err("Only a single INSERT, UPDATE or DELETE is allowed.".into()),
    };
    Ok(table
        .trim_matches(|character| matches!(character, '`' | '"' | '[' | ']'))
        .to_ascii_lowercase())
}

fn statement_is_allowed(sql: &str) -> bool {
    let Ok(table) = mutation_table(sql) else {
        return false;
    };
    matches!(
        table.as_str(),
        "app_settings"
            | "bank_accounts"
            | "bank_rules"
            | "bank_reconciliation_settings"
            | "bank_transactions"
            | "capital_assets"
            | "cis_transactions"
            | "clients"
            | "documents"
            | "direct_income"
            | "expense_categories"
            | "expenses"
            | "invoice_settings"
            | "invoices"
            | "reminder_dismissals"
            | "reminders"
            | "self_billing_agreements"
            | "tax_calculator_inputs"
            | "tax_year_config"
            | "user_profile"
            | "vat_adjustments"
            | "vat_return_snapshots"
            | "vat_settings"
            | "vehicle_costs"
            | "vehicles"
    )
}

fn bind_value<'q>(
    query: sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>>,
    value: Value,
) -> Result<sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>>, String> {
    match value {
        Value::Null => Ok(query.bind(Option::<String>::None)),
        Value::Bool(value) => Ok(query.bind(value)),
        Value::Number(value) if value.is_i64() => Ok(query.bind(value.as_i64().unwrap())),
        Value::Number(value) if value.is_u64() => {
            let value = i64::try_from(value.as_u64().unwrap())
                .map_err(|_| "Transaction integer is outside SQLite's supported range.")?;
            Ok(query.bind(value))
        }
        Value::Number(value) => {
            Ok(query.bind(value.as_f64().ok_or("Transaction number is invalid.")?))
        }
        Value::String(value) => Ok(query.bind(value)),
        Value::Array(_) | Value::Object(_) => {
            Err("Transaction values must be strings, numbers, booleans or null.".into())
        }
    }
}

async fn execute_transaction_at(
    path: &std::path::Path,
    statements: Vec<TransactionStatement>,
) -> Result<Vec<TransactionResult>, String> {
    let options = SqliteConnectOptions::new()
        .filename(path)
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|error| error.to_string())?;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let mut results = Vec::with_capacity(statements.len());
    for statement in statements {
        if !is_mutation(&statement.sql) {
            return Err(
                "Native transactions accept INSERT, UPDATE and DELETE statements only.".into(),
            );
        }
        let mut query = sqlx::query(&statement.sql);
        for value in statement.values {
            query = bind_value(query, value)?;
        }
        let result = query
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
        results.push(TransactionResult {
            rows_affected: result.rows_affected(),
            last_insert_id: result.last_insert_rowid(),
        });
    }
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(results)
}

#[tauri::command]
pub async fn execute_allowed_statement(
    app: AppHandle,
    input: ExecuteStatementInput,
) -> Result<TransactionResult, String> {
    if !statement_is_allowed(&input.sql) {
        return Err("This database change is not permitted.".into());
    }
    let path = workspace_database_path(&app, &input.workspace_id)?;
    let results = execute_transaction_at(
        &path,
        vec![TransactionStatement {
            sql: input.sql,
            values: input.values,
        }],
    )
    .await?;
    results
        .into_iter()
        .next()
        .ok_or_else(|| "The database change did not return a result.".into())
}

#[tauri::command]
pub async fn create_expense_from_bank(
    app: AppHandle,
    input: BankExpenseInput,
) -> Result<i64, String> {
    let path = workspace_database_path(&app, &input.workspace_id)?;
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
    let bank = sqlx::query_as::<_, (String, f64, String, String)>("SELECT transaction_date, amount_out, source_file, tax_year FROM bank_transactions WHERE id = ? AND status = 'unmatched'")
        .bind(input.bank_transaction_id).fetch_optional(&mut *transaction).await.map_err(|error| error.to_string())?.ok_or("The bank transaction is no longer available for matching.")?;
    if bank.1 <= 0.0 {
        return Err("Only money-out transactions can create expenses.".into());
    }
    let expense = sqlx::query("INSERT INTO expenses (category_id, date, supplier, description, amount, vat_amount, business_percent, notes, tax_year) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(input.category_id).bind(bank.0).bind(input.supplier).bind(input.description).bind(bank.1).bind(input.vat_amount).bind(input.business_percent)
        .bind(format!("Created from bank import: {}", bank.2)).bind(bank.3).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    let expense_id = expense.last_insert_rowid();
    let claimed = sqlx::query("UPDATE bank_transactions SET matched_expense_id = ?, manual_category_id = ?, status = 'matched', match_confidence = 'manual', updated_at = datetime('now') WHERE id = ? AND status = 'unmatched'")
        .bind(expense_id).bind(input.category_id).bind(input.bank_transaction_id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    if claimed.rows_affected() != 1 {
        return Err("The bank transaction was matched by another operation.".into());
    }
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(expense_id)
}

async fn insert_direct_income(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    input: &BankIncomeInput,
    date: &str,
    amount: f64,
    gross_amount: f64,
    cis_rate: f64,
    cis_deduction_amount: f64,
    cis_party_name: &str,
    cis_party_utr: &str,
    tax_year: &str,
    bank_transaction_id: Option<i64>,
) -> Result<i64, String> {
    if input.description.trim().is_empty()
        || !matches!(input.income_type.as_str(), "sale" | "cis_subcontractor" | "other_business_income" | "grant" | "refund" | "other")
        || amount <= 0.0 || gross_amount <= 0.0
        || cis_deduction_amount < 0.0 || cis_deduction_amount > gross_amount
        || (amount - gross_amount + cis_deduction_amount).abs() > 0.01
        || !matches!(cis_rate, 0.0 | 20.0 | 30.0)
        || input.vat_amount < 0.0
        || input.vat_amount > amount
        || input.vat_rate.is_some_and(|rate| !(0.0..=100.0).contains(&rate))
        || NaiveDate::parse_from_str(date, "%Y-%m-%d").is_err()
    {
        return Err("Direct income contains invalid details.".into());
    }
    let income = sqlx::query("INSERT INTO direct_income (income_date, description, income_type, amount, gross_amount, cis_rate, cis_deduction_amount, cis_party_name, cis_party_utr, vat_amount, vat_rate, payment_method, client_id, notes, tax_year, bank_transaction_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(date).bind(input.description.trim()).bind(&input.income_type).bind(amount)
        .bind(gross_amount).bind(cis_rate).bind(cis_deduction_amount).bind(cis_party_name.trim()).bind(cis_party_utr.trim())
        .bind(input.vat_amount).bind(input.vat_rate).bind(input.payment_method.trim())
        .bind(input.client_id).bind(input.notes.trim()).bind(tax_year).bind(bank_transaction_id)
        .execute(&mut **transaction).await.map_err(|error| error.to_string())?;
    Ok(income.last_insert_rowid())
}

#[tauri::command]
pub async fn create_direct_income(app: AppHandle, input: DirectIncomeInput) -> Result<i64, String> {
    let path = workspace_database_path(&app, &input.workspace_id)?;
    let pool = SqlitePoolOptions::new().max_connections(1).connect_with(SqliteConnectOptions::new().filename(path).foreign_keys(true)).await.map_err(|error| error.to_string())?;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let tax_year = crate::transactions::tax_year_for_date(&input.income_date)?;
    let bank_input = BankIncomeInput { workspace_id: input.workspace_id, bank_transaction_id: 0, description: input.description, income_type: input.income_type, vat_amount: input.vat_amount, vat_rate: input.vat_rate, payment_method: input.payment_method, client_id: input.client_id, notes: input.notes, gross_amount: None, cis_rate: None, cis_deduction_amount: None, cis_party_name: None, cis_party_utr: None };
    let id = insert_direct_income(&mut transaction, &bank_input, &input.income_date, input.amount, input.gross_amount, input.cis_rate, input.cis_deduction_amount, &input.cis_party_name, &input.cis_party_utr, &tax_year, None).await?;
    if input.is_recurring {
        sqlx::query("UPDATE direct_income SET is_recurring = 1, recurring_frequency = ?, recurring_next_date = ?, recurring_auto_create = ? WHERE id = ?")
            .bind(input.recurring_frequency).bind(input.recurring_next_date).bind(input.recurring_auto_create).bind(id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    }
    transaction.commit().await.map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(id)
}

#[tauri::command]
pub async fn update_direct_income(app: AppHandle, input: UpdateDirectIncomeInput) -> Result<(), String> {
    let path = workspace_database_path(&app, &input.income.workspace_id)?;
    let pool = SqlitePoolOptions::new().max_connections(1).connect_with(SqliteConnectOptions::new().filename(path).foreign_keys(true)).await.map_err(|error| error.to_string())?;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let tax_year = tax_year_for_date(&input.income.income_date)?;
    let data = &input.income;
    let helper = BankIncomeInput { workspace_id: data.workspace_id.clone(), bank_transaction_id: 0, description: data.description.clone(), income_type: data.income_type.clone(), vat_amount: data.vat_amount, vat_rate: data.vat_rate, payment_method: data.payment_method.clone(), client_id: data.client_id, notes: data.notes.clone(), gross_amount: None, cis_rate: None, cis_deduction_amount: None, cis_party_name: None, cis_party_utr: None };
    if data.description.trim().is_empty() || !matches!(data.income_type.as_str(), "sale" | "cis_subcontractor" | "other_business_income" | "grant" | "refund" | "other") || data.amount <= 0.0 || data.gross_amount <= 0.0 || data.cis_deduction_amount < 0.0 || data.cis_deduction_amount > data.gross_amount || (data.amount - data.gross_amount + data.cis_deduction_amount).abs() > 0.01 || !matches!(data.cis_rate, 0.0 | 20.0 | 30.0) || data.vat_amount < 0.0 || data.vat_amount > data.amount { return Err("Direct income contains invalid details.".into()); }
    let changed = sqlx::query("UPDATE direct_income SET income_date = ?, description = ?, income_type = ?, amount = ?, gross_amount = ?, cis_rate = ?, cis_deduction_amount = ?, cis_party_name = ?, cis_party_utr = ?, vat_amount = ?, vat_rate = ?, payment_method = ?, client_id = ?, notes = ?, is_recurring = ?, recurring_frequency = ?, recurring_next_date = ?, recurring_auto_create = ?, tax_year = ?, updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL")
        .bind(&data.income_date).bind(data.description.trim()).bind(&data.income_type).bind(data.amount).bind(data.gross_amount).bind(data.cis_rate).bind(data.cis_deduction_amount).bind(data.cis_party_name.trim()).bind(data.cis_party_utr.trim()).bind(data.vat_amount).bind(data.vat_rate).bind(data.payment_method.trim()).bind(data.client_id).bind(data.notes.trim()).bind(data.is_recurring).bind(if data.is_recurring { data.recurring_frequency.as_deref() } else { None }).bind(if data.is_recurring { data.recurring_next_date.as_deref() } else { None }).bind(data.is_recurring && data.recurring_auto_create).bind(tax_year).bind(input.id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    drop(helper);
    if changed.rows_affected() != 1 { return Err("Direct income was not found or has been deleted.".into()); }
    transaction.commit().await.map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(())
}

#[tauri::command]
pub async fn create_direct_income_from_bank(app: AppHandle, input: BankIncomeInput) -> Result<i64, String> {
    let path = workspace_database_path(&app, &input.workspace_id)?;
    let pool = SqlitePoolOptions::new().max_connections(1).connect_with(SqliteConnectOptions::new().filename(path).foreign_keys(true)).await.map_err(|error| error.to_string())?;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let bank = sqlx::query_as::<_, (String, f64, String, String)>("SELECT transaction_date, amount_in, source_file, tax_year FROM bank_transactions WHERE id = ? AND status = 'unmatched'")
        .bind(input.bank_transaction_id).fetch_optional(&mut *transaction).await.map_err(|error| error.to_string())?.ok_or("The bank transaction is no longer available for matching.")?;
    if bank.1 <= 0.0 { return Err("Only money-in transactions can create direct income.".into()); }
    let deduction = input.cis_deduction_amount.unwrap_or(0.0);
    let gross = input.gross_amount.unwrap_or(bank.1 + deduction);
    let cis_rate = input.cis_rate.unwrap_or(0.0);
    let id = insert_direct_income(&mut transaction, &input, &bank.0, bank.1, gross, cis_rate, deduction, input.cis_party_name.as_deref().unwrap_or(""), input.cis_party_utr.as_deref().unwrap_or(""), &bank.3, Some(input.bank_transaction_id)).await?;
    let claimed = sqlx::query("UPDATE bank_transactions SET matched_income_id = ?, status = 'matched', match_confidence = 'manual', updated_at = datetime('now') WHERE id = ? AND status = 'unmatched'")
        .bind(id).bind(input.bank_transaction_id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    if claimed.rows_affected() != 1 { return Err("The bank transaction was matched by another operation.".into()); }
    transaction.commit().await.map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(id)
}

#[tauri::command]
pub async fn classify_bank_transaction(app: AppHandle, input: BankClassificationInput) -> Result<(), String> {
    if !matches!(input.classification.as_str(), "owner_contribution" | "owner_withdrawal" | "transfer" | "loan" | "refund" | "ignored") {
        return Err("That bank classification is not supported.".into());
    }
    let path = workspace_database_path(&app, &input.workspace_id)?;
    let pool = SqlitePoolOptions::new().max_connections(1).connect_with(SqliteConnectOptions::new().filename(path).foreign_keys(true)).await.map_err(|error| error.to_string())?;
    let changed = sqlx::query("UPDATE bank_transactions SET matched_invoice_id = NULL, matched_payment_id = NULL, matched_expense_id = NULL, matched_income_id = NULL, status = ?, classification = ?, match_confidence = 'manual', updated_at = datetime('now') WHERE id = ?")
        .bind(if input.classification == "ignored" { "ignored" } else { "matched" }).bind(input.classification).bind(input.bank_transaction_id).execute(&pool).await.map_err(|error| error.to_string())?;
    pool.close().await;
    if changed.rows_affected() != 1 { return Err("The bank transaction could not be classified.".into()); }
    Ok(())
}

#[tauri::command]
pub async fn bulk_classify_bank_transactions(
    app: AppHandle,
    input: BulkBankClassificationInput,
) -> Result<u64, String> {
    if input.bank_transaction_ids.is_empty() || input.bank_transaction_ids.len() > 1000 {
        return Err("Select between 1 and 1000 bank transactions.".into());
    }
    if !matches!(input.classification.as_str(), "owner_contribution" | "owner_withdrawal" | "transfer" | "loan" | "refund" | "ignored") {
        return Err("That bank classification is not supported.".into());
    }
    let path = workspace_database_path(&app, &input.workspace_id)?;
    let pool = SqlitePoolOptions::new().max_connections(1).connect_with(SqliteConnectOptions::new().filename(path).foreign_keys(true)).await.map_err(|error| error.to_string())?;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let status = if input.classification == "ignored" { "ignored" } else { "matched" };
    let mut changed = 0_u64;
    for id in input.bank_transaction_ids {
        changed += sqlx::query("UPDATE bank_transactions SET matched_invoice_id = NULL, matched_payment_id = NULL, matched_expense_id = NULL, matched_income_id = NULL, status = ?, classification = ?, match_confidence = 'manual', updated_at = datetime('now') WHERE id = ? AND status = 'unmatched'")
            .bind(status).bind(&input.classification).bind(id).execute(&mut *transaction).await.map_err(|error| error.to_string())?.rows_affected();
    }
    transaction.commit().await.map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(changed)
}

#[tauri::command]
pub async fn link_bank_transfer(app: AppHandle, input: LinkTransferInput) -> Result<(), String> {
    if input.first_transaction_id == input.second_transaction_id { return Err("A transfer needs two different transactions.".into()); }
    let path = workspace_database_path(&app, &input.workspace_id)?;
    let pool = SqlitePoolOptions::new().max_connections(1).connect_with(SqliteConnectOptions::new().filename(path).foreign_keys(true)).await.map_err(|error| error.to_string())?;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let pair_id = sqlx::query_scalar::<_, i64>("SELECT id FROM bank_transactions WHERE id IN (?, ?) ORDER BY id LIMIT 1")
        .bind(input.first_transaction_id).bind(input.second_transaction_id).fetch_optional(&mut *transaction).await.map_err(|error| error.to_string())?.ok_or("Both bank transactions must exist.")?;
    let changed = sqlx::query("UPDATE bank_transactions SET transfer_pair_id = ?, matched_invoice_id = NULL, matched_payment_id = NULL, matched_expense_id = NULL, matched_income_id = NULL, classification = 'transfer', status = 'matched', match_confidence = 'manual', updated_at = datetime('now') WHERE id IN (?, ?)")
        .bind(pair_id).bind(input.first_transaction_id).bind(input.second_transaction_id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    if changed.rows_affected() != 2 { return Err("Both bank transactions must be available for transfer pairing.".into()); }
    transaction.commit().await.map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(())
}

#[tauri::command]
pub async fn split_bank_transaction(app: AppHandle, input: SplitBankInput) -> Result<(), String> {
    let valid_kind = |kind: &str| matches!(kind, "direct_income" | "expense" | "owner_contribution" | "owner_withdrawal" | "transfer" | "loan" | "refund" | "ignored");
    if input.first_description.trim().is_empty() || input.second_description.trim().is_empty()
        || !input.first_amount.is_finite() || !input.second_amount.is_finite()
        || input.first_amount <= 0.0 || input.second_amount <= 0.0
        || !valid_kind(&input.first_classification) || !valid_kind(&input.second_classification) {
        return Err("Split entries contain invalid details.".into());
    }
    let path = workspace_database_path(&app, &input.workspace_id)?;
    let pool = SqlitePoolOptions::new().max_connections(1).connect_with(SqliteConnectOptions::new().filename(path).foreign_keys(true)).await.map_err(|error| error.to_string())?;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let bank = sqlx::query_as::<_, (f64, f64)>("SELECT amount_in, amount_out FROM bank_transactions WHERE id = ? AND status = 'unmatched'").bind(input.bank_transaction_id).fetch_optional(&mut *transaction).await.map_err(|error| error.to_string())?.ok_or("The bank transaction is no longer available for splitting.")?;
    let total = if bank.0 > 0.0 { bank.0 } else { bank.1 };
    if (input.first_amount + input.second_amount - total).abs() > 0.005 { return Err("Split amounts must equal the bank transaction exactly.".into()); }
    for (description, amount, classification) in [(input.first_description, input.first_amount, input.first_classification), (input.second_description, input.second_amount, input.second_classification)] {
        sqlx::query("INSERT INTO bank_transaction_splits (bank_transaction_id, description, amount, classification) VALUES (?, ?, ?, ?)").bind(input.bank_transaction_id).bind(description.trim()).bind(amount).bind(classification).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    }
    sqlx::query("UPDATE bank_transactions SET status = 'matched', classification = 'unclassified', match_confidence = 'manual', updated_at = datetime('now') WHERE id = ? AND status = 'unmatched'").bind(input.bank_transaction_id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    transaction.commit().await.map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(())
}

#[tauri::command]
pub async fn record_invoice_payment_from_bank(
    app: AppHandle,
    input: BankPaymentInput,
) -> Result<i64, String> {
    let path = workspace_database_path(&app, &input.workspace_id)?;
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
    let bank = sqlx::query_as::<_, (String, f64, String)>("SELECT transaction_date, amount_in, source_file FROM bank_transactions WHERE id = ? AND status = 'unmatched'")
        .bind(input.bank_transaction_id).fetch_optional(&mut *transaction).await.map_err(|error| error.to_string())?.ok_or("The bank transaction is no longer available for matching.")?;
    if bank.1 <= 0.0 {
        return Err("Only money-in transactions can record invoice payments.".into());
    }
    let balance = sqlx::query_scalar::<_, f64>("SELECT MAX(0, total - COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = invoices.id), 0) - COALESCE((SELECT SUM(amount) FROM credit_notes WHERE invoice_id = invoices.id), 0)) FROM invoices WHERE id = ? AND deleted_at IS NULL")
        .bind(input.invoice_id).fetch_optional(&mut *transaction).await.map_err(|error| error.to_string())?.ok_or("The selected invoice is unavailable.")?;
    if bank.1 > balance + 0.005 {
        return Err("The bank amount exceeds the selected invoice balance.".into());
    }
    let payment = sqlx::query("INSERT INTO invoice_payments (invoice_id, amount, cash_amount, payment_date, payment_method, notes) VALUES (?, ?, ?, ?, 'Bank transfer', ?)")
        .bind(input.invoice_id).bind(bank.1).bind(bank.1).bind(bank.0).bind(format!("Created from bank import: {}", bank.2)).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    let payment_id = payment.last_insert_rowid();
    let claimed = sqlx::query("UPDATE bank_transactions SET matched_invoice_id = ?, matched_payment_id = ?, status = 'matched', match_confidence = 'manual', updated_at = datetime('now') WHERE id = ? AND status = 'unmatched'")
        .bind(input.invoice_id).bind(payment_id).bind(input.bank_transaction_id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    if claimed.rows_affected() != 1 {
        return Err("The bank transaction was matched by another operation.".into());
    }
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(payment_id)
}

#[tauri::command]
pub async fn link_document_expense(app: AppHandle, input: LinkDocumentInput) -> Result<(), String> {
    let path = workspace_database_path(&app, &input.workspace_id)?;
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
    let file_path = sqlx::query_scalar::<_, String>(
        "SELECT file_path FROM documents WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(input.document_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?
    .ok_or("Document was not found.")?;
    if !sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM expenses WHERE id = ? AND deleted_at IS NULL)",
    )
    .bind(input.expense_id)
    .fetch_one(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?
    {
        return Err("Expense was not found.".into());
    }
    sqlx::query("UPDATE documents SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE linked_expense_id = ? AND id != ? AND category = 'receipt' AND deleted_at IS NULL")
        .bind(input.expense_id).bind(input.document_id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    sqlx::query("UPDATE documents SET linked_expense_id = ?, category = 'receipt', updated_at = datetime('now') WHERE id = ?")
        .bind(input.expense_id).bind(input.document_id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    sqlx::query("UPDATE expenses SET receipt_path = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(file_path)
        .bind(input.expense_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(())
}

#[tauri::command]
pub async fn create_expense_from_document(
    app: AppHandle,
    input: DocumentExpenseInput,
) -> Result<i64, String> {
    let tax_year = tax_year_for_date(&input.date)?;
    let path = workspace_database_path(&app, &input.workspace_id)?;
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
    if let Some(bank_transaction_id) = input.bank_transaction_id {
        let bank = sqlx::query_as::<_, (String, f64)>(
            "SELECT transaction_date, amount_out FROM bank_transactions WHERE id = ? AND status = 'unmatched'",
        )
        .bind(bank_transaction_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?
        .ok_or("The suggested bank transaction is no longer available.")?;
        let bank_date = NaiveDate::parse_from_str(&bank.0, "%Y-%m-%d")
            .map_err(|_| "The bank transaction date is invalid.")?;
        let receipt_date = NaiveDate::parse_from_str(&input.date, "%Y-%m-%d")
            .map_err(|_| "The receipt date is invalid.")?;
        if (bank.1 - input.amount).abs() > f64::max(0.02, input.amount * 0.01)
            || (bank_date - receipt_date).num_days().abs() > 7
        {
            return Err("The suggested bank transaction no longer matches this receipt.".into());
        }
    }
    let document = sqlx::query_as::<_, (String, String)>("SELECT file_name, file_path FROM documents WHERE id = ? AND deleted_at IS NULL AND linked_expense_id IS NULL")
        .bind(input.document_id).fetch_optional(&mut *transaction).await.map_err(|error| error.to_string())?.ok_or("Document is unavailable or already linked.")?;
    let expense = sqlx::query("INSERT INTO expenses (category_id, date, supplier, description, amount, vat_amount, business_percent, receipt_path, notes, tax_year) VALUES (?, ?, ?, ?, ?, ?, 100, ?, 'Created from document OCR review', ?)")
        .bind(input.category_id).bind(&input.date).bind(input.supplier).bind(format!("Receipt: {}", document.0)).bind(input.amount).bind(input.vat_amount).bind(document.1).bind(&tax_year)
        .execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    let expense_id = expense.last_insert_rowid();
    let linked = sqlx::query("UPDATE documents SET linked_expense_id = ?, category = 'receipt', tax_year = ?, document_date = ?, ocr_status = 'complete', updated_at = datetime('now') WHERE id = ? AND linked_expense_id IS NULL")
        .bind(expense_id).bind(tax_year).bind(input.date).bind(input.document_id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    if linked.rows_affected() != 1 {
        return Err("Document was linked by another operation.".into());
    }
    if let Some(bank_transaction_id) = input.bank_transaction_id {
        let claimed = sqlx::query("UPDATE bank_transactions SET matched_expense_id = ?, manual_category_id = ?, status = 'matched', match_confidence = 'manual', updated_at = datetime('now') WHERE id = ? AND status = 'unmatched'")
            .bind(expense_id).bind(input.category_id).bind(bank_transaction_id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
        if claimed.rows_affected() != 1 {
            return Err("The bank transaction was matched by another operation.".into());
        }
    }
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(expense_id)
}

#[tauri::command]
pub async fn save_reminder_preferences(
    app: AppHandle,
    input: ReminderPreferencesInput,
) -> Result<(), String> {
    let day_values = [
        input.registration_lead_days,
        input.paper_return_lead_days,
        input.online_return_lead_days,
        input.payment_on_account_lead_days,
        input.vat_lead_days,
        input.invoice_overdue_days,
        input.expense_nudge_days,
        input.custom_lead_days,
    ];
    if day_values.iter().any(|value| !(0..=3650).contains(value))
        || !(0..=100).contains(&input.vat_threshold_percent)
    {
        return Err("Reminder preference values are outside the supported range.".into());
    }
    let values = [
        (
            "reminder_registration_lead_days",
            input.registration_lead_days.to_string(),
        ),
        (
            "reminder_paper_lead_days",
            input.paper_return_lead_days.to_string(),
        ),
        (
            "reminder_online_lead_days",
            input.online_return_lead_days.to_string(),
        ),
        (
            "reminder_poa_lead_days",
            input.payment_on_account_lead_days.to_string(),
        ),
        ("reminder_vat_lead_days", input.vat_lead_days.to_string()),
        (
            "reminder_invoice_overdue_days",
            input.invoice_overdue_days.to_string(),
        ),
        (
            "reminder_vat_threshold_percent",
            input.vat_threshold_percent.to_string(),
        ),
        (
            "reminder_expense_nudge_days",
            input.expense_nudge_days.to_string(),
        ),
        (
            "reminder_custom_lead_days",
            input.custom_lead_days.to_string(),
        ),
        (
            "reminder_system_notifications",
            if input.system_notifications {
                "1".into()
            } else {
                "0".into()
            },
        ),
    ];
    let path = workspace_database_path(&app, &input.workspace_id)?;
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
    for (key, value) in values {
        sqlx::query("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
            .bind(key).bind(value).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    }
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(())
}

#[tauri::command]
pub async fn restore_recycle_items(
    app: AppHandle,
    input: RestoreRecycleInput,
) -> Result<(), String> {
    if input.items.is_empty() || input.items.len() > 1000 {
        return Err("Select between 1 and 1000 records to restore.".into());
    }
    let path = workspace_database_path(&app, &input.workspace_id)?;
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
    let mut mileage_tax_years = std::collections::HashSet::new();
    for item in input.items {
        let sql = match item.kind.as_str() {
            "invoice" => "UPDATE invoices SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ? AND deleted_at IS NOT NULL",
            "expense" => "UPDATE expenses SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ? AND deleted_at IS NOT NULL",
            "mileage" => {
                if let Some(year) = sqlx::query_scalar::<_, String>("SELECT tax_year FROM mileage_logs WHERE id = ? AND deleted_at IS NOT NULL").bind(item.id).fetch_optional(&mut *transaction).await.map_err(|error| error.to_string())? { mileage_tax_years.insert(year); }
                "UPDATE mileage_logs SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL"
            }
            "vehicle_cost" => "UPDATE vehicle_costs SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL",
            "document" => "UPDATE documents SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ? AND deleted_at IS NOT NULL",
            "capital_asset" => "UPDATE capital_assets SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ? AND deleted_at IS NOT NULL",
            "cis" => "UPDATE cis_transactions SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ? AND deleted_at IS NOT NULL",
            _ => return Err("Recycle-bin record type is invalid.".into()),
        };
        let restored = sqlx::query(sql)
            .bind(item.id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
        if restored.rows_affected() != 1 {
            return Err("A selected recycle-bin record is no longer available.".into());
        }
    }
    for tax_year in mileage_tax_years {
        crate::vehicles::recalculate_mileage_tax_year(&mut transaction, &tax_year).await?;
    }
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::Executor;
    use uuid::Uuid;

    #[test]
    fn accepts_only_mutating_statements() {
        assert!(is_mutation(" INSERT INTO app_settings VALUES (?, ?)"));
        assert!(is_mutation("update expenses set notes = ?"));
        assert!(is_mutation("DELETE FROM reminders WHERE id = ?"));
        assert!(!is_mutation("SELECT * FROM expenses"));
        assert!(!is_mutation("PRAGMA foreign_keys = OFF"));
        assert!(statement_is_allowed(
            "UPDATE clients SET name = ? WHERE id = ?"
        ));
        assert!(!statement_is_allowed("DELETE FROM audit_log"));
        assert!(!statement_is_allowed("UPDATE sqlite_master SET name = 'x'"));
        assert!(!statement_is_allowed(
            "UPDATE clients SET name = ?; DELETE FROM audit_log"
        ));
    }

    #[test]
    fn assigns_uk_tax_years_at_six_april() {
        assert_eq!(tax_year_for_date("2026-04-05").unwrap(), "2025/26");
        assert_eq!(tax_year_for_date("2026-04-06").unwrap(), "2026/27");
        assert!(tax_year_for_date("2026-02-29").is_err());
        assert!(tax_year_for_date("2026-99-99").is_err());
    }

    #[tokio::test]
    async fn rolls_back_all_statements_when_one_fails() {
        let directory = std::env::temp_dir().join(format!(
            "soletrader-transaction-{}",
            Uuid::new_v4().simple()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        let database = directory.join("test.db");
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(&database)
                    .create_if_missing(true),
            )
            .await
            .unwrap();
        pool.execute("CREATE TABLE amounts (value INTEGER CHECK(value > 0))")
            .await
            .unwrap();
        pool.close().await;
        let result = execute_transaction_at(
            &database,
            vec![
                TransactionStatement {
                    sql: "INSERT INTO amounts (value) VALUES (?)".into(),
                    values: vec![Value::from(1)],
                },
                TransactionStatement {
                    sql: "INSERT INTO amounts (value) VALUES (?)".into(),
                    values: vec![Value::from(-1)],
                },
            ],
        )
        .await;
        assert!(result.is_err());
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(SqliteConnectOptions::new().filename(&database))
            .await
            .unwrap();
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM amounts")
            .fetch_one(&pool)
            .await
            .unwrap();
        pool.close().await;
        assert_eq!(count, 0);
        std::fs::remove_dir_all(directory).unwrap();
    }
}
