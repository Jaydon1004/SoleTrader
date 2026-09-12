use serde::{Deserialize, Serialize};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use tauri::AppHandle;

use crate::workspaces::workspace_database_path;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerRebuildInput {
    workspace_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YearEndInput {
    workspace_id: String,
    tax_year: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerSummary {
    entries: i64,
    lines: i64,
    debit_pence: i64,
    credit_pence: i64,
    balanced: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YearEndCloseResult {
    tax_year: String,
    closed_at: String,
    ledger: LedgerSummary,
}

async fn rebuild_at(path: &std::path::Path) -> Result<LedgerSummary, String> {
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

    sqlx::query("DELETE FROM journal_entries WHERE generated = 1")
        .execute(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;

    for statement in [
        "INSERT INTO journal_entries (entry_date, description, source_type, source_id, tax_year) SELECT issue_date, 'Invoice ' || invoice_number, 'invoice', id, tax_year FROM invoices WHERE deleted_at IS NULL AND is_quote = 0 AND status NOT IN ('draft', 'cancelled')",
        "INSERT INTO journal_lines (entry_id, account_code, debit) SELECT j.id, '1100', CAST(ROUND(i.total * 100) AS INTEGER) FROM journal_entries j INNER JOIN invoices i ON j.source_type = 'invoice' AND j.source_id = i.id WHERE i.total > 0",
        "INSERT INTO journal_lines (entry_id, account_code, credit) SELECT j.id, '4000', CAST(ROUND(i.subtotal * 100) AS INTEGER) FROM journal_entries j INNER JOIN invoices i ON j.source_type = 'invoice' AND j.source_id = i.id WHERE i.subtotal > 0",
        "INSERT INTO journal_lines (entry_id, account_code, credit) SELECT j.id, '2000', CAST(ROUND(i.vat_amount * 100) AS INTEGER) FROM journal_entries j INNER JOIN invoices i ON j.source_type = 'invoice' AND j.source_id = i.id WHERE i.vat_amount > 0",
        "INSERT INTO journal_entries (entry_date, description, source_type, source_id, tax_year) SELECT p.payment_date, 'Invoice payment', 'invoice_payment', p.id, CASE WHEN CAST(strftime('%m', p.payment_date) AS INTEGER) > 4 OR (strftime('%m-%d', p.payment_date) >= '04-06') THEN strftime('%Y', p.payment_date) || '/' || substr(CAST(CAST(strftime('%Y', p.payment_date) AS INTEGER) + 1 AS TEXT), 3, 2) ELSE CAST(CAST(strftime('%Y', p.payment_date) AS INTEGER) - 1 AS TEXT) || '/' || substr(strftime('%Y', p.payment_date), 3, 2) END FROM invoice_payments p INNER JOIN invoices i ON i.id = p.invoice_id WHERE i.deleted_at IS NULL",
        "INSERT INTO journal_lines (entry_id, account_code, debit) SELECT j.id, CASE WHEN a.account_use IN ('mixed', 'personal') THEN '3000' ELSE '1000' END, CAST(ROUND(COALESCE(p.cash_amount, p.amount) * 100) AS INTEGER) FROM journal_entries j INNER JOIN invoice_payments p ON j.source_type = 'invoice_payment' AND j.source_id = p.id LEFT JOIN bank_transactions b ON b.matched_payment_id = p.id AND b.status = 'matched' LEFT JOIN bank_accounts a ON a.id = b.bank_account_id WHERE COALESCE(p.cash_amount, p.amount) > 0",
        "INSERT INTO journal_lines (entry_id, account_code, debit) SELECT j.id, '2100', CAST(ROUND(p.cis_deduction_amount * 100) AS INTEGER) FROM journal_entries j INNER JOIN invoice_payments p ON j.source_type = 'invoice_payment' AND j.source_id = p.id WHERE p.cis_deduction_amount > 0",
        "INSERT INTO journal_lines (entry_id, account_code, credit) SELECT j.id, '1100', CAST(ROUND(p.amount * 100) AS INTEGER) FROM journal_entries j INNER JOIN invoice_payments p ON j.source_type = 'invoice_payment' AND j.source_id = p.id WHERE p.amount > 0",
        "INSERT INTO journal_entries (entry_date, description, source_type, source_id, tax_year) SELECT e.date, e.description, 'expense', e.id, e.tax_year FROM expenses e WHERE e.deleted_at IS NULL AND e.amount > 0",
        "INSERT INTO journal_lines (entry_id, account_code, debit) SELECT j.id, CASE WHEN e.is_bad_debt = 1 THEN '5200' ELSE '5000' END, CAST(ROUND((e.amount - CASE WHEN p.vat_status = 'unregistered' OR (p.vat_scheme = 'flat_rate' AND e.vat_capital_asset = 0) THEN 0 ELSE e.vat_amount END) * e.business_percent) AS INTEGER) FROM journal_entries j INNER JOIN expenses e ON j.source_type = 'expense' AND j.source_id = e.id CROSS JOIN user_profile p WHERE p.id = 1 AND (e.amount - CASE WHEN p.vat_status = 'unregistered' OR (p.vat_scheme = 'flat_rate' AND e.vat_capital_asset = 0) THEN 0 ELSE e.vat_amount END) * e.business_percent > 0",
        "INSERT INTO journal_lines (entry_id, account_code, debit) SELECT j.id, '1200', CAST(ROUND(e.vat_amount * e.business_percent) AS INTEGER) FROM journal_entries j INNER JOIN expenses e ON j.source_type = 'expense' AND j.source_id = e.id CROSS JOIN user_profile p WHERE p.id = 1 AND p.vat_status != 'unregistered' AND NOT (p.vat_scheme = 'flat_rate' AND e.vat_capital_asset = 0) AND e.vat_amount * e.business_percent > 0",
        "INSERT INTO journal_lines (entry_id, account_code, credit) SELECT j.id, CASE WHEN e.paid_personally = 1 THEN '3000' ELSE '1000' END, CAST(ROUND(e.amount * e.business_percent) AS INTEGER) FROM journal_entries j INNER JOIN expenses e ON j.source_type = 'expense' AND j.source_id = e.id WHERE e.amount * e.business_percent > 0",
        "INSERT INTO journal_entries (entry_date, description, source_type, source_id, tax_year) SELECT d.income_date, d.description, 'direct_income', d.id, d.tax_year FROM direct_income d WHERE d.deleted_at IS NULL AND d.gross_amount > 0",
        "INSERT INTO journal_lines (entry_id, account_code, debit) SELECT j.id, CASE WHEN a.account_use IN ('mixed', 'personal') THEN '3000' ELSE '1000' END, CAST(ROUND(d.amount * 100) AS INTEGER) FROM journal_entries j INNER JOIN direct_income d ON j.source_type = 'direct_income' AND j.source_id = d.id LEFT JOIN bank_transactions b ON b.id = d.bank_transaction_id LEFT JOIN bank_accounts a ON a.id = b.bank_account_id WHERE d.amount > 0",
        "INSERT INTO journal_lines (entry_id, account_code, debit) SELECT j.id, '2100', CAST(ROUND(d.cis_deduction_amount * 100) AS INTEGER) FROM journal_entries j INNER JOIN direct_income d ON j.source_type = 'direct_income' AND j.source_id = d.id WHERE d.cis_deduction_amount > 0",
        "INSERT INTO journal_lines (entry_id, account_code, credit) SELECT j.id, '4900', CAST(ROUND((d.gross_amount - d.vat_amount) * 100) AS INTEGER) FROM journal_entries j INNER JOIN direct_income d ON j.source_type = 'direct_income' AND j.source_id = d.id WHERE d.gross_amount - d.vat_amount > 0",
        "INSERT INTO journal_lines (entry_id, account_code, credit) SELECT j.id, '2000', CAST(ROUND(d.vat_amount * 100) AS INTEGER) FROM journal_entries j INNER JOIN direct_income d ON j.source_type = 'direct_income' AND j.source_id = d.id WHERE d.vat_amount > 0",
        "INSERT INTO journal_entries (entry_date, description, source_type, source_id, tax_year) SELECT c.date, c.description, 'vehicle_cost', c.id, c.tax_year FROM vehicle_costs c WHERE c.deleted_at IS NULL AND c.amount > 0",
        "INSERT INTO journal_lines (entry_id, account_code, debit) SELECT j.id, '5100', CAST(ROUND((c.amount - CASE WHEN p.vat_status = 'unregistered' OR (p.vat_scheme = 'flat_rate' AND c.vat_capital_asset = 0) THEN 0 ELSE c.vat_amount END) * c.business_percent) AS INTEGER) FROM journal_entries j INNER JOIN vehicle_costs c ON j.source_type = 'vehicle_cost' AND j.source_id = c.id CROSS JOIN user_profile p WHERE p.id = 1 AND (c.amount - CASE WHEN p.vat_status = 'unregistered' OR (p.vat_scheme = 'flat_rate' AND c.vat_capital_asset = 0) THEN 0 ELSE c.vat_amount END) * c.business_percent > 0",
        "INSERT INTO journal_lines (entry_id, account_code, debit) SELECT j.id, '1200', CAST(ROUND(c.vat_amount * c.business_percent) AS INTEGER) FROM journal_entries j INNER JOIN vehicle_costs c ON j.source_type = 'vehicle_cost' AND j.source_id = c.id CROSS JOIN user_profile p WHERE p.id = 1 AND p.vat_status != 'unregistered' AND NOT (p.vat_scheme = 'flat_rate' AND c.vat_capital_asset = 0) AND c.vat_amount * c.business_percent > 0",
        "INSERT INTO journal_lines (entry_id, account_code, credit) SELECT j.id, '1000', CAST(ROUND(c.amount * c.business_percent) AS INTEGER) FROM journal_entries j INNER JOIN vehicle_costs c ON j.source_type = 'vehicle_cost' AND j.source_id = c.id WHERE c.amount * c.business_percent > 0",
        "INSERT INTO journal_entries (entry_date, description, source_type, source_id, tax_year) SELECT m.date, m.purpose, 'mileage', m.id, m.tax_year FROM mileage_logs m WHERE m.deleted_at IS NULL AND m.amount > 0",
        "INSERT INTO journal_lines (entry_id, account_code, debit) SELECT j.id, '5100', CAST(ROUND(m.amount * 100) AS INTEGER) FROM journal_entries j INNER JOIN mileage_logs m ON j.source_type = 'mileage' AND j.source_id = m.id",
        "INSERT INTO journal_lines (entry_id, account_code, credit) SELECT j.id, '3000', CAST(ROUND(m.amount * 100) AS INTEGER) FROM journal_entries j INNER JOIN mileage_logs m ON j.source_type = 'mileage' AND j.source_id = m.id",
        "INSERT INTO journal_entries (entry_date, description, source_type, source_id, tax_year) SELECT b.bill_date, 'Supplier bill: ' || b.supplier || CASE WHEN b.reference = '' THEN '' ELSE ' (' || b.reference || ')' END, 'supplier_bill', b.id, b.tax_year FROM supplier_bills b WHERE b.deleted_at IS NULL",
        "INSERT INTO journal_lines (entry_id, account_code, debit) SELECT j.id, '5000', CAST(ROUND((b.gross_amount - CASE WHEN p.vat_status = 'unregistered' OR (p.vat_scheme = 'flat_rate' AND b.vat_capital_asset = 0) THEN 0 ELSE b.vat_amount END) * b.business_percent) AS INTEGER) FROM journal_entries j INNER JOIN supplier_bills b ON j.source_type = 'supplier_bill' AND j.source_id = b.id CROSS JOIN user_profile p WHERE p.id = 1",
        "INSERT INTO journal_lines (entry_id, account_code, debit) SELECT j.id, '1200', CAST(ROUND(b.vat_amount * b.business_percent) AS INTEGER) FROM journal_entries j INNER JOIN supplier_bills b ON j.source_type = 'supplier_bill' AND j.source_id = b.id CROSS JOIN user_profile p WHERE p.id = 1 AND p.vat_status != 'unregistered' AND NOT (p.vat_scheme = 'flat_rate' AND b.vat_capital_asset = 0) AND b.vat_amount > 0",
        "INSERT INTO journal_lines (entry_id, account_code, debit) SELECT j.id, '3000', CAST(ROUND(b.gross_amount * 100 - (b.gross_amount - CASE WHEN p.vat_status = 'unregistered' OR (p.vat_scheme = 'flat_rate' AND b.vat_capital_asset = 0) THEN 0 ELSE b.vat_amount END) * b.business_percent - CASE WHEN p.vat_status = 'unregistered' OR (p.vat_scheme = 'flat_rate' AND b.vat_capital_asset = 0) THEN 0 ELSE b.vat_amount * b.business_percent END) AS INTEGER) FROM journal_entries j INNER JOIN supplier_bills b ON j.source_type = 'supplier_bill' AND j.source_id = b.id CROSS JOIN user_profile p WHERE p.id = 1 AND b.business_percent < 100",
        "INSERT INTO journal_lines (entry_id, account_code, credit) SELECT j.id, '2200', CAST(ROUND(b.gross_amount * 100) AS INTEGER) FROM journal_entries j INNER JOIN supplier_bills b ON j.source_type = 'supplier_bill' AND j.source_id = b.id",
        "INSERT INTO journal_entries (entry_date, description, source_type, source_id, tax_year) SELECT p.payment_date, 'Supplier bill payment', 'supplier_bill_payment', p.id, CASE WHEN strftime('%m-%d', p.payment_date) >= '04-06' THEN strftime('%Y', p.payment_date) || '/' || substr(CAST(CAST(strftime('%Y', p.payment_date) AS INTEGER) + 1 AS TEXT), 3, 2) ELSE CAST(CAST(strftime('%Y', p.payment_date) AS INTEGER) - 1 AS TEXT) || '/' || substr(strftime('%Y', p.payment_date), 3, 2) END FROM supplier_bill_payments p INNER JOIN supplier_bills b ON b.id = p.bill_id WHERE b.deleted_at IS NULL",
        "INSERT INTO journal_lines (entry_id, account_code, debit) SELECT j.id, '2200', CAST(ROUND(p.amount * 100) AS INTEGER) FROM journal_entries j INNER JOIN supplier_bill_payments p ON j.source_type = 'supplier_bill_payment' AND j.source_id = p.id",
        "INSERT INTO journal_lines (entry_id, account_code, credit) SELECT j.id, '1000', CAST(ROUND(p.amount * 100) AS INTEGER) FROM journal_entries j INNER JOIN supplier_bill_payments p ON j.source_type = 'supplier_bill_payment' AND j.source_id = p.id",
        "INSERT INTO journal_entries (entry_date, description, source_type, source_id, tax_year) SELECT a.adjustment_date, CASE WHEN a.adjustment_type = 'accrual' THEN 'Accrual: ' ELSE 'Prepayment: ' END || a.description, 'accrual_adjustment', a.id, a.tax_year FROM accrual_adjustments a WHERE a.deleted_at IS NULL",
        "INSERT INTO journal_lines (entry_id, account_code, debit) SELECT j.id, CASE WHEN a.adjustment_type = 'accrual' THEN '5000' ELSE '1300' END, CAST(ROUND(a.amount * 100) AS INTEGER) FROM journal_entries j INNER JOIN accrual_adjustments a ON j.source_type = 'accrual_adjustment' AND j.source_id = a.id",
        "INSERT INTO journal_lines (entry_id, account_code, credit) SELECT j.id, CASE WHEN a.adjustment_type = 'accrual' THEN '2300' ELSE '5000' END, CAST(ROUND(a.amount * 100) AS INTEGER) FROM journal_entries j INNER JOIN accrual_adjustments a ON j.source_type = 'accrual_adjustment' AND j.source_id = a.id",
        "INSERT INTO journal_entries (entry_date, description, source_type, source_id, tax_year) SELECT a.reversal_date, 'Reversal: ' || a.description, 'accrual_reversal', a.id, CASE WHEN strftime('%m-%d', a.reversal_date) >= '04-06' THEN strftime('%Y', a.reversal_date) || '/' || substr(CAST(CAST(strftime('%Y', a.reversal_date) AS INTEGER) + 1 AS TEXT), 3, 2) ELSE CAST(CAST(strftime('%Y', a.reversal_date) AS INTEGER) - 1 AS TEXT) || '/' || substr(strftime('%Y', a.reversal_date), 3, 2) END FROM accrual_adjustments a WHERE a.deleted_at IS NULL",
        "INSERT INTO journal_lines (entry_id, account_code, debit) SELECT j.id, CASE WHEN a.adjustment_type = 'accrual' THEN '2300' ELSE '5000' END, CAST(ROUND(a.amount * 100) AS INTEGER) FROM journal_entries j INNER JOIN accrual_adjustments a ON j.source_type = 'accrual_reversal' AND j.source_id = a.id",
        "INSERT INTO journal_lines (entry_id, account_code, credit) SELECT j.id, CASE WHEN a.adjustment_type = 'accrual' THEN '5000' ELSE '1300' END, CAST(ROUND(a.amount * 100) AS INTEGER) FROM journal_entries j INNER JOIN accrual_adjustments a ON j.source_type = 'accrual_reversal' AND j.source_id = a.id",
    ] {
        sqlx::query(statement)
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
    }

    let (entries, lines, debit_pence, credit_pence) = sqlx::query_as::<_, (i64, i64, i64, i64)>(
        "SELECT (SELECT COUNT(*) FROM journal_entries), COUNT(*), COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0) FROM journal_lines",
    )
    .fetch_one(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;
    if debit_pence != credit_pence {
        return Err(format!(
            "Shadow ledger is out of balance by {} pence.",
            debit_pence - credit_pence
        ));
    }
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(LedgerSummary {
        entries,
        lines,
        debit_pence,
        credit_pence,
        balanced: true,
    })
}

#[tauri::command]
pub async fn rebuild_shadow_ledger(
    app: AppHandle,
    input: LedgerRebuildInput,
) -> Result<LedgerSummary, String> {
    rebuild_at(&workspace_database_path(&app, &input.workspace_id)?).await
}

async fn close_year_at(
    path: &std::path::Path,
    tax_year: &str,
) -> Result<YearEndCloseResult, String> {
    let ledger = rebuild_at(path).await?;
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(path)
                .foreign_keys(true),
        )
        .await
        .map_err(|error| error.to_string())?;
    let (year_start, year_end) = sqlx::query_as::<_, (String, String)>(
        "SELECT year_start, year_end FROM tax_year_config WHERE tax_year = ?",
    )
    .bind(tax_year)
    .fetch_optional(&pool)
    .await
    .map_err(|error| error.to_string())?
    .ok_or("Tax year configuration was not found.")?;
    if year_end >= chrono::Utc::now().date_naive().to_string() {
        pool.close().await;
        return Err("A tax year can be closed only after its final day.".into());
    }
    let unmatched: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM bank_transactions WHERE status = 'unmatched' AND transaction_date BETWEEN ? AND ?",
    )
    .bind(&year_start)
    .bind(&year_end)
    .fetch_one(&pool)
    .await
    .map_err(|error| error.to_string())?;
    let missing_receipts: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM expenses WHERE deleted_at IS NULL AND is_bad_debt = 0 AND COALESCE(receipt_path, '') = '' AND date BETWEEN ? AND ?",
    )
    .bind(&year_start)
    .bind(&year_end)
    .fetch_one(&pool)
    .await
    .map_err(|error| error.to_string())?;
    if unmatched > 0 || missing_receipts > 0 {
        pool.close().await;
        return Err(format!(
            "Resolve {unmatched} unmatched bank transaction(s) and {missing_receipts} missing receipt(s) before closing the year."
        ));
    }
    let (creditor_pence, accrued_expense_pence, prepayment_pence) =
        sqlx::query_as::<_, (i64, i64, i64)>(
            "SELECT
              COALESCE(SUM(CASE WHEN l.account_code = '2200' THEN l.credit - l.debit ELSE 0 END), 0),
              COALESCE(SUM(CASE WHEN l.account_code = '2300' THEN l.credit - l.debit ELSE 0 END), 0),
              COALESCE(SUM(CASE WHEN l.account_code = '1300' THEN l.debit - l.credit ELSE 0 END), 0)
             FROM journal_lines l INNER JOIN journal_entries j ON j.id = l.entry_id
             WHERE j.entry_date <= ?",
        )
        .bind(&year_end)
        .fetch_one(&pool)
        .await
        .map_err(|error| error.to_string())?;
    let closed_at: String = sqlx::query_scalar("SELECT datetime('now')")
        .fetch_one(&pool)
        .await
        .map_err(|error| error.to_string())?;
    let checklist = serde_json::json!({
        "unmatchedBankTransactions": unmatched,
        "missingReceipts": missing_receipts,
        "ledgerBalanced": ledger.balanced,
    });
    let snapshot = serde_json::json!({
        "ledger": &ledger,
        "creditorPence": creditor_pence,
        "accruedExpensePence": accrued_expense_pence,
        "prepaymentPence": prepayment_pence,
    });
    sqlx::query("INSERT INTO year_end_closes (tax_year, status, checklist_json, snapshot_json, closed_at) VALUES (?, 'closed', ?, ?, ?) ON CONFLICT(tax_year) DO UPDATE SET status = 'closed', checklist_json = excluded.checklist_json, snapshot_json = excluded.snapshot_json, closed_at = excluded.closed_at, updated_at = datetime('now')")
        .bind(tax_year)
        .bind(checklist.to_string())
        .bind(snapshot.to_string())
        .bind(&closed_at)
        .execute(&pool)
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(YearEndCloseResult {
        tax_year: tax_year.into(),
        closed_at,
        ledger,
    })
}

#[tauri::command]
pub async fn close_year_end(
    app: AppHandle,
    input: YearEndInput,
) -> Result<YearEndCloseResult, String> {
    close_year_at(
        &workspace_database_path(&app, &input.workspace_id)?,
        &input.tax_year,
    )
    .await
}

#[tauri::command]
pub async fn reopen_year_end(app: AppHandle, input: YearEndInput) -> Result<(), String> {
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
    let changed = sqlx::query("UPDATE year_end_closes SET status = 'open', closed_at = NULL, updated_at = datetime('now') WHERE tax_year = ? AND status = 'closed'")
        .bind(&input.tax_year)
        .execute(&pool)
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    if changed.rows_affected() != 1 {
        return Err("The tax year is not closed.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspaces::initialise_database;
    use uuid::Uuid;

    #[tokio::test]
    async fn rebuilds_a_balanced_ledger_for_vat_cis_and_cash_activity() {
        let directory =
            std::env::temp_dir().join(format!("soletrader-ledger-{}", Uuid::new_v4().simple()));
        std::fs::create_dir_all(&directory).unwrap();
        let database = directory.join("ledger.db");
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
        sqlx::query("UPDATE user_profile SET vat_status = 'voluntary', vat_scheme = 'flat_rate' WHERE id = 1")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO clients (id, name) VALUES (1, 'Golden client')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO invoices (id, client_id, invoice_number, status, issue_date, due_date, subtotal, vat_amount, total, tax_year) VALUES (1, 1, 'INV-GOLD', 'sent', '2026-06-01', '2026-06-30', 100, 20, 120, '2026/27')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO invoice_payments (invoice_id, amount, payment_date) VALUES (1, 120, '2026-06-15')")
            .execute(&pool).await.unwrap();
        let category: i64 =
            sqlx::query_scalar("SELECT id FROM expense_categories ORDER BY id LIMIT 1")
                .fetch_one(&pool)
                .await
                .unwrap();
        sqlx::query("INSERT INTO expenses (category_id, date, description, amount, vat_amount, business_percent, tax_year) VALUES (?, '2026-06-02', 'Flat-rate supplies', 120, 20, 100, '2026/27')")
            .bind(category).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO direct_income (income_date, description, income_type, amount, gross_amount, cis_rate, cis_deduction_amount, vat_amount, tax_year) VALUES ('2026-06-03', 'CIS work', 'other_business_income', 80, 100, 20, 20, 0, '2026/27')")
            .execute(&pool).await.unwrap();
        pool.close().await;

        let summary = rebuild_at(&database).await.unwrap();

        assert!(summary.balanced);
        assert_eq!(summary.entries, 4);
        assert_eq!(summary.debit_pence, 46_000);
        assert_eq!(summary.credit_pence, 46_000);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(SqliteConnectOptions::new().filename(&database))
            .await
            .unwrap();
        let flat_rate_expense: i64 = sqlx::query_scalar("SELECT debit FROM journal_lines l INNER JOIN journal_entries e ON e.id = l.entry_id WHERE e.source_type = 'expense' AND l.account_code = '5000'")
            .fetch_one(&pool).await.unwrap();
        let cis_suffered: i64 = sqlx::query_scalar("SELECT debit FROM journal_lines l INNER JOIN journal_entries e ON e.id = l.entry_id WHERE e.source_type = 'direct_income' AND l.account_code = '2100'")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(flat_rate_expense, 12_000);
        assert_eq!(cis_suffered, 2_000);
        pool.close().await;
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn posts_personal_account_activity_through_owner_capital() {
        let directory = std::env::temp_dir().join(format!(
            "soletrader-personal-expense-{}",
            Uuid::new_v4().simple()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        let database = directory.join("ledger.db");
        initialise_database(&database).await.unwrap();
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(SqliteConnectOptions::new().filename(&database))
            .await
            .unwrap();
        let category: i64 =
            sqlx::query_scalar("SELECT id FROM expense_categories ORDER BY id LIMIT 1")
                .fetch_one(&pool)
                .await
                .unwrap();
        sqlx::query("INSERT INTO expenses (category_id, date, description, amount, business_percent, paid_personally, tax_year) VALUES (?, '2026-08-30', 'Business cost paid personally', 50, 100, 1, '2026/27')")
            .bind(category)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("UPDATE bank_accounts SET account_use = 'personal' WHERE id = 1")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO direct_income (id, income_date, description, income_type, amount, gross_amount, tax_year) VALUES (1, '2026-08-30', 'Job paid personally', 'sale', 100, 100, '2026/27')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO bank_transactions (id, transaction_date, description, amount_in, status, classification, matched_income_id, bank_account_id) VALUES (1, '2026-08-30', 'Job receipt', 100, 'matched', 'direct_income', 1, 1)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("UPDATE direct_income SET bank_transaction_id = 1 WHERE id = 1")
            .execute(&pool)
            .await
            .unwrap();
        pool.close().await;

        let summary = rebuild_at(&database).await.unwrap();
        assert!(summary.balanced);

        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(SqliteConnectOptions::new().filename(&database))
            .await
            .unwrap();
        let owner_capital: i64 = sqlx::query_scalar("SELECT l.credit FROM journal_lines l INNER JOIN journal_entries j ON j.id = l.entry_id WHERE j.source_type = 'expense' AND l.account_code = '3000'")
            .fetch_one(&pool)
            .await
            .unwrap();
        let business_cash_lines: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM journal_lines l INNER JOIN journal_entries j ON j.id = l.entry_id WHERE j.source_type = 'expense' AND l.account_code = '1000'")
            .fetch_one(&pool)
            .await
            .unwrap();
        let personal_income_receipt: i64 = sqlx::query_scalar("SELECT l.debit FROM journal_lines l INNER JOIN journal_entries j ON j.id = l.entry_id WHERE j.source_type = 'direct_income' AND l.account_code = '3000'")
            .fetch_one(&pool)
            .await
            .unwrap();
        let income_cash_lines: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM journal_lines l INNER JOIN journal_entries j ON j.id = l.entry_id WHERE j.source_type = 'direct_income' AND l.account_code = '1000'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(owner_capital, 5_000);
        assert_eq!(business_cash_lines, 0);
        assert_eq!(personal_income_receipt, 10_000);
        assert_eq!(income_cash_lines, 0);
        pool.close().await;
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn posts_creditors_accruals_prepayments_and_reversals() {
        let directory = std::env::temp_dir().join(format!(
            "soletrader-accrual-ledger-{}",
            Uuid::new_v4().simple()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        let database = directory.join("ledger.db");
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
        sqlx::query("INSERT INTO supplier_bills (id, category_id, supplier, reference, bill_date, due_date, gross_amount, vat_amount, business_percent, tax_year) VALUES (1, ?, 'Supplier Ltd', 'B-1', '2026-03-01', '2026-03-31', 120, 20, 50, '2025/26')")
            .bind(category).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO supplier_bill_payments (bill_id, payment_date, amount) VALUES (1, '2026-03-20', 50)")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO accrual_adjustments (tax_year, category_id, adjustment_type, description, amount, adjustment_date, reversal_date) VALUES ('2025/26', ?, 'accrual', 'Unbilled electricity', 300, '2026-04-05', '2026-04-06')")
            .bind(category).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO accrual_adjustments (tax_year, category_id, adjustment_type, description, amount, adjustment_date, reversal_date) VALUES ('2025/26', ?, 'prepayment', 'Annual insurance', 100, '2026-04-05', '2026-04-06')")
            .bind(category).execute(&pool).await.unwrap();
        pool.close().await;

        let summary = rebuild_at(&database).await.unwrap();
        assert!(summary.balanced);
        assert_eq!(summary.entries, 6);

        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(SqliteConnectOptions::new().filename(&database))
            .await
            .unwrap();
        let creditor_balance: i64 = sqlx::query_scalar(
            "SELECT SUM(credit - debit) FROM journal_lines WHERE account_code = '2200'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        let current_accrual: i64 = sqlx::query_scalar("SELECT SUM(l.credit - l.debit) FROM journal_lines l INNER JOIN journal_entries j ON j.id = l.entry_id WHERE l.account_code = '2300' AND j.tax_year = '2025/26'")
            .fetch_one(&pool).await.unwrap();
        let current_prepayment: i64 = sqlx::query_scalar("SELECT SUM(l.debit - l.credit) FROM journal_lines l INNER JOIN journal_entries j ON j.id = l.entry_id WHERE l.account_code = '1300' AND j.tax_year = '2025/26'")
            .fetch_one(&pool).await.unwrap();
        let private_use: i64 = sqlx::query_scalar("SELECT SUM(l.debit) FROM journal_lines l INNER JOIN journal_entries j ON j.id = l.entry_id WHERE l.account_code = '3000' AND j.source_type = 'supplier_bill'")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(creditor_balance, 7_000);
        assert_eq!(current_accrual, 30_000);
        assert_eq!(current_prepayment, 10_000);
        assert_eq!(private_use, 6_000);
        pool.close().await;
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn closes_and_reopens_a_completed_tax_year() {
        let directory =
            std::env::temp_dir().join(format!("soletrader-year-close-{}", Uuid::new_v4().simple()));
        std::fs::create_dir_all(&directory).unwrap();
        let database = directory.join("year-close.db");
        initialise_database(&database).await.unwrap();

        let setup_pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(SqliteConnectOptions::new().filename(&database))
            .await
            .unwrap();
        let category: i64 =
            sqlx::query_scalar("SELECT id FROM expense_categories ORDER BY id LIMIT 1")
                .fetch_one(&setup_pool)
                .await
                .unwrap();
        sqlx::query("INSERT INTO supplier_bills (category_id, supplier, bill_date, due_date, gross_amount, tax_year) VALUES (?, 'Year end supplier', '2026-03-01', '2026-03-31', 120, '2025/26')")
            .bind(category).execute(&setup_pool).await.unwrap();
        sqlx::query("INSERT INTO accrual_adjustments (tax_year, category_id, adjustment_type, description, amount, adjustment_date, reversal_date) VALUES ('2025/26', ?, 'accrual', 'Year end accrual', 30, '2026-04-05', '2026-04-06')")
            .bind(category).execute(&setup_pool).await.unwrap();
        setup_pool.close().await;

        let closed = close_year_at(&database, "2025/26").await.unwrap();
        assert_eq!(closed.tax_year, "2025/26");
        assert!(closed.ledger.balanced);

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
        let snapshot: String = sqlx::query_scalar(
            "SELECT snapshot_json FROM year_end_closes WHERE tax_year = '2025/26'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        let snapshot: serde_json::Value = serde_json::from_str(&snapshot).unwrap();
        assert_eq!(snapshot["creditorPence"], 12_000);
        assert_eq!(snapshot["accruedExpensePence"], 3_000);
        assert_eq!(snapshot["prepaymentPence"], 0);
        let locked = sqlx::query("INSERT INTO expenses (category_id, date, description, amount, tax_year) VALUES (?, '2025-07-01', 'Late cost', 10, '2025/26')")
            .bind(category).execute(&pool).await.unwrap_err();
        assert!(locked.to_string().contains("tax year is closed"));
        sqlx::query("UPDATE year_end_closes SET status = 'open', closed_at = NULL WHERE tax_year = '2025/26'")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO expenses (category_id, date, description, amount, tax_year) VALUES (?, '2025-07-01', 'Late cost', 10, '2025/26')")
            .bind(category).execute(&pool).await.unwrap();
        pool.close().await;
        std::fs::remove_dir_all(directory).unwrap();
    }
}
