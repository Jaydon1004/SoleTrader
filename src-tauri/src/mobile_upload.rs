use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, OnceLock,
    },
    time::Duration,
};

use axum::{
    extract::{DefaultBodyLimit, Multipart, Path, State},
    http::StatusCode,
    response::{Html, IntoResponse},
    routing::get,
    Router,
};
use serde::Serialize;
use tauri::AppHandle;
use tokio::sync::{oneshot, Mutex};
use uuid::Uuid;

use crate::workspaces::workspace_database_path;

const MAX_UPLOAD_BYTES: usize = 25 * 1024 * 1024;
const SESSION_SECONDS: u64 = 10 * 60;
static ACTIVE_UPLOAD: OnceLock<Mutex<Option<ActiveUpload>>> = OnceLock::new();
static UPLOAD_OPERATION_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileReceipt {
    path: String,
    file_name: String,
    file_type: String,
    file_size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileUploadSession {
    url: String,
    expires_in_seconds: u64,
}

struct ActiveUpload {
    cancel: Option<oneshot::Sender<()>>,
    receipt: Arc<Mutex<Option<MobileReceipt>>>,
    workspace_directory: PathBuf,
}

#[derive(Clone)]
struct UploadState {
    token: String,
    receipt: Arc<Mutex<Option<MobileReceipt>>>,
    receipts_directory: PathBuf,
    accepted: Arc<AtomicBool>,
}

fn upload_page() -> Html<&'static str> {
    Html(include_str!("../mobile-upload.html"))
}

fn detected_type(bytes: &[u8]) -> Option<(&'static str, &'static str)> {
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some(("jpg", "image/jpeg"));
    }
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        return Some(("png", "image/png"));
    }
    if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some(("webp", "image/webp"));
    }
    if bytes.len() >= 12
        && &bytes[4..8] == b"ftyp"
        && matches!(
            &bytes[8..12],
            b"heic" | b"heix" | b"hevc" | b"hevx" | b"mif1" | b"msf1"
        )
    {
        return Some(("heic", "image/heic"));
    }
    None
}

async fn show_upload(
    Path(token): Path<String>,
    State(state): State<UploadState>,
) -> impl IntoResponse {
    if token != state.token {
        return (StatusCode::NOT_FOUND, Html("Upload session not found."));
    }
    (StatusCode::OK, upload_page())
}

async fn receive_upload(
    Path(token): Path<String>,
    State(state): State<UploadState>,
    mut multipart: Multipart,
) -> (StatusCode, String) {
    if token != state.token {
        return (StatusCode::NOT_FOUND, "Upload session not found.".into());
    }
    let mut receipt_slot = state.receipt.lock().await;
    if state.accepted.load(Ordering::Acquire) {
        return (
            StatusCode::CONFLICT,
            "A receipt has already been sent.".into(),
        );
    }
    let field = match multipart.next_field().await {
        Ok(Some(field)) if field.name() == Some("receipt") => field,
        Ok(_) => return (StatusCode::BAD_REQUEST, "Choose one receipt image.".into()),
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                "The upload could not be read.".into(),
            )
        }
    };
    let original_name = field
        .file_name()
        .unwrap_or("mobile-receipt")
        .chars()
        .filter(|character| !character.is_control())
        .take(160)
        .collect::<String>();
    let bytes = match field.bytes().await {
        Ok(bytes) if !bytes.is_empty() && bytes.len() <= MAX_UPLOAD_BYTES => bytes,
        Ok(_) => {
            return (
                StatusCode::PAYLOAD_TOO_LARGE,
                "Receipt images must be 25 MB or smaller.".into(),
            )
        }
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                "The upload could not be read.".into(),
            )
        }
    };
    let Some((extension, file_type)) = detected_type(&bytes) else {
        return (
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "Use a JPEG, PNG, WebP, or HEIC image.".into(),
        );
    };
    if let Err(error) = tokio::fs::create_dir_all(&state.receipts_directory).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Could not prepare receipt storage: {error}"),
        );
    }
    let stored_name = format!("mobile-{}.{}", Uuid::new_v4().simple(), extension);
    let destination = state.receipts_directory.join(&stored_name);
    if let Err(error) = tokio::fs::write(&destination, &bytes).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Could not store receipt: {error}"),
        );
    }
    let receipt = MobileReceipt {
        path: format!("receipts/{stored_name}"),
        file_name: if original_name.is_empty() {
            format!("receipt.{extension}")
        } else {
            original_name
        },
        file_type: file_type.into(),
        file_size: bytes.len() as u64,
    };
    state.accepted.store(true, Ordering::Release);
    *receipt_slot = Some(receipt);
    (StatusCode::OK, "Receipt sent successfully.".into())
}

async fn stop_active_upload(delete_unclaimed: bool) {
    let active = ACTIVE_UPLOAD
        .get_or_init(|| Mutex::new(None))
        .lock()
        .await
        .take();
    if let Some(mut active) = active {
        if let Some(cancel) = active.cancel.take() {
            let _ = cancel.send(());
        }
        if delete_unclaimed {
            if let Some(receipt) = active.receipt.lock().await.take() {
                let _ = tokio::fs::remove_file(active.workspace_directory.join(receipt.path)).await;
            }
        }
    }
}

