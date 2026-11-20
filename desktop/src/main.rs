// SPDX-License-Identifier: AGPL-3.0-only
// No console window in release builds on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    nosilence_desktop::run()
}
