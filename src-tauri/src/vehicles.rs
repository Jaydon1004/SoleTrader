use serde::Deserialize;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    FromRow, Sqlite, Transaction,
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
pub struct VehicleCostInput {
    workspace_id: String,
    id: Option<i64>,
    vehicle_id: i64,
    date: String,
    cost_type: String,
    description: String,
    amount: f64,
    vat_amount: f64,
    vat_capital_asset: bool,
    receipt_path: String,
    receipt_file: Option<StoredReceiptInput>,
    notes: String,
}

#[derive(Deserialize)]
pub struct UpdateVehicleInput {
    workspace_id: String,
    id: i64,
    name: String,
    make: String,
    model: String,
    registration: String,
    vehicle_type: String,
    cost_method: String,
    business_percent: f64,
}

#[derive(Deserialize)]
pub struct MileageInput {
    workspace_id: String,
    id: Option<i64>,
    vehicle_id: i64,
    date: String,
    start_location: String,
    end_location: String,
    purpose: String,
    distance_miles: f64,
    passengers: i64,
    notes: String,
}

#[derive(Deserialize)]
pub struct DeleteMileageInput {
    workspace_id: String,
    id: i64,
}

#[derive(Deserialize)]
pub struct RecalculateMileageInput {
    workspace_id: String,
    tax_year: String,
}

#[derive(FromRow)]
struct MileageRateConfig {
    mileage_car_first_tier_rate: f64,
    mileage_car_first_tier_limit: f64,
    mileage_car_second_tier_rate: f64,
    mileage_motorcycle_rate: f64,
    mileage_bicycle_rate: f64,
    mileage_passenger_rate: f64,
}

#[derive(FromRow)]
struct MileageCalculationRow {
    id: i64,
    distance_miles: f64,
    passengers: i64,
    vehicle_type: String,
    cost_method: String,
}

