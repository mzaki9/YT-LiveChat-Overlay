const fs = require("node:fs");
const path = require("node:path");
const webExt = require("web-ext");

const projectRoot = path.join(__dirname, "..");
const srcDir = path.join(projectRoot, "src");
const defaultArtifactsDir = path.join(projectRoot, "web-ext-artifacts");

// Validate the source file structure before building
function validateFiles(manifestName) {
  const requiredFiles = [
    manifestName || "manifest.json",
    "icon.png",
    "js/utils.js",
    "js/theater-layout.js",
    "js/performance.js",
    "js/ui.js",
    "js/overlay.js",
    "js/content.js",
    "js/background.js",
    "css/styles.css",
  ];

  let allFound = true;
  for (const file of requiredFiles) {
    const filePath = path.join(srcDir, file);
    if (!fs.existsSync(filePath)) {
      console.error(`Missing required source file: ${file}`);
      allFound = false;
    }
  }

  return allFound;
}

// Remove problematic BOM characters and normalize line endings
function cleanBOMFromFiles() {
  const jsFiles = [
    "js/utils.js",
    "js/theater-layout.js",
    "js/ui.js",
    "js/overlay.js",
    "js/content.js",
    "js/performance.js",
    "js/background.js",
  ];

  const cssFiles = ["css/styles.css"];
  const jsonFiles = ["manifest.json", "manifest-firefox.json"];

  for (const file of [...jsFiles, ...cssFiles, ...jsonFiles]) {
    const filePath = path.join(srcDir, file);
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, "utf8");

      if (file.endsWith(".js") || file.endsWith(".css")) {
        content = content.replace(/\/\/\s*filepath:.+/g, "");
      }

      if (content.charCodeAt(0) === 0xfeff) {
        console.log(`Removing BOM from ${file}`);
        content = content.substring(1);
      }

      if (content.includes("\r\n")) {
        content = content.replace(/\r\n/g, "\n");
      }

      fs.writeFileSync(filePath, content, "utf8");
    }
  }
}

function copyFileToDir(relativePath, outputDir) {
  const source = path.join(srcDir, relativePath);
  const destination = path.join(outputDir, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function buildUnpacked(target) {
  const outputDir = path.join(
    defaultArtifactsDir,
    target === "firefox" ? "firefox-unpacked" : "chrome-unpacked",
  );
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const files = [
    "icon.png",
    "css/styles.css",
    "js/background.js",
    "js/content.js",
    "js/overlay.js",
    "js/performance.js",
    "js/theater-layout.js",
    "js/ui.js",
    "js/utils.js",
  ];

  const manifestSource =
    target === "firefox" ? "manifest-firefox.json" : "manifest.json";
  copyFileToDir(manifestSource, outputDir);
  if (manifestSource !== "manifest.json") {
    fs.renameSync(
      path.join(outputDir, manifestSource),
      path.join(outputDir, "manifest.json"),
    );
  }

  for (const file of files) {
    copyFileToDir(file, outputDir);
  }

  if (target !== "firefox") {
    const chromeManifestPath = path.join(outputDir, "manifest.json");
    if (fs.existsSync(chromeManifestPath)) {
      const chromeManifest = JSON.parse(
        fs.readFileSync(chromeManifestPath, "utf8"),
      );
      chromeManifest.background = { service_worker: "js/background.js" };
      delete chromeManifest.browser_specific_settings;
      fs.writeFileSync(
        chromeManifestPath,
        JSON.stringify(chromeManifest, null, 2),
      );
    }
  }

  return outputDir;
}

function restoreManifest(target, manifestBak) {
  if (target === "firefox" && fs.existsSync(manifestBak)) {
    const chromeManifest = path.join(srcDir, "manifest.json");
    fs.copyFileSync(manifestBak, chromeManifest);
    fs.unlinkSync(manifestBak);
  }
}

async function buildTarget(target) {
  const targetManifest =
    target === "firefox" ? "manifest-firefox.json" : "manifest.json";

  console.log(`Building for ${target} (manifest: ${targetManifest})...`);

  const manifestBak = path.join(srcDir, "manifest-chrome.bak");

  if (target === "firefox") {
    if (!fs.existsSync(path.join(srcDir, "manifest-firefox.json"))) {
      throw new Error("manifest-firefox.json not found in src/");
    }
    fs.copyFileSync(path.join(srcDir, "manifest.json"), manifestBak);
    fs.copyFileSync(
      path.join(srcDir, "manifest-firefox.json"),
      path.join(srcDir, "manifest.json"),
    );
  }

  try {
    if (!validateFiles(targetManifest)) {
      throw new Error("File validation failed.");
    }

    cleanBOMFromFiles();

    const buildOpts = {
      sourceDir: srcDir,
      artifactsDir: defaultArtifactsDir,
      overwriteDest: true,
      filename:
        target === "chrome"
          ? "youtube_live_chat_overlay-chrome-{version}.zip"
          : "youtube_live_chat_overlay-firefox-{version}.zip",
    };

    const manifestPath = path.join(srcDir, "manifest.json");
    if (fs.existsSync(manifestPath)) {
      const pkgManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (pkgManifest.version && buildOpts.filename) {
        const expectedFile = path.join(
          defaultArtifactsDir,
          buildOpts.filename.replace("{version}", pkgManifest.version),
        );
        if (fs.existsSync(expectedFile)) {
          fs.unlinkSync(expectedFile);
        }
      }
    }

    await webExt.cmd.build(buildOpts, { shouldExitProgram: false });
    const unpackedDir = buildUnpacked(target);
    console.log(
      `${target === "firefox" ? "Firefox" : "Chrome"} unpacked ready: ${unpackedDir}`,
    );

    const latestFile = fs
      .readdirSync(defaultArtifactsDir)
      .filter((f) => f.includes(target) && f.endsWith(".zip"))
      .sort((a, b) => {
        return (
          fs.statSync(path.join(defaultArtifactsDir, b)).mtime.getTime() -
          fs.statSync(path.join(defaultArtifactsDir, a)).mtime.getTime()
        );
      })[0];

    if (latestFile) {
      const stats = fs.statSync(path.join(defaultArtifactsDir, latestFile));
      const fileSizeKB = (stats.size / 1024).toFixed(2);
      console.log(`Package: ${latestFile} (${fileSizeKB} KB)`);
    }
  } finally {
    restoreManifest(target, manifestBak);
  }
}

async function run() {
  const targetArg = process.argv[2];
  try {
    fs.mkdirSync(defaultArtifactsDir, { recursive: true });
    if (targetArg === "chrome") {
      await buildTarget("chrome");
    } else if (targetArg === "firefox") {
      await buildTarget("firefox");
    } else {
      await buildTarget("chrome");
      await buildTarget("firefox");
    }
    console.log("\nBuild successful!");
  } catch (error) {
    console.error("Build failed:", error.message);
    process.exit(1);
  }
}

run();
