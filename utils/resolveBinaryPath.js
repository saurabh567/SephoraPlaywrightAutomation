/**
 * resolveBinaryPath.js
 *
 * SAFE binary path resolution for child_process spawn operations.
 * Replaces unsafe `spawn('npx playwright test', args, { shell: true })` patterns.
 *
 * Resolves the full path to a node_modules binary for direct execution
 * without going through a shell interpreter.
 *
 * macOS Security Note:
 *   Using `spawn(cmd, args)` WITHOUT `shell: true` prevents macOS XProtect
 *   from flagging the child process as a "Malicious Script" because:
 *   - No shell interpreter is involved in the execution chain
 *   - The binary is executed directly via its full path
 *   - macOS can properly verify the binary's code signature
 *
 * Usage:
 *   const npxPath = resolveBinary('npx');
 *   spawn(npxPath, ['playwright', 'test', ...args], { cwd, env });
 */

const fs = require('fs-extra');
const path = require('path');

/**
 * Resolve the full path to a binary in node_modules/.bin or system PATH.
 * @param {string} binaryName - Name of the binary (e.g., 'npx', 'npm', 'playwright')
 * @returns {string|null} Full path to the binary, or null if not found
 */
function resolveBinary(binaryName) {
  // 1. Check node_modules/.bin first (project-local binaries)
  const localBin = path.join(process.cwd(), 'node_modules', '.bin', binaryName);
  if (fs.existsSync(localBin)) {
    try {
      return fs.realpathSync(localBin);
    } catch {
      return localBin;
    }
  }

  // 2. Check npm global prefix
  try {
    const { execSync } = require('child_process');
    const globalPrefix = execSync('npm bin -g 2>/dev/null', { encoding: 'utf8', timeout: 3000 }).trim();
    const globalBin = path.join(globalPrefix, binaryName);
    if (fs.existsSync(globalBin)) return globalBin;
  } catch {
    // ignore
  }

  // 3. Check PATH environment variable
  const envPath = process.env.PATH || '';
  for (const dir of envPath.split(path.delimiter)) {
    const candidate = path.join(dir, binaryName);
    try {
      if (fs.existsSync(candidate)) {
        return fs.realpathSync(candidate);
      }
    } catch {
      continue;
    }
  }

  // 4. Check nvm default location
  const homeDir = process.env.HOME || '/usr/local';
  const nvmPath = path.join(homeDir, '.nvm', 'versions', 'node', '*', 'bin', binaryName);
  try {
    const glob = require('glob');
    const matches = glob.sync(nvmPath);
    if (matches.length > 0) return matches[0];
  } catch {
    // ignore
  }

  return null;
}

/**
 * Resolve the node binary path.
 */
function resolveNode() {
  return process.argv[0] || process.execPath || resolveBinary('node');
}

/**
 * Resolve npx binary path.
 * Falls back to using `node node_modules/.bin/npx` if npx not found.
 */
function resolveNpx() {
  return resolveBinary('npx');
}

/**
 * Build a safe spawn argument array for `npx playwright test`.
 * @param {string[]} cliArgs - Playwright CLI arguments
 * @returns {{ cmd: string, args: string[] }}
 */
function buildNpxPlaywrightArgs(cliArgs = []) {
  const npxPath = resolveNpx();
  if (npxPath) {
    return { cmd: npxPath, args: ['playwright', 'test', ...cliArgs] };
  }
  // Fallback: use node directly with the playwright CLI module
  const nodePath = resolveNode();
  const pwCli = path.join(process.cwd(), 'node_modules', '@playwright', 'test', 'cli.js');
  return { cmd: nodePath, args: [pwCli, 'test', ...cliArgs] };
}

module.exports = {
  resolveBinary,
  resolveNode,
  resolveNpx,
  buildNpxPlaywrightArgs
};