pub(crate) async fn recalculate_mileage_tax_year(
    transaction: &mut Transaction<'_, Sqlite>,
    tax_year: &str,
) -> Result<(), String> {
    let config = sqlx::query_as::<_, MileageRateConfig>("SELECT mileage_car_first_tier_rate, mileage_car_first_tier_limit, mileage_car_second_tier_rate, mileage_motorcycle_rate, mileage_bicycle_rate, mileage_passenger_rate FROM tax_year_config WHERE tax_year = ?")
        .bind(tax_year).fetch_optional(&mut **transaction).await.map_err(|error| error.to_string())?.ok_or_else(|| format!("Tax rates are not configured for {tax_year}."))?;
    let logs = sqlx::query_as::<_, MileageCalculationRow>("SELECT m.id, m.distance_miles, m.passengers, v.vehicle_type, v.cost_method FROM mileage_logs m INNER JOIN vehicles v ON v.id = m.vehicle_id WHERE m.tax_year = ? AND m.deleted_at IS NULL ORDER BY m.date, m.created_at, m.id")
        .bind(tax_year).fetch_all(&mut **transaction).await.map_err(|error| error.to_string())?;
    let mut car_van_miles: f64 = 0.0;
    for log in logs {
        if log.cost_method != "mileage" {
            continue;
        }
        let base_allowance = match log.vehicle_type.as_str() {
            "car" | "van" => {
                let first_remaining =
                    (config.mileage_car_first_tier_limit - car_van_miles).max(0.0);
                let first_miles = log.distance_miles.min(first_remaining);
                car_van_miles += log.distance_miles;
                first_miles * config.mileage_car_first_tier_rate
                    + (log.distance_miles - first_miles) * config.mileage_car_second_tier_rate
            }
            "motorcycle" => log.distance_miles * config.mileage_motorcycle_rate,
            "bicycle" => log.distance_miles * config.mileage_bicycle_rate,
            _ => return Err("Vehicle type is invalid.".into()),
        };
        let passenger_allowance = if matches!(log.vehicle_type.as_str(), "car" | "van") {
            log.distance_miles * log.passengers as f64 * config.mileage_passenger_rate
        } else {
            0.0
        };
        let rate = if log.distance_miles > 0.0 {
            (base_allowance / log.distance_miles * 10_000.0).round() / 10_000.0
        } else {
            0.0
        };
        let amount = ((base_allowance + passenger_allowance) * 100.0).round() / 100.0;
        sqlx::query("UPDATE mileage_logs SET rate_applied = ?, amount = ? WHERE id = ?")
            .bind(rate)
            .bind(amount)
            .bind(log.id)
            .execute(&mut **transaction)
            .await
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn recalculate_mileage(
    app: AppHandle,
    input: RecalculateMileageInput,
) -> Result<(), String> {
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
    recalculate_mileage_tax_year(&mut transaction, &input.tax_year).await?;
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(())
}

fn validate(input: &VehicleCostInput) -> Result<String, String> {
    if !input.amount.is_finite()
        || input.amount <= 0.0
        || !input.vat_amount.is_finite()
        || input.vat_amount < 0.0
        || input.vat_amount > input.amount
    {
        return Err("Vehicle cost amount and VAT values are invalid.".into());
    }
    if !matches!(
        input.cost_type.as_str(),
        "fuel" | "insurance" | "mot" | "servicing" | "repairs" | "road_tax" | "other"
    ) {
        return Err("Vehicle cost type is invalid.".into());
    }
    tax_year_for_date(&input.date)
}

#[tauri::command]
pub async fn save_vehicle_cost(app: AppHandle, input: VehicleCostInput) -> Result<i64, String> {
    let tax_year = validate(&input)?;
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
    let business_percent = sqlx::query_scalar::<_, f64>("SELECT business_percent FROM vehicles WHERE id = ? AND cost_method = 'actual' AND archived = 0")
        .bind(input.vehicle_id).fetch_optional(&mut *transaction).await.map_err(|error| error.to_string())?.ok_or("Costs can only be logged for active vehicles using the actual-cost method.")?;
    let previous_path = if let Some(id) = input.id {
        sqlx::query_scalar::<_, String>(
            "SELECT receipt_path FROM vehicle_costs WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?
        .ok_or("Vehicle cost was not found.")?
    } else {
        String::new()
    };
    let cost_id = if let Some(id) = input.id {
        let updated = sqlx::query("UPDATE vehicle_costs SET vehicle_id = ?, date = ?, cost_type = ?, description = ?, amount = ?, vat_amount = ?, vat_capital_asset = ?, receipt_path = ?, business_percent = ?, notes = ?, tax_year = ? WHERE id = ? AND deleted_at IS NULL")
            .bind(input.vehicle_id).bind(&input.date).bind(&input.cost_type).bind(input.description.trim()).bind(input.amount).bind(input.vat_amount).bind(input.vat_capital_asset)
            .bind(&input.receipt_path).bind(business_percent).bind(&input.notes).bind(&tax_year).bind(id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
        if updated.rows_affected() != 1 {
            return Err("Vehicle cost changed before it could be saved.".into());
        }
        id
    } else {
        sqlx::query("INSERT INTO vehicle_costs (vehicle_id, date, cost_type, description, amount, vat_amount, vat_capital_asset, receipt_path, business_percent, notes, tax_year) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(input.vehicle_id).bind(&input.date).bind(&input.cost_type).bind(input.description.trim()).bind(input.amount).bind(input.vat_amount).bind(input.vat_capital_asset)
            .bind(&input.receipt_path).bind(business_percent).bind(&input.notes).bind(&tax_year).execute(&mut *transaction).await.map_err(|error| error.to_string())?.last_insert_rowid()
    };
    if !previous_path.is_empty() && previous_path != input.receipt_path {
        sqlx::query("UPDATE documents SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE linked_vehicle_cost_id = ? AND deleted_at IS NULL")
            .bind(cost_id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    }
    if let Some(receipt) = &input.receipt_file {
        if receipt.path != previous_path {
            sqlx::query("INSERT INTO documents (file_name, file_path, file_type, file_size, category, linked_vehicle_cost_id, tax_year, document_date, updated_at) VALUES (?, ?, ?, ?, 'receipt', ?, ?, ?, datetime('now'))")
                .bind(&receipt.file_name).bind(&receipt.path).bind(&receipt.file_type).bind(receipt.file_size).bind(cost_id).bind(&tax_year).bind(&input.date)
                .execute(&mut *transaction).await.map_err(|error| error.to_string())?;
        }
    }
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(cost_id)
}

#[tauri::command]
pub async fn update_vehicle(app: AppHandle, input: UpdateVehicleInput) -> Result<(), String> {
    if input.name.trim().is_empty()
        || !matches!(
            input.vehicle_type.as_str(),
            "car" | "van" | "motorcycle" | "bicycle"
        )
        || !matches!(input.cost_method.as_str(), "mileage" | "actual")
    {
        return Err("Vehicle details are invalid.".into());
    }
    if !input.business_percent.is_finite() || !(0.0..=100.0).contains(&input.business_percent) {
        return Err("Business use must be between 0 and 100%.".into());
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
    let current = sqlx::query_as::<_, (String, String)>(
        "SELECT vehicle_type, cost_method FROM vehicles WHERE id = ?",
    )
    .bind(input.id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?
    .ok_or("Vehicle was not found.")?;
    let activity = sqlx::query_scalar::<_, i64>("SELECT (SELECT COUNT(*) FROM mileage_logs WHERE vehicle_id = ? AND deleted_at IS NULL) + (SELECT COUNT(*) FROM vehicle_costs WHERE vehicle_id = ? AND deleted_at IS NULL)")
        .bind(input.id).bind(input.id).fetch_one(&mut *transaction).await.map_err(|error| error.to_string())?;
    if activity > 0 && (current.0 != input.vehicle_type || current.1 != input.cost_method) {
        return Err("Vehicle type and deduction method cannot change after mileage or costs have been recorded.".into());
    }
    sqlx::query("UPDATE vehicles SET name = ?, make = ?, model = ?, registration = ?, vehicle_type = ?, cost_method = ?, business_percent = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(input.name.trim()).bind(input.make.trim()).bind(input.model.trim()).bind(input.registration.trim().to_uppercase()).bind(input.vehicle_type).bind(&input.cost_method)
        .bind(if input.cost_method == "actual" { input.business_percent } else { 100.0 }).bind(input.id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(())
}

#[tauri::command]
pub async fn save_mileage(app: AppHandle, input: MileageInput) -> Result<i64, String> {
    if !input.distance_miles.is_finite() || input.distance_miles <= 0.0 || input.passengers < 0 {
        return Err("Mileage distance and passengers are invalid.".into());
    }
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
    let mileage_vehicle = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM vehicles WHERE id = ? AND cost_method = 'mileage' AND archived = 0)").bind(input.vehicle_id)
        .fetch_one(&mut *transaction).await.map_err(|error| error.to_string())?;
    if !mileage_vehicle {
        return Err(
            "Mileage can only be logged for active vehicles using the mileage method.".into(),
        );
    }
    let old_tax_year = if let Some(id) = input.id {
        Some(
            sqlx::query_scalar::<_, String>(
                "SELECT tax_year FROM mileage_logs WHERE id = ? AND deleted_at IS NULL",
            )
            .bind(id)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?
            .ok_or("Mileage log was not found.")?,
        )
    } else {
        None
    };
    let id = if let Some(id) = input.id {
        sqlx::query("UPDATE mileage_logs SET vehicle_id = ?, date = ?, start_location = ?, end_location = ?, purpose = ?, distance_miles = ?, passengers = ?, notes = ?, tax_year = ? WHERE id = ? AND deleted_at IS NULL")
            .bind(input.vehicle_id).bind(&input.date).bind(&input.start_location).bind(&input.end_location).bind(&input.purpose).bind(input.distance_miles).bind(input.passengers).bind(&input.notes).bind(&tax_year).bind(id)
            .execute(&mut *transaction).await.map_err(|error| error.to_string())?;
        id
    } else {
        sqlx::query("INSERT INTO mileage_logs (vehicle_id, date, start_location, end_location, purpose, distance_miles, passengers, rate_applied, amount, notes, tax_year) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)")
            .bind(input.vehicle_id).bind(&input.date).bind(&input.start_location).bind(&input.end_location).bind(&input.purpose).bind(input.distance_miles).bind(input.passengers).bind(&input.notes).bind(&tax_year)
            .execute(&mut *transaction).await.map_err(|error| error.to_string())?.last_insert_rowid()
    };
    if old_tax_year.as_deref().is_some_and(|old| old != tax_year) {
        recalculate_mileage_tax_year(&mut transaction, old_tax_year.as_deref().unwrap()).await?;
    }
    recalculate_mileage_tax_year(&mut transaction, &tax_year).await?;
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(id)
}

#[tauri::command]
pub async fn delete_mileage(app: AppHandle, input: DeleteMileageInput) -> Result<(), String> {
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
    let tax_year = sqlx::query_scalar::<_, String>(
        "SELECT tax_year FROM mileage_logs WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(input.id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?
    .ok_or("Mileage log was not found.")?;
    sqlx::query("UPDATE mileage_logs SET deleted_at = datetime('now') WHERE id = ?")
        .bind(input.id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
    recalculate_mileage_tax_year(&mut transaction, &tax_year).await?;
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(())
}
