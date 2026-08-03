use chrono::{Duration, Months, NaiveDate};
use serde::Deserialize;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    FromRow,
};
use tauri::AppHandle;

use crate::transactions::tax_year_for_date;
use crate::workspaces::workspace_database_path;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredReceiptInput {
    path: String,
    file_name: String,
    file_type: String,
    file_size: i64,
}

#[derive(Deserialize)]
pub struct ExpenseInput {
    workspace_id: String,
    category_id: i64,
    date: String,
    supplier: String,
    description: String,
    amount: f64,
    vat_amount: f64,
    vat_ec_acquisition: bool,
    vat_capital_asset: bool,
    business_percent: f64,
    receipt_path: String,
    receipt_file: Option<StoredReceiptInput>,
    notes: String,
    is_recurring: bool,
    recurring_frequency: Option<String>,
    recurring_next_date: Option<String>,
    recurring_auto_create: bool,
}

#[derive(Deserialize)]
pub struct UpdateExpenseInput {
    id: i64,
    #[serde(flatten)]
    expense: ExpenseInput,
}

#[derive(Deserialize)]
pub struct ProcessRecurringExpensesInput {
    workspace_id: String,
    include_reminder_only: bool,
}

#[derive(Deserialize)]
pub struct ExpenseIdsInput {
    workspace_id: String,
    ids: Vec<i64>,
}

#[derive(Deserialize)]
pub struct CategoriseExpensesInput {
    workspace_id: String,
    ids: Vec<i64>,
    category_id: i64,
}

#[derive(FromRow)]
struct RecurringExpense {
    id: i64,
    category_id: i64,
    supplier: String,
    description: String,
    amount: f64,
    vat_amount: f64,
    vat_ec_acquisition: bool,
    vat_capital_asset: bool,
    business_percent: f64,
    notes: String,
    recurring_frequency: String,
    recurring_next_date: String,
}

fn next_recurring_date(date: NaiveDate, frequency: &str) -> Result<NaiveDate, String> {
    match frequency {
        "weekly" => Ok(date + Duration::weeks(1)),
        "fortnightly" => Ok(date + Duration::weeks(2)),
        "monthly" => date
            .checked_add_months(Months::new(1))
            .ok_or_else(|| "Recurring expense date is out of range.".into()),
        "quarterly" => date
            .checked_add_months(Months::new(3))
            .ok_or_else(|| "Recurring expense date is out of range.".into()),
        "yearly" => date
            .checked_add_months(Months::new(12))
            .ok_or_else(|| "Recurring expense date is out of range.".into()),
        _ => Err("Recurring expense frequency is invalid.".into()),
    }
}

fn validate(input: &ExpenseInput) -> Result<String, String> {
    if input.description.trim().is_empty() {
        return Err("Expense description is required.".into());
    }
    if !input.amount.is_finite()
        || input.amount < 0.0
        || !input.vat_amount.is_finite()
        || input.vat_amount < 0.0
        || input.vat_amount > input.amount
    {
        return Err("Expense amount and VAT values are invalid.".into());
    }
    if !input.business_percent.is_finite() || !(0.0..=100.0).contains(&input.business_percent) {
        return Err("Business use must be between 0 and 100%.".into());
    }
    if input.is_recurring && input.recurring_frequency.is_none() {
        return Err("Recurring expenses require a frequency.".into());
    }
    tax_year_for_date(&input.date)
}

async fn pool(app: &AppHandle, workspace_id: &str) -> Result<sqlx::SqlitePool, String> {
    let path = workspace_database_path(app, workspace_id)?;
    SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(path)
                .foreign_keys(true),
        )
        .await
        .map_err(|error| error.to_string())
}

