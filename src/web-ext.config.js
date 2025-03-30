module.exports = {
  sourceDir: './',
  artifactsDir: './web-ext-artifacts',
  build: {
    overwriteDest: true,
  },
  ignoreFiles: [
    'package.json',
    'package-lock.json',
    'web-ext-config.js',
    'node_modules',
    '.git',
    '.github',
    'web-ext-artifacts',
    '*.log'
  ],
  run: {
    firefoxProfile: null,
    browserConsole: true,
  }
};