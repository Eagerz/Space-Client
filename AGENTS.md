# AGENTS.md

## Cursor Cloud specific instructions

This is an npm monorepo with three installable packages plus a static dashboard:

| Area | Path | Run (dev) | Notes |
|------|------|-----------|-------|
| Desktop launcher (Electron) | `/` (root) | `npm start` | Flagship "Space Client" Minecraft launcher. Needs a display. See GPU caveat below. |
| Backend API (Express) | `backend/` | `npm start` (port `8787`) | Payments/progression/crash/mobile-update/staff APIs + Discord bot. Also serves the Egrz dashboard at `http://localhost:8787/egrz/`. |
| Mobile companion (Expo) | `mobile/` | `npm start` (Metro on `8081`) | Separate Bedrock companion app; `npm run typecheck` runs `tsc --noEmit`. Full run needs an Android emulator / Expo Go. |
| Egrz staff dashboard | `egrz/` | (none) | Static; served by the backend, no separate process. |

Dependencies are installed with `npm install` in each of the three package dirs (root, `backend/`, `mobile/`); the update script handles this. There are no lint or automated test suites in any package — `mobile`'s `npm run typecheck` is the only static check.

### Node version gotcha (important)
The backend start script is `node --use-system-ca server.js`, which needs Node >= 22.15. The default `/exec-daemon/node` shim is v22.14 and rejects `--use-system-ca` with `node: bad option`. An nvm-managed Node (v22.22.2) is installed and set as the nvm default, and `~/.bashrc` has been edited to prepend it to `PATH` so it wins over the shim. Because of this, always run the backend (and other node commands) from a **login shell** (e.g. `bash -l`, or a fresh `tmux ... new-session ... bash -l`) so the correct Node is picked up. A non-login shell may still resolve `node` to the v22.14 shim and fail.

### Electron launcher GPU caveat (important)
In this headless VM the GPU process fails to initialize, so a plain `DISPLAY=:1 npm start` renders a **black window**. Launch with software rendering instead:

```
DISPLAY=:1 ./node_modules/.bin/electron . --disable-gpu --disable-hardware-acceleration
```

DBus/GPU warning lines on startup are expected and harmless. The launcher's dev API base defaults to `http://localhost:8787`, so start the backend first for store/progression data.

### Backend config
`backend/.env` is optional — the server boots with safe defaults (Stripe checkout routes return 503, Discord bot stays idle, `PROGRESSION_JWT_SECRET` falls back to a dev value). Copy `backend/.env.example` → `backend/.env` only when you need real Stripe/Discord/JWT values. Player progression is stored as local JSON under `backend/data/` (created on first write).
