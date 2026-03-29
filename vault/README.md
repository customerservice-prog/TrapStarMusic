# VAULT

Private trap vocal studio — React + Vite frontend, Express + SQLite backend.

## Run locally

**Terminal 1 — backend**

```bash
cd vault/backend
npm install
npm run dev
```

**Terminal 2 — frontend**

```bash
cd vault/frontend
npm install
npm run dev
```

Start the **backend before** the frontend. If 3001 is already in use, the backend moves to the next free port and writes `.vault-backend-port`; Vite reads that when it starts so `/api` still proxies correctly.

Open the URL Vite prints (usually port 5173; if that port is busy, Vite uses the next free one). Allow microphone access.

If you start the frontend first, restart Vite after the backend is up, or set `VAULT_BACKEND_PORT` to match the backend when running `npm run dev`.

The database is **sql.js** (SQLite in WebAssembly) — no native compiler required on Windows.

### Export mixing

Install [FFmpeg](https://ffmpeg.org/) and ensure `ffmpeg` is on your `PATH` for stem mixing. Without FFmpeg, the app still runs; export falls back to per-track playback.
