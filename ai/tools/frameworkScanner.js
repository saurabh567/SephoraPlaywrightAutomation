// Scans the existing Cucumber Playwright framework and returns compact context for agents.
const fs = require('fs-extra');
const path = require('path');
const config = require('../config/ai.config');

const textExtensions = new Set(['.js', '.json', '.feature', '.md', '.yml', '.yaml', '.groovy']);

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath);
    return [fullPath];
  });
}

function readIfText(filePath) {
  if (!textExtensions.has(path.extname(filePath))) return null;
  return fs.readFileSync(filePath, 'utf8');
}

function scanFramework() {
  const root = config.paths.root;
  const targetDirs = [
    config.paths.features,
    config.paths.stepDefinitions,
    config.paths.pages,
    'hooks',
    'config',
    'utils',
    config.paths.testData,
    '.github'
  ];
  const rootFiles = ['package.json', 'cucumber.js', 'playwright.config.js', 'Jenkinsfile', 'README.md'];
  const files = [
    ...rootFiles.filter((file) => fs.existsSync(path.join(root, file))).map((file) => path.join(root, file)),
    ...targetDirs.flatMap((dir) => listFiles(path.join(root, dir)))
  ];

  const documents = files
    .map((filePath) => {
      const content = readIfText(filePath);
      if (content === null) return null;
      return {
        path: path.relative(root, filePath),
        content
      };
    })
    .filter(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    fileCount: documents.length,
    files: documents,
    summary: {
      framework: 'Playwright + JavaScript + Cucumber BDD + Page Object Model',
      runner: 'cucumber-js',
      pageObjectDir: config.paths.pages,
      featureDir: config.paths.features,
      stepDefinitionDir: config.paths.stepDefinitions
    }
  };
}

module.exports = { scanFramework };
