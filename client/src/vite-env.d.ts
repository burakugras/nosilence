// SPDX-License-Identifier: AGPL-3.0-only
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Server URL built into the desktop app; unset for the web build (same origin). */
  readonly VITE_API_ORIGIN?: string
}
