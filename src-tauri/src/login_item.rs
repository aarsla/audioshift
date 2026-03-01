// Login Item management via SMAppService (macOS 13+)
#[cfg(target_os = "macos")]
mod ffi {
    extern "C" {
        pub fn login_item_status() -> i32;
        pub fn login_item_enable() -> i32;
        pub fn login_item_disable() -> i32;
    }
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn login_item_is_enabled() -> bool {
    unsafe { ffi::login_item_status() == 1 } // 1 = enabled
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn login_item_set_enabled(enabled: bool) -> Result<(), String> {
    let ret = unsafe {
        if enabled { ffi::login_item_enable() } else { ffi::login_item_disable() }
    };
    if ret == 0 { Ok(()) } else { Err("Failed to update login item".into()) }
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn login_item_is_enabled() -> bool { false }

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn login_item_set_enabled(_enabled: bool) -> Result<(), String> { Ok(()) }
