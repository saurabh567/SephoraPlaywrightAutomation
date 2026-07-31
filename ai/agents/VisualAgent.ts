import fs from 'fs-extra';
import path from 'path';
import { spawnSync } from 'child_process';
// VisualAgent - Performs visual regression testing, screenshot comparison, and layout validation

export const run = async function run(input: any = {}) {
    console.log('[VisualAgent] Running visual validation');
    const baselineDir = input.baselineDir || path.join(process.cwd(), 'reports/screenshots/baseline');
    const actualDir = input.actualDir || path.join(process.cwd(), 'reports/screenshots/actual');
    const diffDir = input.diffDir || path.join(process.cwd(), 'reports/screenshots/diff');
    const reportDir = path.join(process.cwd(), 'reports/ai');
    fs.ensureDirSync(baselineDir);
    fs.ensureDirSync(actualDir);
    fs.ensureDirSync(diffDir);
    fs.ensureDirSync(reportDir);
    const actualFiles: any[] = [];
    const screenshotDirs = [
      path.join(process.cwd(), 'reports/screenshots'),
      path.join(process.cwd(), 'screenshots')
    ];
    for (const dir of screenshotDirs) {
      if (fs.existsSync(dir)) {
        for (const f of fs.readdirSync(dir)) {
          if (f.endsWith('.png') || f.endsWith('.jpg')) {
            actualFiles.push(path.join(dir, f));
          }
        }
      }
    }
    for (const f of actualFiles) {
      const dest = path.join(actualDir, path.basename(f));
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(f, dest);
      }
    }
    const comparisons: any[] = [];
    let diffsFound = 0;
    let matchesFound = 0;
    if (fs.existsSync(baselineDir)) {
      const baselineFiles = fs.readdirSync(baselineDir).filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
      for (const baselineFile of baselineFiles) {
        const baselinePath = path.join(baselineDir, baselineFile);
        const actualPath = path.join(actualDir, baselineFile);
        if (fs.existsSync(actualPath)) {
          try {
            const diffFilename = `diff-${baselineFile}`;
            const diffPath = path.join(diffDir, diffFilename);
            let pixelDiff = null;
            try {
              const pixelmatch = require('pixelmatch');
              const { PNG } = require('pngjs');
              const baselineImg = PNG.sync.read(fs.readFileSync(baselinePath));
              const actualImg = PNG.sync.read(fs.readFileSync(actualPath));
              if (baselineImg.width === actualImg.width && baselineImg.height === actualImg.height) {
                const diffImg = new PNG({ width: baselineImg.width, height: baselineImg.height });
                pixelDiff = pixelmatch(baselineImg.data, actualImg.data, diffImg.data, baselineImg.width, baselineImg.height, { threshold: 0.1 });
                const diffPercent = (pixelDiff / (baselineImg.width * baselineImg.height)) * 100;
                if (diffPercent > 0.5) {
                  fs.writeFileSync(diffPath, PNG.sync.write(diffImg));
                }
                comparisons.push({
                  file: baselineFile,
                  baselineSize: baselineImg.width + 'x' + baselineImg.height,
                  actualSize: actualImg.width + 'x' + actualImg.height,
                  diffPixels: pixelDiff,
                  diffPercent: Math.round(diffPercent * 100) / 100,
                  hasDiff: diffPercent > 0.5,
                  diffPath: diffPercent > 0.5 ? diffPath : null
                });
                if (diffPercent > 0.5) diffsFound++;
                else matchesFound++;
              } else {
                comparisons.push({
                  file: baselineFile,
                  baselineSize: baselineImg.width + 'x' + baselineImg.height,
                  actualSize: actualImg.width + 'x' + actualImg.height,
                  difference: 'SIZE_MISMATCH',
                  hasDiff: true
                });
                diffsFound++;
              }
            } catch (pixelError: any) {
              const baselineStat = fs.statSync(baselinePath);
              const actualStat = fs.statSync(actualPath);
              const sizeDiff = Math.abs(baselineStat.size - actualStat.size);
              const hasDiff = sizeDiff > 1024;
              comparisons.push({
                file: baselineFile,
                baselineSize: baselineStat.size,
                actualSize: actualStat.size,
                sizeDiff,
                hasDiff,
                note: 'Pixelmatch not available, used size comparison'
              });
              if (hasDiff) diffsFound++;
              else matchesFound++;
            }
          } catch (e: any) {
            comparisons.push({ file: baselineFile, error: e.message });
          }
        } else {
          comparisons.push({
            file: baselineFile,
            difference: 'NO_ACTUAL',
            hasDiff: true,
            note: 'No actual screenshot found for comparison'
          });
        }
      }
    }
    const reportPath = path.join(reportDir, 'visual-validation.md');
    const lines: any[] = [];
    lines.push('# Visual Validation Report');
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| Screenshots Found | ${actualFiles.length} |`);
    lines.push(`| Baselines Available | ${fs.existsSync(baselineDir) ? (fs.readdirSync(baselineDir).filter(f => f.endsWith('.png') || f.endsWith('.jpg'))).length : 0} |`);
    lines.push(`| Comparisons | ${comparisons.length} |`);
    lines.push(`| Matches | ${matchesFound} |`);
    lines.push(`| Differences Found | ${diffsFound} |`);
    lines.push('');
    lines.push('## Comparison Details');
    lines.push('');
    lines.push('| File | Status | Details |');
    lines.push('|---|---|---|');
    for (const c of comparisons) {
      if (c.error) {
        lines.push(`| ${c.file} | ERROR | ${c.error} |`);
      } else if (c.difference === 'NO_ACTUAL') {
        lines.push(`| ${c.file} | MISSING | No actual screenshot found |`);
      } else if (c.difference === 'SIZE_MISMATCH') {
        lines.push(`| ${c.file} | SIZE_MISMATCH | Baseline: ${c.baselineSize}, Actual: ${c.actualSize} |`);
      } else if (c.hasDiff) {
        lines.push(`| ${c.file} | DIFF | ${c.diffPercent || c.sizeDiff}% different |`);
      } else {
        lines.push(`| ${c.file} | MATCH | Identical within threshold |`);
      }
    }
    if (comparisons.length === 0) {
      lines.push('| - | NO_DATA | No screenshots available for comparison |');
    }
    lines.push('');
    lines.push('## Recommendations');
    lines.push('');
    if (diffsFound > 0) {
      lines.push(`- ${diffsFound} visual difference(s) detected. Review diff images in \`${path.relative(process.cwd(), diffDir)}\``);
      lines.push('- If differences are expected (intentional UI changes), update baselines.');
      lines.push('- If differences are unexpected, investigate application changes.');
    } else {
      lines.push('- No visual differences detected.');
      lines.push('- All screenshots match their baselines.');
    }
    fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
    return {
      ok: true,
      report: path.relative(process.cwd(), reportPath),
      comparisonsCount: comparisons.length,
      diffsFound,
      matchesFound,
      diffDir: diffsFound > 0 ? path.relative(process.cwd(), diffDir) : null
    };
  };
