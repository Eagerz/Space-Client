/**
 * Dev-only renderer reload hook.
 * Unpackaged builds listen on 127.0.0.1:8792 — POST/GET /reload refreshes the window
 * without killing Electron (avoids flaky SendKeys Ctrl+R).
 */

"use strict";

const http = require("http");

const HOST = "127.0.0.1";
const PORT = Number(process.env.SPACE_DEV_RELOAD_PORT || 8792);

let server = null;
let getMainWindow = () => null;

function reloadWindow() {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) {
    return { ok: false, error: "no-window" };
  }
  try {
    win.webContents.reloadIgnoringCache();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

function showUpdateToast(version = "1.0.2") {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) {
    return { ok: false, error: "no-window" };
  }
  const ver = String(version || "1.0.2").replace(/[^0-9A-Za-z._-]/g, "");
  const script = `
    (function () {
      try { localStorage.removeItem("sc-demo-update-applied"); } catch (e) {}
      if (typeof window.__spaceShowUpdateToast === "function") {
        window.__spaceShowUpdateToast(${JSON.stringify(ver)});
        return { ok: true, via: "hook" };
      }
      return { ok: false, error: "toast-hook-missing" };
    })();
  `;
  return win.webContents
    .executeJavaScript(script, true)
    .then((result) => {
      if (result && result.ok) return { ok: true, version: ver };
      return { ok: false, error: result?.error || "toast-failed", version: ver };
    })
    .catch((err) => ({ ok: false, error: err?.message || String(err) }));
}

/**
 * Dev-only: run AI crash recovery with a synthetic hard crash so staff Discord is notified.
 */
async function triggerCrashTest() {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) {
    return { ok: false, error: "no-window" };
  }
  const script = `
    (async function () {
      try {
        if (typeof window.__spaceTriggerCrashTest === "function") {
          window.__spaceTriggerCrashTest({
            logText: ${JSON.stringify(SAMPLE_CRASH_LOG)},
            exitCode: 1,
            error: "Synthetic test crash — Discord staff escalate",
            source: "test",
          });
          return { ok: true, via: "__spaceTriggerCrashTest" };
        }
        const api = window.electronAPI;
        if (!api || typeof api.runCrashRecovery !== "function") {
          return { ok: false, error: "runCrashRecovery-missing" };
        }
        const result = await api.runCrashRecovery({
          logText: ${JSON.stringify(SAMPLE_CRASH_LOG)},
          exitCode: 1,
          error: "Synthetic test crash — Discord staff escalate",
          version: "1.21.1",
          loader: "fabric",
          source: "test",
        });
        return { ok: true, via: "runCrashRecovery", result };
      } catch (err) {
        return { ok: false, error: err && err.message ? err.message : String(err) };
      }
    })();
  `;
  try {
    const result = await win.webContents.executeJavaScript(script, true);
    if (result && result.ok) return { ok: true, ...result };
    return { ok: false, error: result?.error || "crash-test-failed" };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

const SAMPLE_CRASH_LOG = `---- Minecraft Crash Report ----
// Apex Launcher Discord crash-pipeline test

Time: 2026-07-18 15:52:00
Description: Initializing game

java.lang.RuntimeException: Mixed-in class net.minecraft.client.Minecraft failed transformation
\tat net.fabricmc.loader.impl.launch.knot.KnotClassDelegate.getPostMixinClassByteArray(KnotClassDelegate.java:427)
\tat net.minecraft.client.main.Main.main(Main.java:218)
Caused by: org.spongepowered.asm.mixin.throwables.MixinApplyError: Mixin [spaceclient.mixins.json:ClientBrandRetrieverMixin] from mod space-client-core FAILED
\tat org.spongepowered.asm.mixin.transformer.MixinProcessor.handleMixinError(MixinProcessor.java:638)
Caused by: org.spongepowered.asm.mixin.injection.throwables.InvalidInjectionException: Invalid descriptor on ClientBrandRetrieverMixin
\tat org.spongepowered.asm.mixin.injection.struct.InjectionInfo.validate(InjectionInfo.java:XXX)
\t... 12 more

A detailed walkthrough of the error:
- Fabric Loader 0.16.x
- Minecraft 1.21.1
- Unknown conflicting jar in mods folder: evil-mixin-conflict-1.0.jar
- Auth session OK
- This is an intentional Apex Launcher staff-bot test crash
`;

function startDevReloadServer(getWindowFn) {
  getMainWindow = typeof getWindowFn === "function" ? getWindowFn : () => null;

  if (server) return { port: PORT };

  server = http.createServer(async (req, res) => {
    const rawUrl = String(req.url || "");
    const url = rawUrl.split("?")[0];
    const qs = new URL(rawUrl, `http://${HOST}:${PORT}`).searchParams;

    const json = (status, body) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify(body));
    };

    if (url === "/reload" || url === "/reload/") {
      const result = reloadWindow();
      json(result.ok ? 200 : 503, result);
      return;
    }

    if (url === "/show-update" || url === "/show-update/") {
      const result = await showUpdateToast(qs.get("version") || "1.0.2");
      json(result.ok ? 200 : 503, result);
      return;
    }

    if (url === "/trigger-crash" || url === "/trigger-crash/") {
      const result = await triggerCrashTest();
      json(result.ok ? 200 : 503, result);
      return;
    }

    if (url === "/health" || url === "/") {
      json(200, {
        ok: true,
        service: "space-dev-reload",
        port: PORT,
        routes: ["/reload", "/show-update", "/trigger-crash", "/health"],
      });
      return;
    }

    json(404, { ok: false, error: "not-found" });
  });

  server.on("error", (err) => {
    console.warn("[dev-reload] Server error:", err?.message || err);
  });

  server.listen(PORT, HOST, () => {
    console.info(`[dev-reload] Ready — http://${HOST}:${PORT}/reload | /show-update | /trigger-crash`);
  });

  return { port: PORT };
}

function stopDevReloadServer() {
  if (!server) return;
  try {
    server.close();
  } catch {
    /* ignore */
  }
  server = null;
}

module.exports = {
  startDevReloadServer,
  stopDevReloadServer,
  PORT,
};
