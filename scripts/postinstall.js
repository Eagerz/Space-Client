const { downloadArtifact } = require("@electron/get");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const electronDir = path.join(__dirname, "..", "node_modules", "electron");
const { version } = require(path.join(electronDir, "package.json"));
const distDir = path.join(electronDir, "dist");
const pathFile = path.join(electronDir, "path.txt");
const platformPath = process.platform === "win32" ? "electron.exe" : "electron";

function isInstalled() {
  try {
    const electronPath = path.join(distDir, platformPath);
    if (!fs.existsSync(electronPath)) return false;
    return fs.readFileSync(pathFile, "utf-8").trim() === platformPath;
  } catch {
    return false;
  }
}

async function extractZip(zipPath, destination) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });

  if (process.platform === "win32") {
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: "inherit" }
    );
    return;
  }

  const extract = require("extract-zip");
  await extract(zipPath, { dir: destination });
}

async function installElectron() {
  if (isInstalled()) {
    console.log("Electron runtime already installed.");
    return;
  }

  console.log(`Installing Electron ${version} runtime...`);

  const zipPath = await downloadArtifact({
    version,
    artifactName: "electron",
    platform: process.platform,
    arch: process.arch,
  });

  await extractZip(zipPath, distDir);
  fs.writeFileSync(pathFile, platformPath, "utf8");

  console.log("Electron runtime installed successfully.");
}

installElectron().catch((error) => {
  console.error("Failed to install Electron runtime:", error);
  process.exit(1);
});
