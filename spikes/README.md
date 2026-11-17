# Spikes

Throwaway experiments that answer one question each. Code here is not product code:
it is not reviewed to product standards, not covered by CI and never shipped.
The answer is recorded in an ADR; the code stays for reference.

| Spike | Question | Answer |
|---|---|---|
| [e2ee](e2ee) | Can MLS (openmls in WebAssembly) feed keys to LiveKit E2EE in the browser? | Yes, see [ADR 0002](../docs/adr/0002-mls-in-the-browser.md) |

## Running the e2ee spike

Needs the Docker services (`infra/`) and Phoenix (`server/`, `mix phx.server`) running.

```powershell
cd spikes\e2ee\mls-wasm
wasm-pack build --target web --release
cd ..\web
npm install
npm run dev    # http://127.0.0.1:5174
```

Open the page in Chrome as creator, in Edge as joiner, and in a second Chrome tab as
outsider. Each page shows what it receives from the others.
