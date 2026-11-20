# Third-party notices

Nosilence is licensed under AGPL-3.0-only. It depends on the open-source software
listed below. Every license here is compatible with AGPL-3.0: almost all are permissive
(MIT, Apache-2.0, BSD, 0BSD, Unlicense, Unicode-3.0); `hpke-rs` is MPL-2.0, a file-level
copyleft that allows combination with AGPL-3.0 (we do not modify its files; if we ever do,
those changes stay under MPL-2.0). Each package ships its own license text and copyright notice in its
source; full license texts will be bundled with distributed builds (web and desktop).

Keep this file up to date: every new dependency is checked for license compatibility
and added here in the same change.

Last reviewed: 2026-11-20 (Phase 5). CI runs `mix hex.audit` and `npm audit` on every push.

## Server (Elixir, `server/mix.lock`)

| Package | Version | License |
|---|---|---|
| argon2_elixir | 4.1.3 | Apache-2.0 (bundles the Argon2 reference C code, CC0-1.0 OR Apache-2.0) |
| bandit | 1.15.0 | MIT |
| comeonin | 5.5.1 | BSD-3-Clause |
| db_connection | 2.10.2 | Apache-2.0 |
| decimal | 3.2.0 | Apache-2.0 |
| dns_cluster | 0.2.0 | MIT |
| ecto | 3.14.3 | Apache-2.0 |
| ecto_sql | 3.14.0 | Apache-2.0 |
| elixir_make | 0.10.1 | Apache-2.0 (build tool only) |
| expo | 1.1.1 | Apache-2.0 |
| finch | 0.24.0 | MIT |
| gettext | 1.0.2 | Apache-2.0 |
| hpax | 1.1.0 | Apache-2.0 |
| idna | 8.0.0 | MIT |
| jason | 1.4.5 | Apache-2.0 |
| mime | 2.0.7 | Apache-2.0 |
| mint | 1.11.0 | Apache-2.0 |
| nimble_options | 1.2.0 | Apache-2.0 |
| nimble_pool | 1.2.0 | Apache-2.0 |
| phoenix | 1.8.16 | MIT |
| phoenix_ecto | 4.7.0 | MIT |
| phoenix_pubsub | 2.4.1 | MIT |
| phoenix_template | 1.1.0 | MIT |
| plug | 1.20.4 | Apache-2.0 |
| plug_crypto | 2.2.1 | Apache-2.0 |
| postgrex | 0.22.4 | Apache-2.0 |
| req | 0.7.5 | Apache-2.0 |
| swoosh | 1.30.0 | MIT |
| telemetry | 1.4.3 | Apache-2.0 |
| telemetry_metrics | 1.2.0 | Apache-2.0 |
| telemetry_poller | 1.3.0 | Apache-2.0 |
| thousand_island | 1.6.0 | MIT |
| websock | 0.5.3 | MIT |
| websock_adapter | 0.7.2 | MIT |

## Client runtime (npm, shipped in the web bundle)

| Package | Version | License |
|---|---|---|
| @bufbuild/protobuf | 1.10.1 | Apache-2.0 AND BSD-3-Clause |
| @floating-ui/core | 1.8.0 | MIT |
| @floating-ui/dom | 1.8.0 | MIT |
| @floating-ui/utils | 0.2.12 | MIT |
| @livekit/components-core | 0.12.16 | Apache-2.0 |
| @livekit/components-react | 2.9.25 | Apache-2.0 |
| @livekit/mutex | 1.1.1 | Apache-2.0 |
| @livekit/protocol | 1.53.0 | Apache-2.0 |
| clsx | 2.1.1 | MIT |
| events | 3.3.0 | MIT |
| jose | 6.2.17 | MIT |
| livekit-client | 2.24.1 | Apache-2.0 |
| lodash.debounce | 4.0.8 | MIT |
| loglevel | 1.9.2 | MIT |
| machina | 7.0.1 | MIT |
| phoenix (channels client) | 1.8.16 | MIT |
| react | 19.3.1 | MIT |
| react-dom | 19.3.1 | MIT |
| rxjs | 7.8.2 | Apache-2.0 |
| scheduler | 0.28.0 | MIT |
| sdp | 3.2.3 | MIT |
| sdp-transform | 2.15.0 | MIT |
| tslib | 2.8.1, 2.9.1 | 0BSD |
| typed-emitter | 2.1.0 | MIT |
| usehooks-ts | 3.1.1 | MIT |
| webrtc-adapter | 9.0.6 | BSD-3-Clause |

Not used: `@livekit/krisp-noise-filter` is an optional, proprietary LiveKit package
and must not be added.

Development-only tools (Vite, Vitest, TypeScript, oxlint, Prettier, Testing Library)
are not shipped to users.

## Client MLS module (Rust, `client/mls/Cargo.lock`, compiled to WebAssembly)

Crates in the WebAssembly build (`cargo tree --target wasm32-unknown-unknown -e normal`);
a few, such as proc-macros, run only while building.

