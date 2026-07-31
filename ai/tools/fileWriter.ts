import fs from 'fs-extra';
import path from 'path';
import config from '../config/ai.config';
// Controlled file writer for generated AI artifacts.

function writeAiOutput(relativePath: any, content: any) {
  const outputPath = path.join(config.paths.root, config.paths.aiOutput, relativePath);
  fs.ensureDirSync(path.dirname(outputPath));
  fs.writeFileSync(outputPath, content);
  return outputPath;
}

export { writeAiOutput };
export default { writeAiOutput: writeAiOutput };
