const fs = require('fs');
const path = require('path');
const webExt = require('web-ext');

// Validate the file structure before building
function validateFiles(manifestName) {
  const requiredFiles = [
    manifestName || 'manifest.json',
    'icon.png',
    'js/utils.js',
    'js/performance.js',
    'js/ui.js',
    'js/overlay.js',
    'js/content.js',
    'js/background.js',
    'css/styles.css'
  ];
  
  let allFound = true;
  for (const file of requiredFiles) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
      console.error(`Missing required file: ${file}`);
      allFound = false;
    }
  }
  
  return allFound;
}

// Remove any potential problematic BOM characters from files
function cleanBOMFromFiles() {
  const jsFiles = [
    'js/utils.js',
    'js/ui.js',
    'js/overlay.js',
    'js/content.js',
  ];
  
  const cssFiles = [
    'css/styles.css'
  ];
  
  const jsonFiles = [
    'manifest.json',
    'manifest-firefox.json'
  ];
  
  // Check and clean JavaScript files
  for (const file of [...jsFiles, ...cssFiles, ...jsonFiles]) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Remove "filepath:" comments that might be added by code editors
      if (file.endsWith('.js') || file.endsWith('.css')) {
        content = content.replace(/\/\/\s*filepath:.+/g, '');
      }
      
      // Remove Byte Order Marks which can cause issues
      if (content.charCodeAt(0) === 0xFEFF) {
        console.log(`Removing BOM from ${file}`);
        content = content.substring(1);
      }
      
      // Check for and fix line endings
      if (content.includes('\r\n')) {
        console.log(`Converting CRLF to LF in ${file}`);
        content = content.replace(/\r\n/g, '\n');
      }
      
      // Write clean content back
      fs.writeFileSync(filePath, content, 'utf8');
    }
  }
}

function copyFileToDir(relativePath, outputDir) {
  const source = path.join(__dirname, relativePath);
  const destination = path.join(outputDir, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function buildUnpacked(target) {
  const outputDir = path.join(__dirname, 'web-ext-artifacts', target === 'firefox' ? 'firefox-unpacked' : 'chrome-unpacked');
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const files = [
    'icon.png',
    'css/styles.css',
    'js/background.js',
    'js/content.js',
    'js/overlay.js',
    'js/performance.js',
    'js/ui.js',
    'js/utils.js'
  ];

  const manifestSource = target === 'firefox' ? 'manifest-firefox.json' : 'manifest.json';
  copyFileToDir(manifestSource, outputDir);
  if (manifestSource !== 'manifest.json') {
    fs.renameSync(path.join(outputDir, manifestSource), path.join(outputDir, 'manifest.json'));
  }

  for (const file of files) {
    copyFileToDir(file, outputDir);
  }

  return outputDir;
}

// Build process
async function build(target) {
  const targetManifest = target === 'firefox' ? 'manifest-firefox.json' : 'manifest.json';
  
  console.log(`Building for ${target || 'default'} (manifest: ${targetManifest})...`);
  
  // For Firefox, swap manifests
  if (target === 'firefox') {
    if (!fs.existsSync(path.join(__dirname, 'manifest-firefox.json'))) {
      console.error('manifest-firefox.json not found!');
      process.exit(1);
    }
    // Backup current manifest and swap
    fs.copyFileSync(path.join(__dirname, 'manifest.json'), path.join(__dirname, 'manifest-chrome.bak'));
    fs.copyFileSync(path.join(__dirname, 'manifest-firefox.json'), path.join(__dirname, 'manifest.json'));
  }
  
  console.log('Validating file structure...');
  if (!validateFiles(targetManifest)) {
    console.error('File validation failed. Please fix the issues above.');
    process.exit(1);
  }
  
  console.log('Cleaning files...');
  cleanBOMFromFiles();
  
  const manifestBak = path.join(__dirname, 'manifest-chrome.bak');
  
  console.log('Building extension...');
  try {
    const defaultArtifactsDir = path.join(__dirname, 'web-ext-artifacts');
    const buildOpts = {
      sourceDir: __dirname,
      artifactsDir: defaultArtifactsDir,
      overwriteDest: true,
    };
    
    if (target === 'chrome') {
      buildOpts.filename = 'youtube_live_chat_overlay-chrome-{version}.zip';
    } else if (target === 'firefox') {
      buildOpts.filename = 'youtube_live_chat_overlay-firefox-{version}-test6.zip';
    }
    
    await webExt.cmd.build(buildOpts, { shouldExitProgram: false });
    if (target === 'chrome' || target === 'default' || target === 'firefox') {
      const unpackedDir = buildUnpacked(target);
      console.log(`${target === 'firefox' ? 'Firefox' : 'Chrome'} unpacked extension ready: ${unpackedDir}`);
    }
    
    console.log(`\n✅ Build successful! Extension file created in web-ext-artifacts folder.`);
    
    // Show the file size to verify it's not corrupted
    const artifactsDir = path.join(__dirname, 'web-ext-artifacts');
    const files = fs.readdirSync(artifactsDir);
    const latestFile = files
      .filter(f => f.endsWith('.zip'))
      .sort((a, b) => {
        return fs.statSync(path.join(artifactsDir, b)).mtime.getTime() - 
               fs.statSync(path.join(artifactsDir, a)).mtime.getTime();
      })[0];
    
    if (latestFile) {
      const stats = fs.statSync(path.join(artifactsDir, latestFile));
      const fileSizeKB = (stats.size / 1024).toFixed(2);
      console.log(`File: ${latestFile} (${fileSizeKB} KB)`);
      
      if (stats.size < 5000) {
        console.warn('⚠️ Warning: The build file is very small, which might indicate a problem.');
      }
    }
  } catch (error) {
    console.error('Build failed:', error.message);
    throw error; // Re-throw so cleanup happens in outer try/finally
  } finally {
    // Restore Chrome manifest if we swapped
    restoreManifest(target, manifestBak);
  }
}

function restoreManifest(target, manifestBak) {
  if (target === 'firefox' && fs.existsSync(manifestBak)) {
    const srcManifest = path.join(__dirname, 'manifest.json');
    fs.copyFileSync(manifestBak, srcManifest);
    fs.unlinkSync(manifestBak);
    console.log('Restored Chrome manifest.');
  }
}

async function run() {
  const target = process.argv[2] || 'default';
  try {
    await build(target);
  } catch (error) {
    process.exit(1);
  }
}

run();