| Crate | Version | License |
|---|---|---|
| aead | 0.5.2 | MIT OR Apache-2.0 |
| aes | 0.8.4 | MIT OR Apache-2.0 |
| aes-gcm | 0.10.3 | Apache-2.0 OR MIT |
| base16ct | 0.2.0 | Apache-2.0 OR MIT |
| base64ct | 1.8.3 | Apache-2.0 OR MIT |
| block-buffer | 0.10.4 | MIT OR Apache-2.0 |
| block-buffer | 0.12.1 | MIT OR Apache-2.0 |
| bumpalo | 3.20.4 | MIT OR Apache-2.0 |
| cfg-if | 1.0.5 | MIT OR Apache-2.0 |
| chacha20 | 0.9.1 | Apache-2.0 OR MIT |
| chacha20poly1305 | 0.10.1 | Apache-2.0 OR MIT |
| cipher | 0.4.4 | MIT OR Apache-2.0 |
| cmov | 0.5.4 | Apache-2.0 OR MIT |
| const-oid | 0.10.3 | Apache-2.0 OR MIT |
| const-oid | 0.9.6 | Apache-2.0 OR MIT |
| crossbeam-deque | 0.8.8 | MIT OR Apache-2.0 |
| crossbeam-epoch | 0.9.21 | MIT OR Apache-2.0 |
| crossbeam-utils | 0.8.23 | MIT OR Apache-2.0 |
| crypto-bigint | 0.5.5 | Apache-2.0 OR MIT |
| crypto-common | 0.1.7 | MIT OR Apache-2.0 |
| crypto-common | 0.2.2 | MIT OR Apache-2.0 |
| ctr | 0.9.2 | MIT OR Apache-2.0 |
| ctutils | 0.4.8 | Apache-2.0 OR MIT |
| curve25519-dalek | 4.1.3 | BSD-3-Clause |
| curve25519-dalek | 5.0.0 | BSD-3-Clause |
| der | 0.7.10 | Apache-2.0 OR MIT |
| der | 0.8.3 | Apache-2.0 OR MIT |
| digest | 0.10.7 | MIT OR Apache-2.0 |
| digest | 0.11.3 | MIT OR Apache-2.0 |
| ecdsa | 0.16.9 | Apache-2.0 OR MIT |
| ed25519 | 2.2.3 | Apache-2.0 OR MIT |
| ed25519-dalek | 2.2.0 | BSD-3-Clause |
| either | 1.19.0 | MIT OR Apache-2.0 |
| elliptic-curve | 0.13.8 | Apache-2.0 OR MIT |
| ff | 0.13.1 | MIT/Apache-2.0 |
| futures-core | 0.3.34 | MIT OR Apache-2.0 |
| futures-task | 0.3.34 | MIT OR Apache-2.0 |
| futures-util | 0.3.34 | MIT OR Apache-2.0 |
| generic-array | 0.14.7 | MIT |
| getrandom | 0.2.17 | MIT OR Apache-2.0 |
| getrandom | 0.4.3 | MIT OR Apache-2.0 |
| ghash | 0.5.1 | Apache-2.0 OR MIT |
| group | 0.13.0 | MIT/Apache-2.0 |
| hax-lib | 0.3.7 | Apache-2.0 |
| hax-lib-macros | 0.3.7 | Apache-2.0 |
| hkdf | 0.12.4 | MIT OR Apache-2.0 |
| hkdf | 0.13.0 | MIT OR Apache-2.0 |
| hmac | 0.12.1 | MIT OR Apache-2.0 |
| hmac | 0.13.0 | MIT OR Apache-2.0 |
| hpke-rs | 0.7.0 | MPL-2.0 |
| hpke-rs-crypto | 0.7.0 | MPL-2.0 |
| hpke-rs-rust-crypto | 0.7.0 | MPL-2.0 |
| hybrid-array | 0.4.15 | MIT OR Apache-2.0 |
| inout | 0.1.4 | MIT OR Apache-2.0 |
| itoa | 1.0.19 | MIT OR Apache-2.0 |
| js-sys | 0.3.107 | MIT OR Apache-2.0 |
| k256 | 0.13.4 | Apache-2.0 OR MIT |
| keccak | 0.2.2 | Apache-2.0 OR MIT |
| kem | 0.3.0 | Apache-2.0 OR MIT |
| libc | 0.2.191 | MIT OR Apache-2.0 |
| libcrux-intrinsics | 0.0.8 | Apache-2.0 |
| libcrux-platform | 0.0.3 | Apache-2.0 |
| libcrux-secrets | 0.0.6 | Apache-2.0 |
| libcrux-sha3 | 0.0.10 | Apache-2.0 |
| libcrux-traits | 0.0.8 | Apache-2.0 |
| log | 0.4.35 | MIT OR Apache-2.0 |
| memchr | 2.8.3 | Unlicense OR MIT |
| ml-dsa | 0.1.2 | Apache-2.0 OR MIT |
| ml-kem | 0.3.4 | Apache-2.0 OR MIT |
| module-lattice | 0.2.4 | Apache-2.0 OR MIT |
| num-traits | 0.2.19 | MIT OR Apache-2.0 |
| opaque-debug | 0.3.1 | MIT OR Apache-2.0 |
| openmls | 0.9.2 | MIT |
| openmls_basic_credential | 0.6.0 | MIT |
| openmls_memory_storage | 0.6.0 | MIT |
| openmls_rust_crypto | 0.6.0 | MIT |
| openmls_serialization_helpers | 0.1.0 | MIT |
| openmls_traits | 0.6.0 | MIT |
| p256 | 0.13.2 | Apache-2.0 OR MIT |
| p384 | 0.13.1 | Apache-2.0 OR MIT |
| pem-rfc7468 | 0.7.0 | Apache-2.0 OR MIT |
| pin-project-lite | 0.2.17 | Apache-2.0 OR MIT |
| pkcs8 | 0.10.2 | Apache-2.0 OR MIT |
| pkcs8 | 0.11.0 | Apache-2.0 OR MIT |
| poly1305 | 0.8.0 | Apache-2.0 OR MIT |
| polyval | 0.6.2 | Apache-2.0 OR MIT |
| ppv-lite86 | 0.2.21 | MIT OR Apache-2.0 |
| primeorder | 0.13.6 | Apache-2.0 OR MIT |
| proc-macro2 | 1.0.107 | MIT OR Apache-2.0 |
| quote | 1.0.47 | MIT OR Apache-2.0 |
| rand | 0.10.4 | MIT OR Apache-2.0 |
| rand_chacha | 0.10.0 | MIT OR Apache-2.0 |
| rand_chacha | 0.3.1 | MIT OR Apache-2.0 |
| rand_core | 0.10.1 | MIT OR Apache-2.0 |
| rand_core | 0.6.4 | MIT OR Apache-2.0 |
| rayon | 1.12.0 | MIT OR Apache-2.0 |
| rayon-core | 1.13.0 | MIT OR Apache-2.0 |
| rfc6979 | 0.4.0 | Apache-2.0 OR MIT |
| sec1 | 0.7.3 | Apache-2.0 OR MIT |
| serde | 1.0.229 | MIT OR Apache-2.0 |
| serde_bytes | 0.11.19 | MIT OR Apache-2.0 |
| serde_core | 1.0.229 | MIT OR Apache-2.0 |
| serde_derive | 1.0.229 | MIT OR Apache-2.0 |
| serde_json | 1.0.154 | MIT OR Apache-2.0 |
| sha2 | 0.10.9 | MIT OR Apache-2.0 |
| sha2 | 0.11.1 | MIT OR Apache-2.0 |
| sha3 | 0.12.0 | MIT OR Apache-2.0 |
| shake | 0.1.0 | MIT OR Apache-2.0 |
| signature | 2.2.0 | Apache-2.0 OR MIT |
| signature | 3.0.0 | Apache-2.0 OR MIT |
| slab | 0.4.12 | MIT |
| spki | 0.7.3 | Apache-2.0 OR MIT |
| spki | 0.8.1 | Apache-2.0 OR MIT |
| sponge-cursor | 0.1.0 | MIT OR Apache-2.0 |
| subtle | 2.6.1 | BSD-3-Clause |
| syn | 2.0.119 | MIT OR Apache-2.0 |
| syn | 3.0.10 | MIT OR Apache-2.0 |
| thiserror | 2.0.21 | MIT OR Apache-2.0 |
| thiserror-impl | 2.0.21 | MIT OR Apache-2.0 |
| tls_codec | 0.5.0 | Apache-2.0 OR MIT |
| tls_codec_derive | 0.5.0 | Apache-2.0 OR MIT |
| typenum | 1.20.1 | MIT OR Apache-2.0 |
| unicode-ident | 1.0.27 | (MIT OR Apache-2.0) AND Unicode-3.0 |
| universal-hash | 0.5.1 | MIT OR Apache-2.0 |
| wasm-bindgen | 0.2.130 | MIT OR Apache-2.0 |
| wasm-bindgen-macro | 0.2.130 | MIT OR Apache-2.0 |
| wasm-bindgen-macro-support | 0.2.130 | MIT OR Apache-2.0 |
| wasm-bindgen-shared | 0.2.130 | MIT OR Apache-2.0 |
| web-time | 1.1.0 | MIT OR Apache-2.0 |
| x-wing | 0.1.1 | Apache-2.0 OR MIT |
| x25519-dalek | 2.0.1 | BSD-3-Clause |
| x25519-dalek | 3.0.0 | BSD-3-Clause |
| zerocopy | 0.8.63 | BSD-2-Clause OR Apache-2.0 OR MIT |
| zeroize | 1.9.1 | Apache-2.0 OR MIT |
| zeroize_derive | 1.5.0 | Apache-2.0 OR MIT |
| zmij | 1.0.23 | MIT |

## Services used, not distributed

| Software | License |
|---|---|
| LiveKit server | Apache-2.0 |
| PostgreSQL | PostgreSQL License |
