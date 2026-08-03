use chrono::{Duration, Local, Months, NaiveDate};
use serde::Deserialize;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    FromRow, Sqlite, Transaction,
};
use tauri::AppHandle;
use uuid::Uuid;

use crate::transactions::tax_year_for_date;
use crate::workspaces::workspace_database_path;

#[derive(Clone, Deserialize)]
pub struct InvoiceLineInput {
    description: String,
    quantity: f64,
    unit_price: f64,
    vat_rate: Option<f64>,
}

#[derive(Clone, Deserialize)]
pub struct InvoiceInput {
    workspace_id: String,
    client_id: i64,
    issue_date: String,
    due_date: String,
    vat_ec_supply: bool,
    notes: String,
    internal_notes: String,
    is_quote: bool,
    is_recurring: bool,
    recurring_frequency: Option<String>,
    recurring_next_date: Option<String>,
    recurring_auto_create: bool,
    line_items: Vec<InvoiceLineInput>,
}

#[derive(Deserialize)]
pub struct UpdateInvoiceInput {
    id: i64,
    #[serde(flatten)]
    invoice: InvoiceInput,
}

#[derive(Deserialize)]
pub struct InvoicePaymentInput {
    workspace_id: String,
    invoice_id: i64,
    amount: f64,
    payment_date: String,
    payment_method: String,
    notes: String,
}

#[derive(Deserialize)]
pub struct SelfBilledInvoiceInput {
    workspace_id: String,
    client_id: i64,
    external_reference: String,
    issue_date: String,
    due_date: String,
    notes: String,
    internal_notes: String,
    source_document_id: i64,
    self_billing_agreement_id: Option<i64>,
    self_billing_checks_confirmed: bool,
    line_items: Vec<InvoiceLineInput>,
}

#[derive(Deserialize)]
pub struct SelfBilledSettlementInput {
    workspace_id: String,
    invoice_id: i64,
    payment_date: String,
    cash_amount: f64,
    cis_deduction_amount: f64,
    cis_gross_amount: f64,
    materials_amount: f64,
    deduction_rate: f64,
    party_utr: String,
    notes: String,
    source_document_id: Option<i64>,
    bank_transaction_id: Option<i64>,
}

#[derive(Deserialize)]
pub struct CreditNoteInput {
    workspace_id: String,
    invoice_id: i64,
    amount: f64,
    reason: String,
    issue_date: String,
}

#[derive(Deserialize)]
pub struct ConvertQuoteInput {
    workspace_id: String,
    quote_id: i64,
}

#[derive(Deserialize)]
pub struct ProcessRecurringInput {
    workspace_id: String,
}

#[derive(Deserialize)]
pub struct WriteOffBadDebtInput {
    workspace_id: String,
    invoice_id: i64,
}

#[derive(FromRow)]
struct InvoiceSource {
    id: i64,
    client_id: i64,
    issue_date: String,
    due_date: String,
    vat_ec_supply: bool,
    notes: String,
    internal_notes: String,
    recurring_frequency: Option<String>,
    recurring_next_date: Option<String>,
}

fn validate_invoice(input: &InvoiceInput) -> Result<(), String> {
    if input.line_items.is_empty() {
        return Err("Add at least one invoice line.".into());
    }
    if input.issue_date > input.due_date {
        return Err("Invoice due date cannot be before its issue date.".into());
    }
    if input.line_items.iter().any(|item| {
        item.description.trim().is_empty()
            || !item.quantity.is_finite()
            || item.quantity <= 0.0
            || !item.unit_price.is_finite()
            || item.unit_price < 0.0
            || item
                .vat_rate
                .is_some_and(|rate| !rate.is_finite() || !(0.0..=100.0).contains(&rate))
    }) {
        return Err("Invoice lines require a description, positive quantity, non-negative price and VAT rate from 0 to 100%.".into());
    }
    if input.is_recurring && input.recurring_frequency.is_none() {
        return Err("Recurring invoices require a frequency.".into());
    }
    tax_year_for_date(&input.issue_date)?;
    Ok(())
}

fn totals(items: &[InvoiceLineInput]) -> (f64, f64, f64) {
    items.iter().fold((0.0, 0.0, 0.0), |totals, item| {
        let net = item.quantity * item.unit_price;
        let vat = net * item.vat_rate.unwrap_or(0.0) / 100.0;
        (totals.0 + net, totals.1 + vat, totals.2 + net + vat)
    })
}

