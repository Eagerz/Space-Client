/**
 * Stardust session tracker — AFK-resistant active play detection.
 * Samples every 60s while Minecraft is running:
 *   - process alive
 *   - foreground window title contains "Minecraft"
 *   - system idle below 5 minutes (keyboard/mouse activity)
 */
const { spawn } = require("child_process");
const crypto = require("crypto");
const { signProgressionJwt } = require("./progression-jwt");
const paymentsConfig = require("./payments-config");

const HEARTBEAT_MS = 60 * 1000;
const SYNC_MS = 10 * 60 * 1000;
const AFK_IDLE_MS = 5 * 60 * 1000;

let session = null;
let heartbeatTimer = null;
let syncTimer = null;
let activityProbe = null;

function newSessionId() {
  return crypto.randomUUID();
}

function getWindowsActivitySnapshot() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") {
      const { execSync } = require("child_process");
      try {
        const out =
          process.platform === "darwin"
            ? execSync("ps -A -o comm= | grep -i java || true", { encoding: "utf8" })
            : execSync("pgrep -af minecraft || pgrep -af java || true", { encoding: "utf8" });
        const running = /java|minecraft/i.test(out);
        resolve({ minecraftFocused: running, idleMs: running ? 0 : AFK_IDLE_MS + 1 });
      } catch {
        resolve({ minecraftFocused: true, idleMs: 0 });
      }
      return;
    }

    const ps = spawn(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinAct {
  [StructLayout(LayoutKind.Sequential)] struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  public static string Snapshot() {
    var lii = new LASTINPUTINFO(); lii.cbSize = (uint)System.Runtime.InteropServices.Marshal.SizeOf(lii);
    GetLastInputInfo(ref lii);
    uint idle = (uint)Environment.TickCount - lii.dwTime;
    var sb = new StringBuilder(256);
    GetWindowText(GetForegroundWindow(), sb, 256);
    return idle.ToString() + "|" + sb.ToString();
  }
}
'@
$s = [WinAct]::Snapshot()
$parts = $s -split '\\|', 2
$idle = [int]$parts[0]
$title = $parts[1]
$mc = $title -match 'Minecraft'
Write-Output ($idle.ToString() + ',' + [int]$mc)
`.replace(/\n/g, " "),
      ],
      { windowsHide: true }
    );

    let out = "";
    ps.stdout.on("data", (d) => {
      out += String(d);
    });
    ps.on("close", () => {
      const line = out.trim().split(/\r?\n/).pop() || "999999,0";
      const [idleStr, mcStr] = line.split(",");
      const idleMs = Number(idleStr) || AFK_IDLE_MS + 1;
      const minecraftFocused = mcStr === "1";
      resolve({ minecraftFocused, idleMs });
    });
    ps.on("error", () => resolve({ minecraftFocused: false, idleMs: AFK_IDLE_MS + 1 }));
    setTimeout(() => {
      try {
        ps.kill();
      } catch {
        /* ignore */
      }
      resolve({ minecraftFocused: false, idleMs: AFK_IDLE_MS + 1 });
    }, 8000);
  });
}

async function probeActivity() {
  if (!session) return false;
  const snap = await getWindowsActivitySnapshot();
  const active =
    snap.minecraftFocused && snap.idleMs < AFK_IDLE_MS;
  session.heartbeats.push({ t: Date.now(), a: active ? 1 : 0 });
  session.lastActive = active;
  return active;
}

async function postSync(final = false) {
  if (!session?.uuid) return { success: false, error: "No session" };

  const end = final ? Date.now() : Date.now();
  const token = signProgressionJwt(
    {
      sub: session.uuid,
      sid: session.sessionId,
      typ: "sync",
      start: session.startedAt,
      end,
      inst: session.instanceId || "",
      hb: session.heartbeats.slice(),
      crashed: Boolean(session.crashed),
      username: session.username || "",
    },
    600
  );

  const apiBase = paymentsConfig.getApiBase();
  try {
    const res = await fetch(`${apiBase}/api/v1/progression/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: data.error || res.statusText };
    }
    if (!final) {
      session.heartbeats = session.heartbeats.slice(-5);
    }
    return { success: true, ...data };
  } catch (err) {
    return { success: false, error: err?.message || "Sync failed" };
  }
}

function startSession({ uuid, instanceId, username }) {
  stopSession({ sync: false });
  if (!uuid) return { success: false, error: "Not logged in" };

  session = {
    uuid: String(uuid).replace(/-/g, "").toLowerCase(),
    username: username || "",
    instanceId: instanceId || null,
    sessionId: newSessionId(),
    startedAt: Date.now(),
    heartbeats: [],
    crashed: false,
    lastActive: false,
  };

  heartbeatTimer = setInterval(() => {
    probeActivity().catch(() => {});
  }, HEARTBEAT_MS);

  syncTimer = setInterval(() => {
    postSync(false).catch(() => {});
  }, SYNC_MS);

  probeActivity().catch(() => {});
  return { success: true, sessionId: session.sessionId };
}

async function stopSession({ crashed = false, sync = true } = {}) {
  if (!session) return { success: true };

  session.crashed = Boolean(crashed);
  clearInterval(heartbeatTimer);
  clearInterval(syncTimer);
  heartbeatTimer = null;
  syncTimer = null;

  await probeActivity().catch(() => {});

  let result = { success: true };
  if (sync) {
    result = await postSync(true);
  }
  session = null;
  return result;
}

function getSessionStatus() {
  if (!session) {
    return { active: false, heartbeats: 0, lastActive: false };
  }
  return {
    active: true,
    sessionId: session.sessionId,
    startedAt: session.startedAt,
    heartbeats: session.heartbeats.length,
    lastActive: session.lastActive,
    elapsedMs: Date.now() - session.startedAt,
  };
}

async function claimCosmetic({ uuid, itemId }) {
  const id = String(uuid || "").replace(/-/g, "").toLowerCase();
  if (!id || !itemId) return { success: false, error: "Missing uuid or itemId" };

  const token = signProgressionJwt(
    { sub: id, typ: "claim", itemId: String(itemId) },
    120
  );
  const apiBase = paymentsConfig.getApiBase();
  try {
    const res = await fetch(`${apiBase}/api/v1/shop/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: data.error || res.statusText };
    return { success: true, ...data };
  } catch (err) {
    return { success: false, error: err?.message || "Claim failed" };
  }
}

async function fetchProgression(uuid) {
  const id = String(uuid || "").replace(/-/g, "").toLowerCase();
  if (!id) return null;
  const apiBase = paymentsConfig.getApiBase();
  try {
    const res = await fetch(`${apiBase}/api/v1/progression/${id}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function fetchShopCatalog() {
  const apiBase = paymentsConfig.getApiBase();
  try {
    const res = await fetch(`${apiBase}/api/v1/shop/catalog`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.items) && data.items.length) return data;
    }
  } catch {
    /* fall through to local catalog */
  }
  try {
    const { getShopCatalog } = require("./backend/lib/cosmic-shop-catalog");
    const { STARDUST_PER_CREDIT } = require("./backend/lib/progression-config");
    return {
      items: getShopCatalog(),
      economy: { stardustPerCredit: STARDUST_PER_CREDIT },
      source: "local",
    };
  } catch {
    return { items: [] };
  }
}

module.exports = {
  startSession,
  stopSession,
  getSessionStatus,
  claimCosmetic,
  fetchProgression,
  fetchShopCatalog,
  postSync,
};
