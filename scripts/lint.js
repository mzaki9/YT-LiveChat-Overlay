const fs = require("node:fs");
const path = require("node:path");
const webExt = require("web-ext");

const projectRoot = path.join(__dirname, "..");
const srcDir = path.join(projectRoot, "src");
const chromeManifest = path.join(srcDir, "manifest.json");
const firefoxManifest = path.join(srcDir, "manifest-firefox.json");
const backupManifest = path.join(srcDir, "manifest-chrome.bak");

async function lint() {
  console.log("Linting Chrome manifest...");
  await webExt.cmd.lint({ sourceDir: srcDir }, { shouldExitProgram: false });

  console.log("Linting Firefox manifest...");
  fs.copyFileSync(chromeManifest, backupManifest);
  fs.copyFileSync(firefoxManifest, chromeManifest);

  try {
    await webExt.cmd.lint({ sourceDir: srcDir }, { shouldExitProgram: false });
  } finally {
    fs.copyFileSync(backupManifest, chromeManifest);
    fs.unlinkSync(backupManifest);
  }
}

lint().catch((err) => {
  console.error("Lint failed:", err);
  process.exit(1);
});