async fn insert_line_items(
    transaction: &mut Transaction<'_, Sqlite>,
    invoice_id: i64,
    items: &[InvoiceLineInput],
) -> Result<(), String> {
    for (index, item) in items.iter().enumerate() {
        let net = item.quantity * item.unit_price;
        let vat = net * item.vat_rate.unwrap_or(0.0) / 100.0;
        sqlx::query("INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, vat_rate, vat_amount, line_total, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(invoice_id).bind(item.description.trim()).bind(item.quantity).bind(item.unit_price).bind(item.vat_rate).bind(vat).bind(net + vat).bind(index as i64)
            .execute(&mut **transaction).await.map_err(|error| error.to_string())?;
    }
    Ok(())
}

async fn load_line_items(
    transaction: &mut Transaction<'_, Sqlite>,
    invoice_id: i64,
) -> Result<Vec<InvoiceLineInput>, String> {
    sqlx::query_as::<_, (String, f64, f64, Option<f64>)>(
        "SELECT description, quantity, unit_price, vat_rate FROM invoice_line_items WHERE invoice_id = ? ORDER BY sort_order",
    )
    .bind(invoice_id)
    .fetch_all(&mut **transaction)
    .await
    .map(|items| items.into_iter().map(|item| InvoiceLineInput { description: item.0, quantity: item.1, unit_price: item.2, vat_rate: item.3 }).collect())
    .map_err(|error| error.to_string())
}

fn next_recurring_date(date: NaiveDate, frequency: &str) -> Result<NaiveDate, String> {
    match frequency {
        "weekly" => Ok(date + Duration::weeks(1)),
        "fortnightly" => Ok(date + Duration::weeks(2)),
        "monthly" => date
            .checked_add_months(Months::new(1))
            .ok_or_else(|| "Recurring invoice date is out of range.".into()),
        "quarterly" => date
            .checked_add_months(Months::new(3))
            .ok_or_else(|| "Recurring invoice date is out of range.".into()),
        "yearly" => date
            .checked_add_months(Months::new(12))
            .ok_or_else(|| "Recurring invoice date is out of range.".into()),
        _ => Err("Recurring invoice frequency is invalid.".into()),
    }
}

async fn insert_invoice(
    transaction: &mut Transaction<'_, Sqlite>,
    input: &InvoiceInput,
    converted_from_quote_id: Option<i64>,
) -> Result<i64, String> {
    validate_invoice(input)?;
    let settings = sqlx::query_as::<_, (String, i64)>(
        "SELECT number_prefix, number_next FROM invoice_settings WHERE id = 1",
    )
    .fetch_optional(&mut **transaction)
    .await
    .map_err(|error| error.to_string())?
    .unwrap_or(("INV-".into(), 1));
    let prefix = if input.is_quote {
        "QTE-"
    } else {
        settings.0.as_str()
    };
    let number = format!("{prefix}{:03}", settings.1);
    let updated = sqlx::query("UPDATE invoice_settings SET number_next = number_next + 1, updated_at = datetime('now') WHERE id = 1")
        .execute(&mut **transaction).await.map_err(|error| error.to_string())?;
    if updated.rows_affected() != 1 {
        return Err("Invoice numbering settings are unavailable.".into());
    }
    let (subtotal, vat, total) = totals(&input.line_items);
    let result = sqlx::query("INSERT INTO invoices (client_id, invoice_number, status, issue_date, due_date, subtotal, vat_amount, vat_ec_supply, total, notes, internal_notes, is_recurring, recurring_frequency, recurring_next_date, recurring_auto_create, is_quote, converted_from_quote_id, tax_year) VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(input.client_id).bind(number).bind(&input.issue_date).bind(&input.due_date).bind(subtotal).bind(vat).bind(input.vat_ec_supply).bind(total)
        .bind(&input.notes).bind(&input.internal_notes).bind(input.is_recurring).bind(if input.is_recurring { input.recurring_frequency.as_deref() } else { None })
        .bind(if input.is_recurring { input.recurring_next_date.as_deref() } else { None }).bind(input.is_recurring && input.recurring_auto_create).bind(input.is_quote)
        .bind(converted_from_quote_id).bind(tax_year_for_date(&input.issue_date)?).execute(&mut **transaction).await.map_err(|error| error.to_string())?;
    let invoice_id = result.last_insert_rowid();
    insert_line_items(transaction, invoice_id, &input.line_items).await?;
    Ok(invoice_id)
}

async fn insert_self_billed_invoice(
    transaction: &mut Transaction<'_, Sqlite>,
    input: &SelfBilledInvoiceInput,
) -> Result<i64, String> {
    let reference = input.external_reference.trim();
    if reference.is_empty() {
        return Err("Enter the customer's self-billed invoice reference.".into());
    }
    let validation = InvoiceInput {
        workspace_id: input.workspace_id.clone(),
        client_id: input.client_id,
        issue_date: input.issue_date.clone(),
        due_date: input.due_date.clone(),
        vat_ec_supply: false,
        notes: input.notes.clone(),
        internal_notes: input.internal_notes.clone(),
        is_quote: false,
        is_recurring: false,
        recurring_frequency: None,
        recurring_next_date: None,
        recurring_auto_create: false,
        line_items: input.line_items.clone(),
    };
    validate_invoice(&validation)?;
    let document_available = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM documents WHERE id = ? AND deleted_at IS NULL AND linked_invoice_id IS NULL)",
    ).bind(input.source_document_id).fetch_one(&mut **transaction).await.map_err(|error| error.to_string())?;
    if !document_available {
        return Err("Select an available original self-billed invoice document.".into());
    }

    let (subtotal, vat, total) = totals(&input.line_items);
    if let Some(agreement_id) = input.self_billing_agreement_id {
        let agreement = sqlx::query_as::<_, (String, Option<i64>)>(
            "SELECT customer_vat_number, document_id FROM self_billing_agreements WHERE id = ? AND client_id = ? AND archived = 0 AND start_date <= ? AND expiry_date >= ?",
        ).bind(agreement_id).bind(input.client_id).bind(&input.issue_date).bind(&input.issue_date)
            .fetch_optional(&mut **transaction).await.map_err(|error| error.to_string())?.ok_or("The self-billing agreement does not cover this customer and invoice date.")?;
        if vat > 0.005
            && (agreement.0.trim().is_empty()
                || agreement.1.is_none()
                || !input.self_billing_checks_confirmed)
        {
            return Err("VAT self-billing requires agreement evidence, the customer's VAT number, and confirmed invoice checks.".into());
        }
    } else if vat > 0.005 {
        return Err("Select an active self-billing agreement before recording VAT.".into());
    }

    let internal_reference = format!("__self_billed_{}", Uuid::new_v4().simple());
    let result = sqlx::query(
        "INSERT INTO invoices (client_id, invoice_number, status, issue_date, due_date, subtotal, vat_amount, total, notes, internal_notes, is_recurring, is_quote, tax_year, source_type, external_reference, source_document_id, self_billing_agreement_id, self_billing_checks_confirmed) VALUES (?, ?, 'sent', ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 'self_billed', ?, ?, ?, ?)",
    ).bind(input.client_id).bind(internal_reference).bind(&input.issue_date).bind(&input.due_date).bind(subtotal).bind(vat).bind(total)
        .bind(input.notes.trim()).bind(input.internal_notes.trim()).bind(tax_year_for_date(&input.issue_date)?).bind(reference)
        .bind(input.source_document_id).bind(input.self_billing_agreement_id).bind(input.self_billing_checks_confirmed)
        .execute(&mut **transaction).await.map_err(|error| error.to_string())?;
    let invoice_id = result.last_insert_rowid();
    insert_line_items(transaction, invoice_id, &input.line_items).await?;
    let linked = sqlx::query("UPDATE documents SET linked_invoice_id = ?, category = 'invoice_received', updated_at = datetime('now') WHERE id = ? AND linked_invoice_id IS NULL AND deleted_at IS NULL")
        .bind(invoice_id).bind(input.source_document_id).execute(&mut **transaction).await.map_err(|error| error.to_string())?;
    if linked.rows_affected() != 1 {
        return Err("The original document was linked by another operation.".into());
    }
    Ok(invoice_id)
}

