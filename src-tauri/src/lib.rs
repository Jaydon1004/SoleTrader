use tauri_plugin_sql::{Migration, MigrationKind};

mod bank_import;
mod diagnostics;
mod expenses;
mod invoices;
mod ledger;
mod migration_import;
mod mobile_upload;
mod transactions;
mod vehicles;
mod workspaces;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: include_str!("../migrations/001_initial_schema.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_invoice_workflow_fields",
            sql: include_str!("../migrations/002_invoice_workflow.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_expense_workflow_fields",
            sql: include_str!("../migrations/003_expense_workflow.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_vehicle_workflow_fields",
            sql: include_str!("../migrations/004_vehicle_workflow.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_tax_calculator_inputs",
            sql: include_str!("../migrations/005_tax_calculator.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add_vat_management",
            sql: include_str!("../migrations/006_vat_management.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "add_advanced_tax",
            sql: include_str!("../migrations/007_advanced_tax.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "add_document_library",
            sql: include_str!("../migrations/008_document_library.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "link_vehicle_cost_documents",
            sql: include_str!("../migrations/009_vehicle_cost_documents.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "add_bank_reconciliation",
            sql: include_str!("../migrations/010_bank_reconciliation.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "add_reminder_alert_state",
            sql: include_str!("../migrations/011_reminder_alerts.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "add_power_feature_audit_and_indexes",
            sql: include_str!("../migrations/012_power_features.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "correct_bad_debt_records",
            sql: include_str!("../migrations/013_correct_bad_debt_records.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "add_vat_return_snapshots",
            sql: include_str!("../migrations/014_vat_return_snapshots.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "add_filed_period_locks",
            sql: include_str!("../migrations/015_filed_period_locks.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "add_financial_constraints",
            sql: include_str!("../migrations/016_financial_constraints.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 17,
            description: "add_2026_tax_year",
            sql: include_str!("../migrations/017_tax_year_2026.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 18,
            description: "add_self_billing_foundation",
            sql: include_str!("../migrations/018_self_billing_foundation.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 19,
            description: "expand_audit_trail",
            sql: include_str!("../migrations/019_expanded_audit_trail.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 20,
            description: "harden_financial_integrity",
            sql: include_str!("../migrations/020_integrity_hardening.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 21,
            description: "add_direct_income",
            sql: include_str!("../migrations/021_direct_income.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 22,
            description: "add_accounts_and_bank_classification",
            sql: include_str!("../migrations/022_accounts_and_bank_classification.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 23,
            description: "add_bank_rules_transfers_and_splits",
            sql: include_str!("../migrations/023_bank_rules_transfers_splits.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 24,
            description: "add_direct_income_cis",
            sql: include_str!("../migrations/024_direct_income_cis.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 25,
            description: "index_direct_income_clients",
            sql: include_str!("../migrations/025_direct_income_editing.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 26,
            description: "add_trust_foundations",
            sql: include_str!("../migrations/026_trust_foundations.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 27,
            description: "add_accountant_handoff",
            sql: include_str!("../migrations/027_accountant_handoff.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 28,
            description: "add_accrual_accounting",
            sql: include_str!("../migrations/028_accrual_accounting.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 29,
            description: "add_bank_auto_classification",
            sql: include_str!("../migrations/029_bank_auto_classification.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 30,
            description: "add_bank_account_use",
            sql: include_str!("../migrations/030_bank_account_use.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 31,
            description: "add_bank_rule_scope",
            sql: include_str!("../migrations/031_bank_rule_scope.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 32,
            description: "add_personally_funded_expenses",
            sql: include_str!("../migrations/032_personally_funded_expenses.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 33,
            description: "protect_bank_linked_records",
            sql: include_str!("../migrations/033_protect_bank_linked_records.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 34,
            description: "add_hmrc_handoff_details",
            sql: include_str!("../migrations/034_hmrc_handoff.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 35,
            description: "add_hmrc_opening_stock",
            sql: include_str!("../migrations/035_hmrc_opening_stock.sql"),
            kind: MigrationKind::Up,
        },
    ];

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_, _, _| {}))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init());

    if option_env!("SOLETRADER_UPDATER_CONFIGURED") == Some("true") {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            workspaces::list_business_workspaces,
            workspaces::prepare_business_workspace,
            workspaces::create_business_workspace,
            workspaces::set_business_archived,
            workspaces::audit_business_files,
            workspaces::write_workspace_file,
            workspaces::read_workspace_file,
            workspaces::delete_workspace_file,
            workspaces::backup_business_workspace,
            workspaces::restore_business_workspace,
            diagnostics::log_frontend_error,
            diagnostics::export_diagnostics,
            transactions::create_expense_from_bank,
            transactions::link_existing_bank_record,
            transactions::unmatch_bank_transaction,
            transactions::create_direct_income,
            transactions::update_direct_income,
            transactions::create_direct_income_from_bank,
            transactions::classify_bank_transaction,
            transactions::bulk_classify_bank_transactions,
            transactions::link_bank_transfer,
            transactions::split_bank_transaction,
            transactions::execute_allowed_statement,
            transactions::record_invoice_payment_from_bank,
            transactions::link_document_expense,
            transactions::create_expense_from_document,
            transactions::save_reminder_preferences,
            transactions::restore_recycle_items,
            invoices::create_invoice,
            invoices::create_self_billed_invoice,
            invoices::update_invoice,
            invoices::record_invoice_payment,
            invoices::record_self_billed_settlement,
            invoices::create_credit_note,
            invoices::convert_quote,
            invoices::process_recurring_invoices,
            invoices::write_off_bad_debt,
            ledger::rebuild_shadow_ledger,
            ledger::close_year_end,
            ledger::reopen_year_end,
            expenses::create_expense,
            expenses::update_expense,
            expenses::process_recurring_expenses,
            expenses::bulk_delete_expenses,
            expenses::bulk_categorise_expenses,
            expenses::reorder_expense_categories,
            vehicles::save_vehicle_cost,
            vehicles::update_vehicle,
            vehicles::save_mileage,
            vehicles::delete_mileage,
            vehicles::recalculate_mileage,
            migration_import::import_migration_rows,
            mobile_upload::start_mobile_receipt_upload,
            mobile_upload::poll_mobile_receipt_upload,
            mobile_upload::stop_mobile_receipt_upload,
            bank_import::import_bank_transactions,
        ])
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:soletrader.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
