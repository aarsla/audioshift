use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use crate::state::{AppState, Status};

#[cfg(target_os = "macos")]
extern "C" {
    fn CGEventSourceKeyState(stateID: i32, key: u16) -> bool;
}

#[cfg(target_os = "macos")]
const ESCAPE_KEYCODE: u16 = 0x35;
// CGEventSourceStateID::CombinedSessionState
#[cfg(target_os = "macos")]
const COMBINED_SESSION_STATE: i32 = 0;

static MONITOR_ACTIVE: AtomicBool = AtomicBool::new(false);
static DISMISS_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Start monitoring for Escape key press (call when recording starts).
pub fn start(app: &AppHandle) {
    if MONITOR_ACTIVE.swap(true, Ordering::SeqCst) {
        return; // Already running
    }

    let app = app.clone();
    thread::spawn(move || {
        while MONITOR_ACTIVE.load(Ordering::SeqCst) {
            let state = app.state::<AppState>();
            if state.status() != Status::Recording {
                break;
            }

            if is_escape_pressed() {
                let _ = app.emit("recording-toggle", "cancel");
                break;
            }

            thread::sleep(Duration::from_millis(50));
        }
        MONITOR_ACTIVE.store(false, Ordering::Relaxed);
    });
}

/// Stop the escape monitor (call when recording stops/cancels).
pub fn stop() {
    MONITOR_ACTIVE.store(false, Ordering::Relaxed);
}

/// Start monitoring for Escape to dismiss the overlay (after transcription, "Keep" mode).
pub fn start_dismiss(app: &AppHandle) {
    // Stop any existing dismiss monitor
    DISMISS_ACTIVE.store(false, Ordering::Relaxed);
    thread::sleep(Duration::from_millis(10));

    DISMISS_ACTIVE.store(true, Ordering::SeqCst);
    let app = app.clone();
    thread::spawn(move || {
        // Wait for any held Esc from recording cancel to be released first
        thread::sleep(Duration::from_millis(300));
        while DISMISS_ACTIVE.load(Ordering::SeqCst) {
            if is_escape_pressed() {
                let _ = app.emit("overlay-dismiss", ());
                break;
            }
            thread::sleep(Duration::from_millis(50));
        }
        DISMISS_ACTIVE.store(false, Ordering::Relaxed);
    });
}

/// Stop the dismiss monitor.
pub fn stop_dismiss() {
    DISMISS_ACTIVE.store(false, Ordering::Relaxed);
}

fn is_escape_pressed() -> bool {
    #[cfg(target_os = "macos")]
    {
        unsafe { CGEventSourceKeyState(COMBINED_SESSION_STATE, ESCAPE_KEYCODE) }
    }
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
        const VK_ESCAPE: i32 = 0x1B;
        let state = unsafe { GetAsyncKeyState(VK_ESCAPE) };
        state < 0
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        false
    }
}