async fn insert_self_billed_settlement(
    transaction: &mut Transaction<'_, Sqlite>,
    input: &SelfBilledSettlementInput,
) -> Result<i64, String> {
    let amounts = [
        input.cash_amount,
        input.cis_deduction_amount,
        input.cis_gross_amount,
        input.materials_amount,
        input.deduction_rate,
    ];
    if amounts.iter().any(|amount| !amount.is_finite())
        || input.cash_amount < 0.0
        || input.cis_deduction_amount < 0.0
    {
        return Err("Settlement amounts must be finite and non-negative.".into());
    }
    let settled_amount = input.cash_amount + input.cis_deduction_amount;
    if settled_amount <= 0.0 {
        return Err("The settlement must include cash or CIS deducted.".into());
    }
    let tax_year = tax_year_for_date(&input.payment_date)?;
    if input.cis_deduction_amount > 0.0 {
        if input.cis_gross_amount <= 0.0
            || input.materials_amount < 0.0
            || input.materials_amount > input.cis_gross_amount
            || !(0.0..=100.0).contains(&input.deduction_rate)
        {
            return Err(
                "Enter a valid CIS gross amount, materials amount, and deduction rate.".into(),
            );
        }
        let calculated =
            (input.cis_gross_amount - input.materials_amount) * input.deduction_rate / 100.0;
        if (calculated - input.cis_deduction_amount).abs() > 0.02 {
            return Err(
                "The CIS deduction does not match the gross amount, materials, and rate.".into(),
            );
        }
    } else if input.cis_gross_amount != 0.0
        || input.materials_amount != 0.0
        || input.deduction_rate != 0.0
    {
        return Err("CIS breakdown values must be zero when no CIS was deducted.".into());
    }

    let invoice = sqlx::query_as::<_, (f64, String, String)>(
        "SELECT MAX(0, i.total - COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = i.id), 0) - COALESCE((SELECT SUM(amount) FROM credit_notes WHERE invoice_id = i.id), 0)), COALESCE(NULLIF(c.company, ''), c.name), i.source_type FROM invoices i INNER JOIN clients c ON c.id = i.client_id WHERE i.id = ? AND i.deleted_at IS NULL",
    ).bind(input.invoice_id).fetch_optional(&mut **transaction).await.map_err(|error| error.to_string())?.ok_or("The self-billed invoice was not found.")?;
    if invoice.2 != "self_billed" {
        return Err("CIS split settlement is available only for self-billed invoices.".into());
    }
    if settled_amount > invoice.0 + 0.005 {
        return Err("The settlement cannot exceed the invoice balance.".into());
    }

    if let Some(document_id) = input.source_document_id {
        let exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM documents WHERE id = ? AND deleted_at IS NULL)",
        )
        .bind(document_id)
        .fetch_one(&mut **transaction)
        .await
        .map_err(|error| error.to_string())?;
        if !exists {
            return Err("The CIS evidence document was not found.".into());
        }
    }
    if let Some(bank_id) = input.bank_transaction_id {
        let bank_amount = sqlx::query_scalar::<_, f64>(
            "SELECT amount_in FROM bank_transactions WHERE id = ? AND status = 'unmatched'",
        )
        .bind(bank_id)
        .fetch_optional(&mut **transaction)
        .await
        .map_err(|error| error.to_string())?
        .ok_or("The bank transaction is no longer available for matching.")?;
        if bank_amount <= 0.0 || (bank_amount - input.cash_amount).abs() > 0.005 {
            return Err("The bank receipt must equal the cash portion of the settlement.".into());
        }
    }

    let cis_id = if input.cis_deduction_amount > 0.0 {
        Some(sqlx::query("INSERT INTO cis_transactions (direction, date, party_name, party_utr, gross_amount, materials_amount, deduction_rate, deduction_amount, notes, tax_year, invoice_id, source_document_id, bank_transaction_id) VALUES ('received', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(&input.payment_date).bind(&invoice.1).bind(input.party_utr.trim()).bind(input.cis_gross_amount).bind(input.materials_amount)
            .bind(input.deduction_rate).bind(input.cis_deduction_amount).bind(input.notes.trim()).bind(tax_year)
            .bind(input.invoice_id).bind(input.source_document_id).bind(input.bank_transaction_id)
            .execute(&mut **transaction).await.map_err(|error| error.to_string())?.last_insert_rowid())
    } else {
        None
    };

    let payment_id = sqlx::query("INSERT INTO invoice_payments (invoice_id, amount, cash_amount, cis_deduction_amount, cis_transaction_id, payment_date, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?, 'Self-billed settlement', ?)")
        .bind(input.invoice_id).bind(settled_amount).bind(input.cash_amount).bind(input.cis_deduction_amount).bind(cis_id)
        .bind(&input.payment_date).bind(input.notes.trim()).execute(&mut **transaction).await.map_err(|error| error.to_string())?.last_insert_rowid();
    if let Some(cis_id) = cis_id {
        sqlx::query("UPDATE cis_transactions SET invoice_payment_id = ?, updated_at = datetime('now') WHERE id = ?")
            .bind(payment_id).bind(cis_id).execute(&mut **transaction).await.map_err(|error| error.to_string())?;
    }
    if let Some(bank_id) = input.bank_transaction_id {
        let claimed = sqlx::query("UPDATE bank_transactions SET matched_invoice_id = ?, matched_payment_id = ?, status = 'matched', match_confidence = 'manual', updated_at = datetime('now') WHERE id = ? AND status = 'unmatched'")
            .bind(input.invoice_id).bind(payment_id).bind(bank_id).execute(&mut **transaction).await.map_err(|error| error.to_string())?;
        if claimed.rows_affected() != 1 {
            return Err("The bank transaction was matched by another operation.".into());
        }
    }
    Ok(payment_id)
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

#[tauri::command]
pub async fn create_invoice(app: AppHandle, input: InvoiceInput) -> Result<i64, String> {
    let pool = pool(&app, &input.workspace_id).await?;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let id = insert_invoice(&mut transaction, &input, None).await?;
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(id)
}

#[tauri::command]
pub async fn create_self_billed_invoice(
    app: AppHandle,
    input: SelfBilledInvoiceInput,
) -> Result<i64, String> {
    let pool = pool(&app, &input.workspace_id).await?;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let id = insert_self_billed_invoice(&mut transaction, &input).await?;
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(id)
}

#[tauri::command]
pub async fn record_self_billed_settlement(
    app: AppHandle,
    input: SelfBilledSettlementInput,
) -> Result<i64, String> {
    let pool = pool(&app, &input.workspace_id).await?;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let id = insert_self_billed_settlement(&mut transaction, &input).await?;
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(id)
}

#[tauri::command]
pub async fn update_invoice(app: AppHandle, input: UpdateInvoiceInput) -> Result<(), String> {
    validate_invoice(&input.invoice)?;
    let pool = pool(&app, &input.invoice.workspace_id).await?;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let status = sqlx::query_scalar::<_, String>(
        "SELECT status FROM invoices WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(input.id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?
    .ok_or("Invoice was not found.")?;
    if status != "draft" {
        return Err("Only draft invoices and quotes can be edited.".into());
    }
    let (subtotal, vat, total) = totals(&input.invoice.line_items);
    let result = sqlx::query("UPDATE invoices SET client_id = ?, issue_date = ?, due_date = ?, subtotal = ?, vat_amount = ?, vat_ec_supply = ?, total = ?, notes = ?, internal_notes = ?, is_recurring = ?, recurring_frequency = ?, recurring_next_date = ?, recurring_auto_create = ?, tax_year = ?, updated_at = datetime('now') WHERE id = ? AND status = 'draft'")
        .bind(input.invoice.client_id).bind(&input.invoice.issue_date).bind(&input.invoice.due_date).bind(subtotal).bind(vat).bind(input.invoice.vat_ec_supply).bind(total)
        .bind(&input.invoice.notes).bind(&input.invoice.internal_notes).bind(input.invoice.is_recurring)
        .bind(if input.invoice.is_recurring { input.invoice.recurring_frequency.as_deref() } else { None })
        .bind(if input.invoice.is_recurring { input.invoice.recurring_next_date.as_deref() } else { None }).bind(input.invoice.is_recurring && input.invoice.recurring_auto_create)
        .bind(tax_year_for_date(&input.invoice.issue_date)?).bind(input.id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    if result.rows_affected() != 1 {
        return Err("Invoice changed before it could be saved.".into());
    }
    sqlx::query("DELETE FROM invoice_line_items WHERE invoice_id = ?")
        .bind(input.id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
    insert_line_items(&mut transaction, input.id, &input.invoice.line_items).await?;
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(())
}

#[tauri::command]
pub async fn record_invoice_payment(
    app: AppHandle,
    input: InvoicePaymentInput,
) -> Result<i64, String> {
    if !input.amount.is_finite() || input.amount <= 0.0 {
        return Err("Payment must be greater than zero.".into());
    }
    tax_year_for_date(&input.payment_date)?;
    let pool = pool(&app, &input.workspace_id).await?;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let balance = sqlx::query_scalar::<_, f64>("SELECT MAX(0, total - COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = invoices.id), 0) - COALESCE((SELECT SUM(amount) FROM credit_notes WHERE invoice_id = invoices.id), 0)) FROM invoices WHERE id = ? AND deleted_at IS NULL")
        .bind(input.invoice_id).fetch_optional(&mut *transaction).await.map_err(|error| error.to_string())?.ok_or("Invoice was not found.")?;
    if input.amount > balance + 0.005 {
        return Err("Payment cannot exceed the outstanding balance.".into());
    }
    let result = sqlx::query("INSERT INTO invoice_payments (invoice_id, amount, cash_amount, payment_date, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(input.invoice_id).bind(input.amount).bind(input.amount).bind(input.payment_date).bind(input.payment_method).bind(input.notes).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(result.last_insert_rowid())
}

#[tauri::command]
pub async fn create_credit_note(app: AppHandle, input: CreditNoteInput) -> Result<i64, String> {
    if !input.amount.is_finite() || input.amount <= 0.0 {
        return Err("Credit amount must be greater than zero.".into());
    }
    tax_year_for_date(&input.issue_date)?;
    let pool = pool(&app, &input.workspace_id).await?;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let invoice = sqlx::query_as::<_, (String, f64)>("SELECT invoice_number, MAX(0, total - COALESCE((SELECT SUM(amount) FROM credit_notes WHERE invoice_id = invoices.id), 0)) FROM invoices WHERE id = ? AND deleted_at IS NULL")
        .bind(input.invoice_id).fetch_optional(&mut *transaction).await.map_err(|error| error.to_string())?.ok_or("Invoice was not found.")?;
    if input.amount > invoice.1 + 0.005 {
        return Err("Total credits cannot exceed the invoice total.".into());
    }
    let sequence =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) + 1 FROM credit_notes WHERE invoice_id = ?")
            .bind(input.invoice_id)
            .fetch_one(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
    let credit_number = format!("CN-{}-{sequence:02}", invoice.0);
    let result = sqlx::query("INSERT INTO credit_notes (invoice_id, credit_number, amount, reason, issue_date) VALUES (?, ?, ?, ?, ?)")
        .bind(input.invoice_id).bind(credit_number).bind(input.amount).bind(input.reason).bind(input.issue_date).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(result.last_insert_rowid())
}

#[tauri::command]
pub async fn convert_quote(app: AppHandle, input: ConvertQuoteInput) -> Result<i64, String> {
    let pool = pool(&app, &input.workspace_id).await?;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let quote = sqlx::query_as::<_, InvoiceSource>(
        "SELECT id, client_id, issue_date, due_date, vat_ec_supply, notes, internal_notes, recurring_frequency, recurring_next_date FROM invoices WHERE id = ? AND is_quote = 1 AND deleted_at IS NULL",
    )
    .bind(input.quote_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?
    .ok_or("Quote was not found.")?;
    let converted = sqlx::query_scalar::<_, i64>(
        "SELECT id FROM invoices WHERE converted_from_quote_id = ? AND deleted_at IS NULL",
    )
    .bind(input.quote_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;
    if converted.is_some() {
        return Err("This quote has already been converted to an invoice.".into());
    }
    let payment_terms = sqlx::query_scalar::<_, i64>(
        "SELECT payment_terms_days FROM invoice_settings WHERE id = 1",
    )
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?
    .unwrap_or(30)
    .max(0);
    let issue_date = Local::now().date_naive();
    let invoice = InvoiceInput {
        workspace_id: input.workspace_id,
        client_id: quote.client_id,
        issue_date: issue_date.to_string(),
        due_date: (issue_date + Duration::days(payment_terms)).to_string(),
        vat_ec_supply: quote.vat_ec_supply,
        notes: quote.notes,
        internal_notes: quote.internal_notes,
        is_quote: false,
        is_recurring: false,
        recurring_frequency: None,
        recurring_next_date: None,
        recurring_auto_create: false,
        line_items: load_line_items(&mut transaction, quote.id).await?,
    };
    let id = insert_invoice(&mut transaction, &invoice, Some(quote.id)).await?;
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(id)
}

#[tauri::command]
pub async fn process_recurring_invoices(
    app: AppHandle,
    input: ProcessRecurringInput,
) -> Result<u64, String> {
    let pool = pool(&app, &input.workspace_id).await?;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let due = sqlx::query_as::<_, InvoiceSource>(
        "SELECT id, client_id, issue_date, due_date, vat_ec_supply, notes, internal_notes, recurring_frequency, recurring_next_date FROM invoices WHERE deleted_at IS NULL AND is_recurring = 1 AND recurring_auto_create = 1 AND recurring_next_date <= date('now')",
    )
    .fetch_all(&mut *transaction).await.map_err(|error| error.to_string())?;
    let mut created = 0;
    for source in due {
        let frequency = source
            .recurring_frequency
            .as_deref()
            .ok_or("Recurring invoice frequency is missing.")?;
        let issue_date = NaiveDate::parse_from_str(
            source
                .recurring_next_date
                .as_deref()
                .ok_or("Recurring invoice date is missing.")?,
            "%Y-%m-%d",
        )
        .map_err(|_| "Recurring invoice date is invalid.")?;
        let original_issue = NaiveDate::parse_from_str(&source.issue_date, "%Y-%m-%d")
            .map_err(|_| "Invoice issue date is invalid.")?;
        let original_due = NaiveDate::parse_from_str(&source.due_date, "%Y-%m-%d")
            .map_err(|_| "Invoice due date is invalid.")?;
        let payment_terms = (original_due - original_issue).num_days().max(0);
        let invoice = InvoiceInput {
            workspace_id: input.workspace_id.clone(),
            client_id: source.client_id,
            issue_date: issue_date.to_string(),
            due_date: (issue_date + Duration::days(payment_terms)).to_string(),
            vat_ec_supply: source.vat_ec_supply,
            notes: source.notes,
            internal_notes: source.internal_notes,
            is_quote: false,
            is_recurring: false,
            recurring_frequency: None,
            recurring_next_date: None,
            recurring_auto_create: false,
            line_items: load_line_items(&mut transaction, source.id).await?,
        };
        insert_invoice(&mut transaction, &invoice, None).await?;
        let next_date = next_recurring_date(issue_date, frequency)?;
        sqlx::query("UPDATE invoices SET recurring_next_date = ?, updated_at = datetime('now') WHERE id = ?")
            .bind(next_date.to_string()).bind(source.id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
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
pub async fn write_off_bad_debt(app: AppHandle, input: WriteOffBadDebtInput) -> Result<(), String> {
    let pool = pool(&app, &input.workspace_id).await?;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let invoice = sqlx::query_as::<_, (String, String, f64, bool)>(
        "SELECT i.invoice_number, c.name, MAX(0, i.total - COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = i.id), 0) - COALESCE((SELECT SUM(amount) FROM credit_notes WHERE invoice_id = i.id), 0)), i.bad_debt_written_off FROM invoices i INNER JOIN clients c ON c.id = i.client_id WHERE i.id = ? AND i.deleted_at IS NULL",
    )
    .bind(input.invoice_id).fetch_optional(&mut *transaction).await.map_err(|error| error.to_string())?.ok_or("Invoice was not found.")?;
    if invoice.2 <= 0.005 || invoice.3 {
        return Err("This invoice has no balance available to write off.".into());
    }
    let accounting_basis =
        sqlx::query_scalar::<_, String>("SELECT accounting_basis FROM user_profile WHERE id = 1")
            .fetch_optional(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?
            .ok_or("Accounting basis is unavailable.")?;
    let expense_id = if accounting_basis == "accrual" {
        let category_id = sqlx::query_scalar::<_, i64>(
            "SELECT id FROM expense_categories WHERE name = 'Bad Debts'",
        )
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?
        .ok_or("Bad Debts expense category is unavailable.")?;
        let today = Local::now().date_naive().to_string();
        Some(sqlx::query("INSERT INTO expenses (category_id, date, supplier, description, amount, business_percent, notes, tax_year, is_bad_debt, source_invoice_id) VALUES (?, ?, ?, ?, ?, 100, 'Created from unpaid invoice', ?, 1, ?)")
            .bind(category_id).bind(&today).bind(invoice.1).bind(format!("Bad debt: {}", invoice.0)).bind(invoice.2).bind(tax_year_for_date(&today)?).bind(input.invoice_id)
            .execute(&mut *transaction).await.map_err(|error| error.to_string())?.last_insert_rowid())
    } else if accounting_basis == "cash" {
        None
    } else {
        return Err("Accounting basis is invalid.".into());
    };
    let updated = sqlx::query("UPDATE invoices SET bad_debt_written_off = 1, bad_debt_expense_id = ?, status = 'cancelled', updated_at = datetime('now') WHERE id = ? AND bad_debt_written_off = 0")
        .bind(expense_id).bind(input.invoice_id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    if updated.rows_affected() != 1 {
        return Err("Invoice changed before it could be written off.".into());
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
    use crate::workspaces::initialise_database;
    use uuid::Uuid;

    fn input() -> InvoiceInput {
        InvoiceInput {
            workspace_id: "test".into(),
            client_id: 1,
            issue_date: "2026-07-01".into(),
            due_date: "2026-07-31".into(),
            vat_ec_supply: false,
            notes: String::new(),
            internal_notes: String::new(),
            is_quote: false,
            is_recurring: false,
            recurring_frequency: None,
            recurring_next_date: None,
            recurring_auto_create: false,
            line_items: vec![
                InvoiceLineInput {
                    description: "Work".into(),
                    quantity: 2.0,
                    unit_price: 50.0,
                    vat_rate: Some(20.0),
                },
                InvoiceLineInput {
                    description: "Materials".into(),
                    quantity: 1.0,
                    unit_price: 10.0,
                    vat_rate: Some(0.0),
                },
            ],
        }
    }

    async fn database(label: &str) -> (std::path::PathBuf, sqlx::SqlitePool) {
        let directory = std::env::temp_dir().join(format!(
            "soletrader-invoice-{label}-{}",
            Uuid::new_v4().simple()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join("soletrader.db");
        initialise_database(&path).await.unwrap();
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(path)
                    .foreign_keys(true),
            )
            .await
            .unwrap();
        sqlx::query("INSERT INTO clients (id, name) VALUES (1, 'Client')")
            .execute(&pool)
            .await
            .unwrap();
        (directory, pool)
    }

    #[tokio::test]
    async fn creates_numbered_invoice_with_authoritative_totals() {
        let (directory, pool) = database("create").await;
        let mut transaction = pool.begin().await.unwrap();
        let id = insert_invoice(&mut transaction, &input(), None)
            .await
            .unwrap();
        transaction.commit().await.unwrap();
        let invoice = sqlx::query_as::<_, (String, f64, f64, f64)>(
            "SELECT invoice_number, subtotal, vat_amount, total FROM invoices WHERE id = ?",
        )
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();
        let lines: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM invoice_line_items WHERE invoice_id = ?")
                .bind(id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(invoice, ("INV-001".into(), 110.0, 20.0, 130.0));
        assert_eq!(lines, 2);
        pool.close().await;
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn rolls_back_number_and_header_when_a_line_fails() {
        let (directory, pool) = database("rollback").await;
        sqlx::query("CREATE TRIGGER reject_second_invoice_line BEFORE INSERT ON invoice_line_items WHEN NEW.sort_order = 1 BEGIN SELECT RAISE(ABORT, 'test line failure'); END")
            .execute(&pool).await.unwrap();
        let mut transaction = pool.begin().await.unwrap();
        assert!(insert_invoice(&mut transaction, &input(), None)
            .await
            .is_err());
        transaction.rollback().await.unwrap();
        let invoices: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM invoices")
            .fetch_one(&pool)
            .await
            .unwrap();
        let next_number: i64 =
            sqlx::query_scalar("SELECT number_next FROM invoice_settings WHERE id = 1")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(invoices, 0);
        assert_eq!(next_number, 1);
        pool.close().await;
        std::fs::remove_dir_all(directory).unwrap();
    }

    async fn self_billed_input(pool: &sqlx::SqlitePool) -> SelfBilledInvoiceInput {
        sqlx::query("INSERT INTO documents (id, file_name, file_path, category, document_date) VALUES (1, 'agreement.pdf', 'agreement.pdf', 'contract', '2026-04-01'), (2, 'self-bill.pdf', 'self-bill.pdf', 'invoice_received', '2026-07-01')")
            .execute(pool).await.unwrap();
        sqlx::query("INSERT INTO self_billing_agreements (id, client_id, start_date, expiry_date, customer_vat_number, document_id) VALUES (1, 1, '2026-04-01', '2027-03-31', 'GB123456789', 1)")
            .execute(pool).await.unwrap();
        SelfBilledInvoiceInput {
            workspace_id: "test".into(),
            client_id: 1,
            external_reference: "CUSTOMER-42".into(),
            issue_date: "2026-07-01".into(),
            due_date: "2026-07-31".into(),
            notes: String::new(),
            internal_notes: String::new(),
            source_document_id: 2,
            self_billing_agreement_id: Some(1),
            self_billing_checks_confirmed: true,
            line_items: vec![InvoiceLineInput {
                description: "Contract work".into(),
                quantity: 1.0,
                unit_price: 1000.0,
                vat_rate: Some(20.0),
            }],
        }
    }

    #[tokio::test]
    async fn creates_self_billed_invoice_without_consuming_local_sequence() {
        let (directory, pool) = database("self-bill-create").await;
        let input = self_billed_input(&pool).await;
        let mut transaction = pool.begin().await.unwrap();
        let id = insert_self_billed_invoice(&mut transaction, &input)
            .await
            .unwrap();
        transaction.commit().await.unwrap();
        let invoice = sqlx::query_as::<_, (String, String, f64, String)>(
            "SELECT source_type, external_reference, total, status FROM invoices WHERE id = ?",
        )
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();
        let next_number: i64 =
            sqlx::query_scalar("SELECT number_next FROM invoice_settings WHERE id = 1")
                .fetch_one(&pool)
                .await
                .unwrap();
        let linked: i64 =
            sqlx::query_scalar("SELECT linked_invoice_id FROM documents WHERE id = 2")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(
            invoice,
            (
                "self_billed".into(),
                "CUSTOMER-42".into(),
                1200.0,
                "sent".into()
            )
        );
        assert_eq!(next_number, 1);
        assert_eq!(linked, id);
        pool.close().await;
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn rejects_duplicate_self_bill_without_linking_second_document() {
        let (directory, pool) = database("self-bill-duplicate").await;
        let input = self_billed_input(&pool).await;
        let mut transaction = pool.begin().await.unwrap();
        insert_self_billed_invoice(&mut transaction, &input)
            .await
            .unwrap();
        transaction.commit().await.unwrap();
        sqlx::query("INSERT INTO documents (id, file_name, file_path, category, document_date) VALUES (3, 'duplicate.pdf', 'duplicate.pdf', 'invoice_received', '2026-07-02')")
            .execute(&pool).await.unwrap();
        let duplicate = SelfBilledInvoiceInput {
            source_document_id: 3,
            ..input
        };
        let mut transaction = pool.begin().await.unwrap();
        assert!(insert_self_billed_invoice(&mut transaction, &duplicate)
            .await
            .is_err());
        transaction.rollback().await.unwrap();
        let linked: Option<i64> =
            sqlx::query_scalar("SELECT linked_invoice_id FROM documents WHERE id = 3")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(linked, None);
        pool.close().await;
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn settles_self_bill_with_cash_cis_and_bank_link() {
        let (directory, pool) = database("self-bill-settle").await;
        let invoice_input = self_billed_input(&pool).await;
        let mut transaction = pool.begin().await.unwrap();
        let invoice_id = insert_self_billed_invoice(&mut transaction, &invoice_input)
            .await
            .unwrap();
        transaction.commit().await.unwrap();
        sqlx::query("INSERT INTO bank_transactions (id, transaction_date, description, amount_in, source_file, hash, tax_year) VALUES (1, '2026-07-15', 'CUSTOMER PAYMENT', 1000, 'bank.csv', 'self-bill-bank', '2026/27')")
            .execute(&pool).await.unwrap();
        let settlement = SelfBilledSettlementInput {
            workspace_id: "test".into(),
            invoice_id,
            payment_date: "2026-07-15".into(),
            cash_amount: 1000.0,
            cis_deduction_amount: 200.0,
            cis_gross_amount: 1000.0,
            materials_amount: 0.0,
            deduction_rate: 20.0,
            party_utr: "1234567890".into(),
            notes: String::new(),
            source_document_id: Some(2),
            bank_transaction_id: Some(1),
        };
        let mut transaction = pool.begin().await.unwrap();
        let payment_id = insert_self_billed_settlement(&mut transaction, &settlement)
            .await
            .unwrap();
        transaction.commit().await.unwrap();
        let payment = sqlx::query_as::<_, (f64, f64, f64, i64)>("SELECT amount, cash_amount, cis_deduction_amount, cis_transaction_id FROM invoice_payments WHERE id = ?")
            .bind(payment_id).fetch_one(&pool).await.unwrap();
        let invoice = sqlx::query_as::<_, (f64, String)>(
            "SELECT amount_paid, status FROM invoices WHERE id = ?",
        )
        .bind(invoice_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        let cis_payment: i64 =
            sqlx::query_scalar("SELECT invoice_payment_id FROM cis_transactions WHERE id = ?")
                .bind(payment.3)
                .fetch_one(&pool)
                .await
                .unwrap();
        let bank_payment: i64 =
            sqlx::query_scalar("SELECT matched_payment_id FROM bank_transactions WHERE id = 1")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!((payment.0, payment.1, payment.2), (1200.0, 1000.0, 200.0));
        assert_eq!(invoice, (1200.0, "paid".into()));
        assert_eq!(cis_payment, payment_id);
        assert_eq!(bank_payment, payment_id);
        pool.close().await;
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn rolls_back_self_bill_settlement_when_bank_cash_differs() {
        let (directory, pool) = database("self-bill-bank-rollback").await;
        let invoice_input = self_billed_input(&pool).await;
        let mut transaction = pool.begin().await.unwrap();
        let invoice_id = insert_self_billed_invoice(&mut transaction, &invoice_input)
            .await
            .unwrap();
        transaction.commit().await.unwrap();
        sqlx::query("INSERT INTO bank_transactions (id, transaction_date, description, amount_in, source_file, hash, tax_year) VALUES (1, '2026-07-15', 'CUSTOMER PAYMENT', 999, 'bank.csv', 'rollback-bank', '2026/27')")
            .execute(&pool).await.unwrap();
        let settlement = SelfBilledSettlementInput {
            workspace_id: "test".into(),
            invoice_id,
            payment_date: "2026-07-15".into(),
            cash_amount: 1000.0,
            cis_deduction_amount: 200.0,
            cis_gross_amount: 1000.0,
            materials_amount: 0.0,
            deduction_rate: 20.0,
            party_utr: String::new(),
            notes: String::new(),
            source_document_id: None,
            bank_transaction_id: Some(1),
        };
        let mut transaction = pool.begin().await.unwrap();
        assert!(insert_self_billed_settlement(&mut transaction, &settlement)
            .await
            .is_err());
        transaction.rollback().await.unwrap();
        let payments: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM invoice_payments")
            .fetch_one(&pool)
            .await
            .unwrap();
        let cis: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cis_transactions")
            .fetch_one(&pool)
            .await
            .unwrap();
        let status: String =
            sqlx::query_scalar("SELECT status FROM bank_transactions WHERE id = 1")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!((payments, cis, status), (0, 0, "unmatched".into()));
        pool.close().await;
        std::fs::remove_dir_all(directory).unwrap();
    }
}
