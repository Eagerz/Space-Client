/**
 * Optional GitHub backup for diagnostic archives (env-gated, off by default).
 * Primary truth remains on local API disk.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const diagnosticsStore = require("./diagnostics-store");

function backupEnabled() {
  return String(process.env.SPACE_CLOUD_GH_BACKUP || "").trim() === "1";
}

function githubToken() {
  return String(process.env.SPACE_CLOUD_GH_TOKEN || process.env.GITHUB_TOKEN || "").trim();
}

function backupRepo() {
  return String(process.env.SPACE_CLOUD_GH_REPO || "").trim(); // owner/repo
}

/**
 * Upload a diagnostic folder as a GitHub Release asset (or gist fallback note).
 * Uses Releases API: creates/updates a release tag `diagnostics-backup` and uploads a zip-like text bundle.
 * @param {string} crashId
 */
async function backupDiagnostic(crashId) {
  if (!backupEnabled()) {
    return { ok: false, skipped: "disabled" };
  }
  const token = githubToken();
  const repo = backupRepo();
  if (!token || !repo) {
    return { ok: false, skipped: "missing_token_or_repo" };
  }

  const archive = diagnosticsStore.getArchivePaths(crashId);
  if (!archive) {
    return { ok: false, error: "diagnostic_not_found" };
  }

  const parts = [];
  for (const file of archive.files) {
    const name = path.basename(file);
    let body = "";
    try {
      body = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    parts.push(`===== ${name} =====\n${body.slice(0, 400_000)}`);
  }
  const bundle = parts.join("\n\n").slice(0, 900_000);
  const assetName = `diagnostic-${archive.id}.txt`;

  try {
    const release = await ensureBackupRelease(repo, token);
    if (!release?.ok) return release;

    // Delete existing asset with same name if present
    const assets = release.assets || [];
    const existing = assets.find((a) => a.name === assetName);
    if (existing?.id) {
      await fetch(
        `https://api.github.com/repos/${repo}/releases/assets/${existing.id}`,
        {
          method: "DELETE",
          headers: ghHeaders(token),
        }
      ).catch(() => {});
    }

    const uploadUrl = String(release.uploadUrl || "").replace(/\{(\?[^}]+)\}/, "");
    const uploadRes = await fetch(
      `${uploadUrl}?name=${encodeURIComponent(assetName)}`,
      {
        method: "POST",
        headers: {
          ...ghHeaders(token),
          "Content-Type": "text/plain",
          "Content-Length": String(Buffer.byteLength(bundle, "utf8")),
        },
        body: bundle,
      }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => "");
      return {
        ok: false,
        error: `upload_${uploadRes.status}`,
        detail: errText.slice(0, 200),
      };
    }

    const asset = await uploadRes.json();
    const info = {
      at: new Date().toISOString(),
      repo,
      releaseId: release.id,
      assetId: asset.id,
      url: asset.browser_download_url || asset.url || null,
    };
    diagnosticsStore.markGithubBackup(archive.id, info);
    return { ok: true, ...info };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "space-cloud-backup",
  };
}

async function ensureBackupRelease(repo, token) {
  const tag = String(process.env.SPACE_CLOUD_GH_TAG || "diagnostics-backup").trim();
  const listRes = await fetch(
    `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`,
    { headers: ghHeaders(token) }
  );

  if (listRes.ok) {
    const rel = await listRes.json();
    return {
      ok: true,
      id: rel.id,
      uploadUrl: rel.upload_url,
      assets: rel.assets || [],
    };
  }

  if (listRes.status !== 404) {
    const t = await listRes.text().catch(() => "");
    return { ok: false, error: `release_fetch_${listRes.status}`, detail: t.slice(0, 200) };
  }

  const createRes = await fetch(`https://api.github.com/repos/${repo}/releases`, {
    method: "POST",
    headers: { ...ghHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      tag_name: tag,
      name: "Space Cloud diagnostics backup",
      body: "Automated sanitized diagnostic archives from api.spaceclient.app (Space Cloud). Primary store is local API disk.",
      draft: false,
      prerelease: true,
    }),
  });

  if (!createRes.ok) {
    const t = await createRes.text().catch(() => "");
    return { ok: false, error: `release_create_${createRes.status}`, detail: t.slice(0, 200) };
  }

  const rel = await createRes.json();
  return {
    ok: true,
    id: rel.id,
    uploadUrl: rel.upload_url,
    assets: rel.assets || [],
  };
}

module.exports = {
  backupEnabled,
  backupDiagnostic,
};
