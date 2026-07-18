# Egrz — Staff Command Dashboard

Standalone staff ops web app for Apex Launcher.

- **URL:** `http://localhost:8787/egrz/`
- **API:** `/api/staff/*`
- **UI:** [`egrz/`](../egrz/)
- **Auth:** [`backend/lib/egrz-auth.js`](../backend/lib/egrz-auth.js)
- **Routes:** [`backend/routes/staff.js`](../backend/routes/staff.js)

## What it covers

| Module | Purpose |
|--------|---------|
| Overview | Tickets, players, Stripe, Discord bot health |
| Tickets | Open `ticket-*` Discord channels by type + deep links |
| Purchases | Lookup by UUID / `cs_…` session / customer; recent entitlements |
| Players | Search `players.json` balances |
| Crashes | Local diagnostics archive + staff-channel feed → Fix Agent |
| Updates | Per-player force update, CDN channels, mobile env, GitHub backup releases |
| Fix Agent | Issue + Launcher ID → allow-listed repairs + Discord/ticket notify ([SPACE_CLOUD.md](./SPACE_CLOUD.md)) |
| Discord Ops | Channel links, role IDs, bot status (read-only) |

`/setup-server` wipe stays Discord-only (password gated).

## Discord OAuth setup

1. [Discord Developer Portal](https://discord.com/developers/applications) → your Apex Launcher app → **OAuth2**
2. Add redirect: `http://localhost:8787/api/staff/auth/callback`
   - Production: `https://your-domain/api/staff/auth/callback`
3. Copy **Client ID** and **Client Secret** into `backend/.env`:

```env
DISCORD_OAUTH_CLIENT_ID=
DISCORD_OAUTH_CLIENT_SECRET=
EGRZ_SESSION_SECRET=long-random-string
EGRZ_PUBLIC_URL=http://localhost:8787
DISCORD_GUILD_ID=   # already set for the bot
DISCORD_BOT_TOKEN=  # used to verify guild staff roles
```

4. Restart backend: `cd backend && npm start`
5. Open `/egrz/` → **Sign in with Discord**

Staff must have one of: Eagerz1, Manager, SrAdmin, SrMod, Mod, Helper, Developers, Staff (role IDs from `/setup-server`).

### Discord Rich Presence (“Playing Egrz”)

While you are signed into Egrz, the backend talks to **Discord desktop** on the same PC (IPC) and sets your activity to **Egrz · Staff Command**.

1. Discord desktop open and logged in (same machine as `npm start` for backend)
2. Same Discord app as OAuth (`DISCORD_OAUTH_CLIENT_ID`)
3. Optional: Dev Portal → **Rich Presence → Art Assets** — upload the peak logo as `apex` (then set `EGRZ_RPC_LARGE_IMAGE=apex`)
4. Open `/egrz/` and sign in — check your Discord profile for the activity

Disable with `EGRZ_DISCORD_RPC=false`. Heartbeats stop ~45s after you leave the tab / logout.

### Access levels

| Level | Roles | Extra |
|-------|-------|-------|
| viewer | Helper, Mod, Developers, Staff | Read modules |
| ops | SrMod, SrAdmin | Post todos |
| owner | Eagerz1, Manager | Same as ops (v1) |

## API sketch

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/staff/auth/config` | public |
| GET | `/api/staff/auth/login` | public → Discord |
| GET | `/api/staff/auth/callback` | OAuth |
| GET | `/api/staff/auth/me` | cookie |
| POST | `/api/staff/auth/logout` | cookie |
| GET | `/api/staff/launcher-id/lookup?q=` | viewer+ — MC / Discord / UUID → Launcher ID |
| POST | `/api/staff/launcher-id/:uuid/link-discord` | ops+ |
| GET | `/api/staff/overview` | viewer+ |
| GET | `/api/staff/tickets` | viewer+ |
| GET | `/api/staff/purchases/lookup?q=` | viewer+ |
| GET | `/api/staff/players` | viewer+ |
| GET | `/api/staff/crashes` | viewer+ |
| GET | `/api/staff/updates` | viewer+ |
| GET/POST | `/api/staff/todos` | viewer+ / ops+ |
| GET | `/api/staff/agents` | viewer+ |
| GET | `/api/staff/discord` | viewer+ |
