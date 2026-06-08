// Controlled file writer for generated AI artifacts.
const fs = require('fs-extra');
const path = require('path');
const config = require('../config/ai.config');

function writeAiOutput(relativePath, content) {
  const outputPath = path.join(config.paths.root, config.paths.aiOutput, relativePath);
  fs.ensureDirSync(path.dirname(outputPath));
  fs.writeFileSync(outputPath, content);
  return outputPath;
}

module.exports = { writeAiOutput };
