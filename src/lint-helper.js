const fs = require('fs');
const path = require('path');
const webExt = require('web-ext');

const root = __dirname;
const chromeManifest = path.join(root, 'manifest.json');
const firefoxManifest = path.join(root, 'manifest-firefox.json');
const backupManifest = path.join(root, 'manifest-chrome.bak');

async function run() {
  fs.copyFileSync(chromeManifest, backupManifest);
  fs.copyFileSync(firefoxManifest, chromeManifest);

  try {
    await webExt.cmd.lint({ sourceDir: root }, { shouldExitProgram: false });
  } finally {
    fs.copyFileSync(backupManifest, chromeManifest);
    fs.unlinkSync(backupManifest);
  }
}

run().catch(() => process.exit(1));
