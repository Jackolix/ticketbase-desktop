use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

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
        tauri::WebviewUrl::App(format!("/?ticketWindow=true#/ticket/{}", ticket_id).into())
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
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, open_ticket_window])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
