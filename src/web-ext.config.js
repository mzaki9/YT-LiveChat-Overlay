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
      'README.md',
      '.git',
      '.gitignore',
      'node_modules'
    ]
  };