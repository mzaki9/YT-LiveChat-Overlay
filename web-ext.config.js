module.exports = {
  sourceDir: "./src",
  artifactsDir: "./web-ext-artifacts",
  build: {
    overwriteDest: true,
  },
  ignoreFiles: [
    "package.json",
    "package-lock.json",
    "node_modules",
    ".git",
    ".github",
    "*.log",
  ],
  run: {
    firefoxProfile: null,
    browserConsole: true,
  },
};