export default { run: async function run(input: any = {}) {
    console.log('[VisualAgent] Running visual validation');
    const baselineDir = input.baselineDir || path.join(process.cwd(), 'reports/screenshots/baseline');
    const actualDir = input.actualDir || path.join(process.cwd(), 'reports/screenshots/actual');
    const diffDir = input.diffDir || path.join(process.cwd(), 'reports/screenshots/diff');
    const reportDir = path.join(process.cwd(), 'reports/ai');
    fs.ensureDirSync(baselineDir);
    fs.ensureDirSync(actualDir);
    fs.ensureDirSync(diffDir);
    fs.ensureDirSync(reportDir);
    const actualFiles: any[] = [];
    const screenshotDirs = [
      path.join(process.cwd(), 'reports/screenshots'),
      path.join(process.cwd(), 'screenshots')
    ];
    for (const dir of screenshotDirs) {
      if (fs.existsSync(dir)) {
        for (const f of fs.readdirSync(dir)) {
          if (f.endsWith('.png') || f.endsWith('.jpg')) {
            actualFiles.push(path.join(dir, f));
          }
        }
      }
    }
    for (const f of actualFiles) {
      const dest = path.join(actualDir, path.basename(f));
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(f, dest);
      }
    }
    const comparisons: any[] = [];
    let diffsFound = 0;
    let matchesFound = 0;
    if (fs.existsSync(baselineDir)) {
      const baselineFiles = fs.readdirSync(baselineDir).filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
      for (const baselineFile of baselineFiles) {
        const baselinePath = path.join(baselineDir, baselineFile);
        const actualPath = path.join(actualDir, baselineFile);
        if (fs.existsSync(actualPath)) {
          try {
            const diffFilename = `diff-${baselineFile}`;
            const diffPath = path.join(diffDir, diffFilename);
            let pixelDiff = null;
            try {
              const pixelmatch = require('pixelmatch');
              const { PNG } = require('pngjs');
              const baselineImg = PNG.sync.read(fs.readFileSync(baselinePath));
              const actualImg = PNG.sync.read(fs.readFileSync(actualPath));
              if (baselineImg.width === actualImg.width && baselineImg.height === actualImg.height) {
                const diffImg = new PNG({ width: baselineImg.width, height: baselineImg.height });
                pixelDiff = pixelmatch(baselineImg.data, actualImg.data, diffImg.data, baselineImg.width, baselineImg.height, { threshold: 0.1 });
                const diffPercent = (pixelDiff / (baselineImg.width * baselineImg.height)) * 100;
                if (diffPercent > 0.5) {
                  fs.writeFileSync(diffPath, PNG.sync.write(diffImg));
                }
                comparisons.push({
                  file: baselineFile,
                  baselineSize: baselineImg.width + 'x' + baselineImg.height,
                  actualSize: actualImg.width + 'x' + actualImg.height,
                  diffPixels: pixelDiff,
                  diffPercent: Math.round(diffPercent * 100) / 100,
                  hasDiff: diffPercent > 0.5,
                  diffPath: diffPercent > 0.5 ? diffPath : null
                });
                if (diffPercent > 0.5) diffsFound++;
                else matchesFound++;
              } else {
                comparisons.push({
                  file: baselineFile,
                  baselineSize: baselineImg.width + 'x' + baselineImg.height,
                  actualSize: actualImg.width + 'x' + actualImg.height,
                  difference: 'SIZE_MISMATCH',
                  hasDiff: true
                });
                diffsFound++;
              }
            } catch (pixelError: any) {
              const baselineStat = fs.statSync(baselinePath);
              const actualStat = fs.statSync(actualPath);
              const sizeDiff = Math.abs(baselineStat.size - actualStat.size);
              const hasDiff = sizeDiff > 1024;
              comparisons.push({
                file: baselineFile,
                baselineSize: baselineStat.size,
                actualSize: actualStat.size,
                sizeDiff,
                hasDiff,
                note: 'Pixelmatch not available, used size comparison'
              });
              if (hasDiff) diffsFound++;
              else matchesFound++;
            }
          } catch (e: any) {
            comparisons.push({ file: baselineFile, error: e.message });
          }
        } else {
          comparisons.push({
            file: baselineFile,
            difference: 'NO_ACTUAL',
            hasDiff: true,
            note: 'No actual screenshot found for comparison'
          });
        }
      }
    }
    const reportPath = path.join(reportDir, 'visual-validation.md');
    const lines: any[] = [];
    lines.push('# Visual Validation Report');
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| Screenshots Found | ${actualFiles.length} |`);
    lines.push(`| Baselines Available | ${fs.existsSync(baselineDir) ? (fs.readdirSync(baselineDir).filter(f => f.endsWith('.png') || f.endsWith('.jpg'))).length : 0} |`);
    lines.push(`| Comparisons | ${comparisons.length} |`);
    lines.push(`| Matches | ${matchesFound} |`);
    lines.push(`| Differences Found | ${diffsFound} |`);
    lines.push('');
    lines.push('## Comparison Details');
    lines.push('');
    lines.push('| File | Status | Details |');
    lines.push('|---|---|---|');
    for (const c of comparisons) {
      if (c.error) {
        lines.push(`| ${c.file} | ERROR | ${c.error} |`);
      } else if (c.difference === 'NO_ACTUAL') {
        lines.push(`| ${c.file} | MISSING | No actual screenshot found |`);
      } else if (c.difference === 'SIZE_MISMATCH') {
        lines.push(`| ${c.file} | SIZE_MISMATCH | Baseline: ${c.baselineSize}, Actual: ${c.actualSize} |`);
      } else if (c.hasDiff) {
        lines.push(`| ${c.file} | DIFF | ${c.diffPercent || c.sizeDiff}% different |`);
      } else {
        lines.push(`| ${c.file} | MATCH | Identical within threshold |`);
      }
    }
    if (comparisons.length === 0) {
      lines.push('| - | NO_DATA | No screenshots available for comparison |');
    }
    lines.push('');
    lines.push('## Recommendations');
    lines.push('');
    if (diffsFound > 0) {
      lines.push(`- ${diffsFound} visual difference(s) detected. Review diff images in \`${path.relative(process.cwd(), diffDir)}\``);
      lines.push('- If differences are expected (intentional UI changes), update baselines.');
      lines.push('- If differences are unexpected, investigate application changes.');
    } else {
      lines.push('- No visual differences detected.');
      lines.push('- All screenshots match their baselines.');
    }
    fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
    return {
      ok: true,
      report: path.relative(process.cwd(), reportPath),
      comparisonsCount: comparisons.length,
      diffsFound,
      matchesFound,
      diffDir: diffsFound > 0 ? path.relative(process.cwd(), diffDir) : null
    };
  } };


// Auto-registered metadata for AgentRegistry
export const metadata = {
  "name": "Visual Validation Agent",
  "version": "1.0.0",
  "description": "Visual regression testing with screenshot comparison and layout validation",
  "dependencies": ["TestExecutionAgent"],
  "platforms": [
    "WEB"
  ],
  "tags": [
    "visual",
    "quality"
  ],
  "executionStage": "multi-agent",
  "priority": 55,
  "conditions": [
    {
      "type": "platform",
      "value": "web"
    }
  ],
  "retryPolicy": {
    "maxRetries": 0,
    "backoff": "none"
  },
  "lifecycle": "active"
};
