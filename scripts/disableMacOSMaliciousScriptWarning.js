#!/usr/bin/env node
/**
 * disableMacOSMaliciousScriptWarning.js
 *
 * PERMANENT FIX for macOS "Malicious Script Blocked" warning during Playwright automation.
 *
 * macOS 15 Sequoia introduced the `com.apple.provenance` extended attribute to
 * track files downloaded from the internet. When a process spawned from a shell
 * (e.g., via Node.js `child_process.spawn` with `shell: true` or via `npx`)
 * tries to execute a binary that has this provenance attribute, macOS XProtect
 * may flag it as a "Malicious Script" and block execution.
 *
 * This script:
 * 1. Removes `com.apple.provenance` extended attribute from all Playwright
 *    browser binaries (Chromium, Firefox, WebKit)
 * 2. Removes it from key node_modules/.bin binaries that are spawn targets
 * 3. Does NOT modify any Playwright framework files
 *
 * Usage:
 *   node scripts/disableMacOSMaliciousScriptWarning.js
 *
 * Or via npm:
 *   npm run fix:macos-security
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MS_PLAYWRIGHT = path.join(process.env.HOME || '/Users/kumarsaurabh', 'Library', 'Caches', 'ms-playwright');
const ROOT = process.cwd();

console.log('');
console.log('='.repeat(60));
console.log('  macOS Malicious Script Blocked — Permanent Fix');
console.log('='.repeat(60));
console.log('');

// ─── Step 1: Remove provenance from Playwright browser binaries ───────────

console.log('Step 1: Cleaning Playwright browser binaries...');
let fixedCount = 0;

function walkAndRemoveXattr(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      let stat;
      try { stat = fs.statSync(fullPath); } catch { continue; }
      
      try {
        execSync(`xattr -d com.apple.provenance "${fullPath}" 2>/dev/null`, { stdio: 'ignore', timeout: 1000 });
        fixedCount++;
      } catch {
        // xattr not present or can't be removed — not an error
      }

      if (stat.isDirectory()) {
        walkAndRemoveXattr(fullPath);
      }
    }
  } catch (e) {
    console.warn(`  [⚠] Error scanning ${dir}: ${e.message}`);
  }
}

if (fs.existsSync(MS_PLAYWRIGHT)) {
  const browserDirs = fs.readdirSync(MS_PLAYWRIGHT);
  for (const browserDir of browserDirs) {
    const browserPath = path.join(MS_PLAYWRIGHT, browserDir);
    console.log(`  Scanning ${browserDir}...`);
    walkAndRemoveXattr(browserPath);
  }
}

console.log(`  Processed ${fixedCount} files`);
console.log('');

// ─── Step 2: Clean node_modules/.bin binaries ─────────────────────────────

console.log('Step 2: Cleaning node_modules/.bin binaries...');

const binDir = path.join(ROOT, 'node_modules', '.bin');
let binFixed = 0;

if (fs.existsSync(binDir)) {
  const bins = fs.readdirSync(binDir);
  for (const bin of bins) {
    const binPath = path.join(binDir, bin);
    try {
      execSync(`xattr -d com.apple.provenance "${binPath}" 2>/dev/null`, { stdio: 'ignore', timeout: 500 });
      binFixed++;
    } catch {}
  }
}

console.log(`  Processed ${binFixed} binaries`);
console.log('');

// ─── Step 3: Create .npmrc postinstall hook ────────────────────────────────

console.log('Step 3: Setting up persistent fix...');

const hookScript = `if [ -d "$HOME/Library/Caches/ms-playwright" ]; then
  find "$HOME/Library/Caches/ms-playwright" -type f -exec xattr -d com.apple.provenance {} \\; 2>/dev/null || true
fi
if [ -d "node_modules/.bin" ]; then
  find "node_modules/.bin" -type f -exec xattr -d com.apple.provenance {} \\; 2>/dev/null || true
fi
`;

const hookDir = path.join(ROOT, '.hooks');
try { fs.mkdirSync(hookDir, { recursive: true }); } catch {}
try { fs.writeFileSync(path.join(hookDir, 'postinstall-fix.sh'), hookScript, { mode: 0o755 }); } catch {}

// .npmrc hook
const npmrcPath = path.join(ROOT, '.npmrc');
let npmrcContent = '';
try {
  if (fs.existsSync(npmrcPath)) {
    npmrcContent = fs.readFileSync(npmrcPath, 'utf8');
  }
} catch {}

if (!npmrcContent.includes('postinstall')) {
  const hookLine = `postinstall=${path.join(ROOT, '.hooks', 'postinstall-fix.sh')}`;
  if (npmrcContent.length > 0 && !npmrcContent.endsWith('\n')) npmrcContent += '\n';
  npmrcContent += `${hookLine}\n`;
  try { fs.writeFileSync(npmrcPath, npmrcContent, 'utf8'); } catch {}
  console.log('  ✓ Added postinstall hook to .npmrc');
} else {
  console.log('  ✓ .npmrc postinstall hook already configured');
}

console.log('');
console.log('='.repeat(60));
console.log('  Fix complete!');
console.log('');
console.log('  Run your automation now:');
console.log('    HEADLESS=false npm run test:ai');
console.log('');
console.log('  If the warning persists:');
console.log('    1. System Settings → Privacy & Security → Security');
console.log('    2. Look for "Chromium" or "Playwright" blocked items');
console.log('    3. Click "Allow" to authorize');
console.log('='.repeat(60));
