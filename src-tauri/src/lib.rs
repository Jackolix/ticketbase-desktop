use std::sync::Arc;

use tauri::Manager;

mod api;
mod commands;
mod datetime;
mod store;
mod sync;

use api::client::{ApiClient, DEFAULT_BASE_URL};
use commands::AppState;
use store::Store;
use sync::SyncEngine;

#[tauri::command]
async fn open_ticket_window(app: tauri::AppHandle, ticket_id: u32) -> Result<(), String> {
    let window_label = format!("ticket-{}", ticket_id);

    // Check if window already exists
    if let Some(window) = app.get_webview_window(&window_label) {
        // Window exists, focus it
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    // Create new window using WebviewWindowBuilder
    let _webview_window = tauri::WebviewWindowBuilder::new(
        &app,
        window_label,
        tauri::WebviewUrl::App(format!("/?ticketWindow=true#/ticket/{}", ticket_id).into()),
    )
    .title(format!("Ticket #{}", ticket_id))
    .inner_size(1000.0, 800.0)
    .min_inner_size(600.0, 400.0)
    .center()
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            // The store lives in the app data dir so it survives restarts and
            // the app can render last-known state before the first sync lands.
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("tickets.db");

            let store = Arc::new(Store::open(&db_path)?);
            let client = Arc::new(ApiClient::new(DEFAULT_BASE_URL));
            let engine = Arc::new(SyncEngine::new(store, client));

            app.manage(AppState {
                sync: engine.clone(),
            });

            // One sync task for the whole application. Every window reads the
            // store it fills, so opening a ticket window no longer adds another
            // poller — which is what made the app slower the more you used it.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                engine.run(handle).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_ticket_window,
            commands::sync_start,
            commands::sync_stop,
            commands::sync_refresh,
            commands::sync_set_interval,
            commands::sync_status,
            commands::query_tickets,
            commands::ticket_counts,
            commands::get_ticket,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
