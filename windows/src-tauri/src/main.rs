// Приложение Клуба танцев для Windows: окно с приложением клуба (Google Apps Script) на встроенном в Windows движке Edge (WebView2).
// Открывает приложение напрямую с серверов Google — не зависит от настроек браузера и сайта corpdance.ru. Размер — несколько МБ.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

/// Прячем служебную полосу Google «Это приложение создано пользователем Google Apps Script».
const HIDE_BANNER: &str = r#"(function(){ if (location.hostname !== 'script.google.com') return;
  var css = '#warning,.warning-bar{display:none!important}';
  function add(){ if (document.getElementById('dc-hide')) return; var s = document.createElement('style'); s.id = 'dc-hide'; s.textContent = css; (document.head || document.documentElement).appendChild(s); }
  add(); document.addEventListener('DOMContentLoaded', add); })();"#;

const APP_URL: &str = "https://script.google.com/macros/s/AKfycbxiFk2Vp8ES7BW8Y6WUnfSHbBkS3w0lxnHS2lmuf2qPfLxGLo5NsJ2rpdlHRA8XDNYI_g/exec";

/// Внутри окна — только приложение клуба и вход Google; остальные ссылки открываются в обычном браузере.
fn inside(u: &tauri::Url) -> bool {
    match u.scheme() {
        "about" | "data" | "blob" | "tauri" => return true,
        "http" | "https" => {}
        _ => return false,
    }
    let h = u.host_str().unwrap_or("");
    let path = u.path();
    if h == "script.google.com" || h == "accounts.google.com" || h == "tauri.localhost" || h.ends_with(".googleusercontent.com") {
        return true;
    }
    h == "www.google.com" && path.starts_with("/accounts")
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let ver = app.package_info().version.to_string();
            let ua = format!(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0 DanceClubWin/{}",
                ver
            );
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(APP_URL.parse().unwrap()))
                .title("Клуб танцев")
                .inner_size(1280.0, 840.0)
                .min_inner_size(380.0, 520.0)
                .center()
                .user_agent(&ua)
                .initialization_script(HIDE_BANNER)
                .on_navigation(move |url| {
                    if inside(url) {
                        true
                    } else {
                        let _ = handle.opener().open_url(url.as_str(), None::<&str>);
                        false
                    }
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("не удалось запустить приложение");
}
