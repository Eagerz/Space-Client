# Space Cloud

Local-first ops cloud for Apex Launcher: durable diagnostics, per-player Fix Agent, and update control — built on `api.spaceclient.app` + Egrz. GitHub stays CI + backup, not the place you fix one player.

## What it is

| Piece | Role |
|--------|------|
| **Fix Agent** | Egrz → issue text + Launcher ID → allow-listed repairs → player inbox |
| **Diagnostics** | Sanitized crash archives under `backend/data/diagnostics/` |
| **Updates** | CDN `latest.json` for everyone; staff inbox `forceUpdateCheck` for one player |
| **GitHub backup** | Optional (`SPACE_CLOUD_GH_BACKUP=1`) — uploads diagnostic text to a private release tag |

## Fix Agent flow

1. Open **Egrz → Fix Agent**.
2. Enter Launcher ID (Minecraft UUID) or a Minecraft/Discord name, plus the issue description.
3. Agent analyzes with the same allow-list as crash AI (`clear_extra_mods`, caches, logs, restage Fabric, suggest_*).
4. On enough confidence, actions are queued on the player’s staff inbox.
5. Apex Launcher polls `GET /api/crash/inbox` about every **45 seconds** while signed in (or on next launch).
6. After apply + ack, Discord DM and/or ticket channel is notified; staff channel gets a status embed.

**Limit:** the cloud cannot start a closed Electron app. If the launcher is offline, the fix waits until they open it.

### Staff APIs

```
POST /api/staff/fix-jobs
  { launcherId|q, issueText, notifyDiscord?, requireConfirm?, ticketChannelId?, crashId? }

GET  /api/staff/fix-jobs
GET  /api/staff/fix-jobs/:id
POST /api/staff/fix-jobs/:id/queue   # confirm / force-queue needs_staff jobs
```

Requires Egrz **ops** access (SrMod+).

### Safe actions only

Never remote shell. Only:

- `clear_extra_mods`
- `clear_shader_caches`
- `clear_logs`
- `restage_fabric_injection`
- plus guidance flags / force update check

## Diagnostics

Crash reports (`POST /api/crash/report`) write:

- `backend/data/diagnostics/{crashId}/meta.json`
- `logs.txt` / `crash-report.txt` / `latest-log-tail.txt` when present

Tokens and `auth-session` fields are stripped. Egrz **Crashes** lists the archive and can **Send to Fix Agent**.

```
GET  /api/staff/crashes
GET  /api/staff/crashes/:crashId
POST /api/staff/crashes/:crashId/backup   # optional GitHub
```

## GitHub as backup (optional)

```env
SPACE_CLOUD_GH_BACKUP=1
SPACE_CLOUD_GH_TOKEN=ghp_...          # or GITHUB_TOKEN
SPACE_CLOUD_GH_REPO=owner/private-repo
# SPACE_CLOUD_GH_TAG=diagnostics-backup
```

Creates/updates a prerelease tag and uploads `diagnostic-{crashId}.txt`. Primary truth remains on the API disk.

## Updates

- **Everyone:** `https://download.spaceclient.com/updates/latest.json` (see `auto-updater.js`).
- **One player:** Egrz Updates → Force update check, or Fix Agent when the issue mentions updates.
- **Channels:** defaults in code; override with `backend/data/update-channels.json` (see `backend/update-channels.example.json`).
- **Publish:** `node scripts/publish-app-update.js` (GitHub Releases). Copy SHA-256 manifest to the CDN for live clients — GitHub alone is backup/CI.

## Run locally (free)

```bash
cd backend
cp .env.example .env   # fill Discord / AI keys as needed
npm start              # default http://localhost:8787
# Egrz: http://localhost:8787/egrz/
```

Data files (gitignored): `backend/data/players.json`, `fix-jobs.json`, `diagnostics/`, optional `update-channels.json`.

## Related docs

- [EGRZ.md](./EGRZ.md) — staff dashboard auth
- [CRASH_RECOVERY.md](./CRASH_RECOVERY.md) — AI recovery + inbox
- [DISCORD_BOT.md](./DISCORD_BOT.md) — tickets / crash buttons