#[tauri::command]
pub async fn start_mobile_receipt_upload(
    app: AppHandle,
    workspace_id: String,
) -> Result<MobileUploadSession, String> {
    let _operation = UPLOAD_OPERATION_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .await;
    stop_active_upload(true).await;
    let database = workspace_database_path(&app, &workspace_id)?;
    if !database.exists() {
        return Err("Business workspace was not found.".into());
    }
    let workspace_directory = database
        .parent()
        .ok_or("Business workspace path is invalid.")?
        .to_path_buf();
    let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let receipt = Arc::new(Mutex::new(None));
    let state = UploadState {
        token: token.clone(),
        receipt: receipt.clone(),
        receipts_directory: workspace_directory.join("receipts"),
        accepted: Arc::new(AtomicBool::new(false)),
    };
    let router = Router::new()
        .route("/receipt/{token}", get(show_upload).post(receive_upload))
        .layer(DefaultBodyLimit::max(MAX_UPLOAD_BYTES + 1024 * 1024))
        .with_state(state);
    let ip = local_ip_address::local_ip().map_err(|_| "Could not find this computer's local network address. Connect both devices to the same Wi-Fi network.")?;
    if !ip.is_ipv4() {
        return Err("An IPv4 local network is required for mobile receipt sharing.".into());
    }
    let listener = tokio::net::TcpListener::bind((ip, 0))
        .await
        .map_err(|error| format!("Could not start mobile receipt sharing: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();
    let (cancel, cancelled) = oneshot::channel();
    let expiry_receipt = receipt.clone();
    let expiry_directory = workspace_directory.clone();
    tokio::spawn(async move {
        let shutdown = async {
            tokio::select! {
                _ = cancelled => {},
                _ = tokio::time::sleep(Duration::from_secs(SESSION_SECONDS)) => {},
            }
        };
        let _ = axum::serve(listener, router)
            .with_graceful_shutdown(shutdown)
            .await;
        if let Some(receipt) = expiry_receipt.lock().await.take() {
            let _ = tokio::fs::remove_file(expiry_directory.join(receipt.path)).await;
        }
    });
    *ACTIVE_UPLOAD.get_or_init(|| Mutex::new(None)).lock().await = Some(ActiveUpload {
        cancel: Some(cancel),
        receipt,
        workspace_directory,
    });
    Ok(MobileUploadSession {
        url: format!("http://{ip}:{port}/receipt/{token}"),
        expires_in_seconds: SESSION_SECONDS,
    })
}

#[tauri::command]
pub async fn poll_mobile_receipt_upload() -> Result<Option<MobileReceipt>, String> {
    let guard = ACTIVE_UPLOAD.get_or_init(|| Mutex::new(None)).lock().await;
    let Some(active) = guard.as_ref() else {
        return Ok(None);
    };
    let receipt = active.receipt.lock().await.take();
    Ok(receipt)
}

#[tauri::command]
pub async fn stop_mobile_receipt_upload() {
    let _operation = UPLOAD_OPERATION_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .await;
    stop_active_upload(true).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_supported_image_signatures() {
        assert_eq!(detected_type(&[0xff, 0xd8, 0xff, 0x00]).unwrap().0, "jpg");
        assert_eq!(detected_type(b"RIFF0000WEBP").unwrap().0, "webp");
        assert_eq!(detected_type(b"0000ftypheic").unwrap().0, "heic");
        assert!(detected_type(b"not an image").is_none());
    }

    #[tokio::test]
    async fn receives_one_image_over_http_and_stages_it_as_a_receipt() {
        let directory = std::env::temp_dir().join(format!(
            "soletrader-mobile-upload-{}",
            Uuid::new_v4().simple()
        ));
        let receipts_directory = directory.join("receipts");
        let token = "test-token".to_string();
        let receipt = Arc::new(Mutex::new(None));
        let state = UploadState {
            token: token.clone(),
            receipt: receipt.clone(),
            receipts_directory: receipts_directory.clone(),
            accepted: Arc::new(AtomicBool::new(false)),
        };
        let router = Router::new()
            .route("/receipt/{token}", get(show_upload).post(receive_upload))
            .layer(DefaultBodyLimit::max(MAX_UPLOAD_BYTES + 1024 * 1024))
            .with_state(state);
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(listener, router).await.unwrap();
        });
        let jpeg = vec![0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4];
        let form = reqwest::multipart::Form::new().part(
            "receipt",
            reqwest::multipart::Part::bytes(jpeg.clone())
                .file_name("camera.jpg")
                .mime_str("image/jpeg")
                .unwrap(),
        );
        let response = reqwest::Client::new()
            .post(format!("http://{address}/receipt/{token}"))
            .multipart(form)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), reqwest::StatusCode::OK);
        let stored = receipt.lock().await.take().unwrap();
        assert_eq!(stored.file_name, "camera.jpg");
        assert_eq!(stored.file_type, "image/jpeg");
        assert_eq!(
            tokio::fs::read(directory.join(&stored.path)).await.unwrap(),
            jpeg
        );
        let second_form = reqwest::multipart::Form::new().part(
            "receipt",
            reqwest::multipart::Part::bytes(vec![0xff, 0xd8, 0xff, 0x00]).file_name("second.jpg"),
        );
        let second_response = reqwest::Client::new()
            .post(format!("http://{address}/receipt/{token}"))
            .multipart(second_form)
            .send()
            .await
            .unwrap();
        assert_eq!(second_response.status(), reqwest::StatusCode::CONFLICT);
        server.abort();
        let _ = server.await;
        std::fs::remove_dir_all(directory).unwrap();
    }
}