async fn link_receipt(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    expense_id: i64,
    input: &ExpenseInput,
    previous_path: &str,
    tax_year: &str,
) -> Result<(), String> {
    if !previous_path.is_empty() && previous_path != input.receipt_path {
        sqlx::query("UPDATE documents SET deleted_at = datetime('now') WHERE linked_expense_id = ? AND category = 'receipt' AND deleted_at IS NULL")
            .bind(expense_id).execute(&mut **transaction).await.map_err(|error| error.to_string())?;
    }
    if let Some(receipt) = &input.receipt_file {
        if receipt.path != previous_path {
            sqlx::query("INSERT INTO documents (file_name, file_path, file_type, file_size, category, linked_expense_id, tax_year, document_date, updated_at) VALUES (?, ?, ?, ?, 'receipt', ?, ?, ?, datetime('now'))")
                .bind(&receipt.file_name).bind(&receipt.path).bind(&receipt.file_type).bind(receipt.file_size).bind(expense_id).bind(tax_year).bind(&input.date)
                .execute(&mut **transaction).await.map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn create_expense(app: AppHandle, input: ExpenseInput) -> Result<i64, String> {
    let tax_year = validate(&input)?;
    let pool = pool(&app, &input.workspace_id).await?;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let result = sqlx::query("INSERT INTO expenses (category_id, date, supplier, description, amount, vat_amount, vat_ec_acquisition, vat_capital_asset, business_percent, receipt_path, notes, is_recurring, recurring_frequency, recurring_next_date, recurring_auto_create, tax_year) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(input.category_id).bind(&input.date).bind(&input.supplier).bind(input.description.trim()).bind(input.amount).bind(input.vat_amount)
        .bind(input.vat_ec_acquisition).bind(input.vat_capital_asset).bind(input.business_percent).bind(&input.receipt_path).bind(&input.notes).bind(input.is_recurring)
        .bind(if input.is_recurring { input.recurring_frequency.as_deref() } else { None }).bind(if input.is_recurring { input.recurring_next_date.as_deref() } else { None })
        .bind(input.is_recurring && input.recurring_auto_create).bind(&tax_year).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    let id = result.last_insert_rowid();
    link_receipt(&mut transaction, id, &input, "", &tax_year).await?;
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(id)
}

#[tauri::command]
pub async fn update_expense(app: AppHandle, input: UpdateExpenseInput) -> Result<(), String> {
    let tax_year = validate(&input.expense)?;
    let pool = pool(&app, &input.expense.workspace_id).await?;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let existing = sqlx::query_as::<_, (String, bool)>(
        "SELECT receipt_path, is_bad_debt FROM expenses WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(input.id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?
    .ok_or("Expense was not found.")?;
    if existing.1 {
        return Err("Bad-debt expenses are managed from their source invoice.".into());
    }
    let data = &input.expense;
    let updated = sqlx::query("UPDATE expenses SET category_id = ?, date = ?, supplier = ?, description = ?, amount = ?, vat_amount = ?, vat_ec_acquisition = ?, vat_capital_asset = ?, business_percent = ?, receipt_path = ?, notes = ?, is_recurring = ?, recurring_frequency = ?, recurring_next_date = ?, recurring_auto_create = ?, tax_year = ?, updated_at = datetime('now') WHERE id = ? AND is_bad_debt = 0")
        .bind(data.category_id).bind(&data.date).bind(&data.supplier).bind(data.description.trim()).bind(data.amount).bind(data.vat_amount).bind(data.vat_ec_acquisition)
        .bind(data.vat_capital_asset).bind(data.business_percent).bind(&data.receipt_path).bind(&data.notes).bind(data.is_recurring)
        .bind(if data.is_recurring { data.recurring_frequency.as_deref() } else { None }).bind(if data.is_recurring { data.recurring_next_date.as_deref() } else { None })
        .bind(data.is_recurring && data.recurring_auto_create).bind(&tax_year).bind(input.id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    if updated.rows_affected() != 1 {
        return Err("Expense changed before it could be saved.".into());
    }
    link_receipt(&mut transaction, input.id, data, &existing.0, &tax_year).await?;
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(())
}

#[tauri::command]
pub async fn process_recurring_expenses(
    app: AppHandle,
    input: ProcessRecurringExpensesInput,
) -> Result<u64, String> {
    let pool = pool(&app, &input.workspace_id).await?;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let due = sqlx::query_as::<_, RecurringExpense>("SELECT id, category_id, supplier, description, amount, vat_amount, vat_ec_acquisition, vat_capital_asset, business_percent, notes, recurring_frequency, recurring_next_date FROM expenses WHERE deleted_at IS NULL AND is_recurring = 1 AND (? = 1 OR recurring_auto_create = 1) AND recurring_next_date <= date('now')")
        .bind(input.include_reminder_only).fetch_all(&mut *transaction).await.map_err(|error| error.to_string())?;
    let mut created = 0;
    for expense in due {
        let date = NaiveDate::parse_from_str(&expense.recurring_next_date, "%Y-%m-%d")
            .map_err(|_| "Recurring expense date is invalid.")?;
        sqlx::query("INSERT INTO expenses (category_id, date, supplier, description, amount, vat_amount, vat_ec_acquisition, vat_capital_asset, business_percent, notes, tax_year) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(expense.category_id).bind(&expense.recurring_next_date).bind(expense.supplier).bind(expense.description).bind(expense.amount).bind(expense.vat_amount)
            .bind(expense.vat_ec_acquisition).bind(expense.vat_capital_asset).bind(expense.business_percent).bind(expense.notes).bind(tax_year_for_date(&expense.recurring_next_date)?)
            .execute(&mut *transaction).await.map_err(|error| error.to_string())?;
        sqlx::query("UPDATE expenses SET recurring_next_date = ?, updated_at = datetime('now') WHERE id = ?")
            .bind(next_recurring_date(date, &expense.recurring_frequency)?.to_string()).bind(expense.id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
        created += 1;
    }
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(created)
}

#[tauri::command]
pub async fn bulk_delete_expenses(app: AppHandle, input: ExpenseIdsInput) -> Result<(), String> {
    let pool = pool(&app, &input.workspace_id).await?;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    for id in input.ids {
        let bad_debt =
            sqlx::query_scalar::<_, bool>("SELECT is_bad_debt FROM expenses WHERE id = ?")
                .bind(id)
                .fetch_optional(&mut *transaction)
                .await
                .map_err(|error| error.to_string())?;
        if bad_debt == Some(true) {
            return Err("Bad-debt expenses cannot be bulk deleted.".into());
        }
        sqlx::query("UPDATE expenses SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL").bind(id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    }
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(())
}

#[tauri::command]
pub async fn bulk_categorise_expenses(
    app: AppHandle,
    input: CategoriseExpensesInput,
) -> Result<(), String> {
    let pool = pool(&app, &input.workspace_id).await?;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let category_exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM expense_categories WHERE id = ?)",
    )
    .bind(input.category_id)
    .fetch_one(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;
    if !category_exists {
        return Err("Expense category was not found.".into());
    }
    for id in input.ids {
        sqlx::query("UPDATE expenses SET category_id = ?, updated_at = datetime('now') WHERE id = ? AND is_bad_debt = 0 AND deleted_at IS NULL")
            .bind(input.category_id).bind(id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    }
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(())
}

#[tauri::command]
pub async fn reorder_expense_categories(
    app: AppHandle,
    input: ExpenseIdsInput,
) -> Result<(), String> {
    let pool = pool(&app, &input.workspace_id).await?;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    for (index, id) in input.ids.into_iter().enumerate() {
        sqlx::query("UPDATE expense_categories SET sort_order = ? WHERE id = ?")
            .bind(index as i64 + 1)
            .bind(id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
    }
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(())
}
