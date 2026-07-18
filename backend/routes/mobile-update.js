"use strict";

/**
 * Serves the Space Bedrock Android in-app update manifest.
 *
 * Prefer MOBILE_ANDROID_UPDATE_JSON (full JSON string) or MOBILE_ANDROID_UPDATE_URL
 * (upstream mirror). Falls back to synthesizing from MOBILE_ANDROID_APK_URL + version.
 */
function createMobileUpdateRouter() {
  const express = require("express");
  const router = express.Router();

  router.get("/mobile/android-update.json", async (_req, res) => {
    try {
      const inline = process.env.MOBILE_ANDROID_UPDATE_JSON?.trim();
      if (inline) {
        const parsed = JSON.parse(inline);
        return res.json(parsed);
      }

      const upstream = process.env.MOBILE_ANDROID_UPDATE_URL?.trim();
      if (upstream) {
        const r = await fetch(upstream, {
          headers: { Accept: "application/json" },
        });
        if (!r.ok) {
          return res.status(502).json({ error: `Upstream manifest HTTP ${r.status}` });
        }
        const data = await r.json();
        return res.json(data);
      }

      const apkUrl = process.env.MOBILE_ANDROID_APK_URL?.trim();
      const version = process.env.MOBILE_ANDROID_VERSION?.trim() || "0.0.0";
      const versionCode = Number(process.env.MOBILE_ANDROID_VERSION_CODE || 0);
      if (apkUrl && versionCode > 0) {
        return res.json({
          "android-arm64": {
            version,
            versionCode,
            apkUrl,
            sha256: process.env.MOBILE_ANDROID_APK_SHA256 || undefined,
          },
        });
      }

      return res.status(404).json({
        error:
          "Android update manifest not configured. Set MOBILE_ANDROID_UPDATE_JSON, MOBILE_ANDROID_UPDATE_URL, or MOBILE_ANDROID_APK_URL + VERSION_CODE.",
      });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Manifest error" });
    }
  });

  return router;
}

module.exports = { createMobileUpdateRouter };
