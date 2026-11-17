# Nosilence client

React + TypeScript user interface, built with Vite. The same code is shipped as the
web app and inside the Tauri desktop app.

```powershell
npm install
npm run dev          # development server on http://127.0.0.1:5173
npm test             # unit tests (Vitest)
npm run lint         # oxlint
npm run typecheck    # TypeScript
npm run format       # Prettier
```

`npm test` goes through `scripts/vitest.mjs`, which normalises the Windows drive letter
before starting Vitest. See the comment in that file.
