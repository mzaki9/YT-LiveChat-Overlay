const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Check for needed dependencies
try {
  console.log('Checking for web-ext...');
  execSync('npx web-ext --version', { stdio: 'inherit' });
} catch (error) {
  console.error('web-ext not found, installing...');
  execSync('npm install web-ext --save-dev', { stdio: 'inherit' });
}

// Validate the file structure before building
function validateFiles() {
  const requiredFiles = [
    'manifest.json',
    'icon.png',
    'js/utils.js',
    'js/ui.js',
    'js/chat.js',
    'js/overlay.js',
    'js/content.js',
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
    'js/chat.js',
    'js/overlay.js',
    'js/content.js',
  ];
  
  const cssFiles = [
    'css/styles.css'
  ];
  
  const jsonFiles = [
    'manifest.json'
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

// Build process
async function build() {
  console.log('Validating file structure...');
  if (!validateFiles()) {
    console.error('File validation failed. Please fix the issues above.');
    process.exit(1);
  }
  
  console.log('Cleaning files...');
  cleanBOMFromFiles();
  
  console.log('Building extension...');
  try {
    execSync('npx web-ext build --overwrite-dest', { stdio: 'inherit' });
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
      
      // Check if file size is too small (likely corrupted)
      if (stats.size < 5000) {
        console.warn('⚠️ Warning: The build file is very small, which might indicate a problem.');
      }
    }
  } catch (error) {
    console.error('Build failed:', error.message);
    process.exit(1);
  }
}

build();