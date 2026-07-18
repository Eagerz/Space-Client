# AI crash recovery

Apex Launcher can diagnose launch/game crashes, apply **safe** fixes using sandboxed access to the user's Apex Launcher files, and escalate unresolved cases to staff through a **Discord bot**.

OpenAI + Discord secrets stay on the **backend** only — never in the Electron app.

## Flow

1. Minecraft crashes (or launch fails) → Game Logs shown as usual
2. Main process collects a sandbox snapshot (mods list, natives/bin jars, latest log, newest crash-report)
3. Backend `/api/crash/analyze` runs Gemini or OpenAI (or local heuristics if no AI key is set)
4. Client runs allow-listed repairs:
   - `clear_extra_mods` — delete non–Space-Client jars from `.minecraft/mods`
   - `clear_shader_caches` — remove sodium/iris/shader caches
   - `clear_logs` — old log files (keeps `latest.log`)
   - `restage_fabric_injection` — rebuild Fabric core injection
   - `suggest_*` — user guidance only (RAM / Microsoft login / GPU)
5. If recovery fails → `POST /api/crash/report` → Discord staff channel embed with:
   - Player Minecraft name/UUID
   - Crash ID
   - AI diagnosis / tips
   - Full log file attachment
   - Staff buttons to **queue remote fixes**, **DM the player**, or **open a bug ticket**
6. The launcher stays quiet on failed escalation (no “staff notified” UI). Player contact is via **Discord DM** or a **ticket**. Remote file fixes still apply silently via crash/inbox polling.

### User ID + Egrz push-fix (anytime)

**User ID = Minecraft UUID** (same key as progression). No separate install ID.

1. In **Egrz → Players**, search by **Minecraft username** or UUID
2. Copy **User ID (UUID)** (or open **Queue fix**)
3. Queue allow-listed actions, a tip, and/or **Prompt launcher update check**
4. Their signed-in launcher polls `GET /api/crash/inbox` about every 45s, applies the fix locally, then `POST /api/crash/inbox/ack`

Discord crash buttons also write the same inbox when the crash case has a Minecraft UUID, so delivery still works after crash-id polling ends.

“Update” means tip / force an updater check — not a silent mass binary rewrite. Real builds still ship via `auto-updater.js` + `latest.json`.

If the bot isn't online yet, the client **queues** the report under `userData/SpaceClient/crash-report-queue.json` and flushes later.

**Auth session** (`auth-session.enc`) is never readable by recovery.

## Backend env

Add to `backend/.env` (see `.env.example`):

```env
# Pick one (or neither for local heuristics):
GEMINI_API_KEY=
# GEMINI_CRASH_MODEL=gemini-2.0-flash
OPENAI_API_KEY=
# OPENAI_CRASH_MODEL=gpt-4o-mini
# CRASH_AI_PROVIDER=gemini   # optional force: openai | gemini | local

DISCORD_BOT_TOKEN=
DISCORD_STAFF_CHANNEL_ID=
# DISCORD_STAFF_ROLE_ID=
DISCORD_BOT_ENABLED=true
```

Optional: existing `DISCORD_STATUS_WEBHOOK_URL` still gets a mirror alert when the bot isn't ready.

## Discord bot setup

See **[DISCORD_BOT.md](./DISCORD_BOT.md)** for changelogs, tickets, and staff crash alerts.

Quick env (also in `backend/.env.example`):

```env
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=
DISCORD_STAFF_CHANNEL_ID=
DISCORD_CHANGELOG_CHANNEL_ID=
DISCORD_TICKET_CATEGORY_ID=
DISCORD_STAFF_ROLE_ID=
DISCORD_BOT_ENABLED=true
```

1. [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**
2. **Bot** → Add Bot → copy **Token** → `DISCORD_BOT_TOKEN`
3. OAuth2 → URL Generator → scopes: `bot` + `applications.commands`
4. Invite the bot into your staff server
5. Enable **Developer Mode** → copy channel / category / role IDs
6. Restart backend: `npm run payments:server` (or `cd backend && npm start`)

Verify: `GET http://localhost:8787/api/crash/health` should show:

- `discordBot` / `staffChannel` — Discord crash reports ready
- `aiConfigured: true` and `provider` of `gemini` or `openai` once a key is set (otherwise `local`)
- `links.crashReportToStaff` / `links.bugTicketAiTip` / `links.staffRemoteFix` / `links.playerStaffInbox` — product links enabled

## Client

No client-side secrets. The launcher uses `payments-config` API base (`SPACE_PAYMENTS_API` or localhost `8787` in dev).

UI: launch overlay → **AI recovery** panel next to Possible fixes.

## Security notes

- Sandbox roots: Apex Launcher `.minecraft`, natives, bin (and `userData/SpaceClient`)
- Paths outside those roots are rejected
- AI may only return the allow-listed action ids; unknown actions are ignored
