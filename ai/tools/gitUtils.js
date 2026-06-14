/**
 * ai/tools/gitUtils.js
 *
 * Safe local git helpers for preparing locator-fix branches and commits.
 * - NEVER pushes
 * - Provides: getStatus, getCurrentBranch, createBranch, stageFiles,
 *   createCommit, showDiff, showStagedDiff, unstageFiles, getLatestCommit
 *
 * Safety: refuses to stage sensitive or generated paths:
 * - .env, .env.*, reports/, ai/output/, node_modules/, *.log, *.pid, chroma/, *.sqlite*, *.bin
 *
 * Note: ai/ subpaths are allowlisted selectively via AI_ALLOWLIST_PREFIXES
 * (ai/agents/, ai/tools/, ai/prompts/, ai/config/, ai/orchestrator/, ai/core/).
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const FORBIDDEN_PATTERNS = [
  // .env and variants
  /^(?:\.env|\.env\..*)$/i,
  // repo reports and generated artifacts
  /^reports[\\/]/i,
  // ai output directory (generated vectors/reports)
  /^ai[\\/]output[\\/]/i,
  // node modules
  /^node_modules[\\/]/i,
  // runtime/log files
  /.*\.log$/i,
  /.*\.pid$/i,
  // chroma/vector runtime dirs
  /^chroma[\\/]/i,
  // sqlite files
  /.*\.sqlite3?$/i,
  // binary blobs
  /.*\.bin$/i
];

// Allowlist for ai/ directory prefixes (files under these prefixes are permitted)
const AI_ALLOWLIST_PREFIXES = [
  'ai/agents/',
  'ai/tools/',
  'ai/prompts/',
  'ai/config/',
  'ai/orchestrator/',
  'ai/core/'
];

function runGit(args, opts = {}) {
  const res = spawnSync('git', args, { encoding: 'utf8', ...opts });
  return {
    ok: res.status === 0,
    stdout: res.stdout ? String(res.stdout) : '',
    stderr: res.stderr ? String(res.stderr) : '',
    status: res.status
  };
}

function isPathForbiddenByPattern(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/');
  for (const pat of FORBIDDEN_PATTERNS) {
    if (pat.test(normalized)) {
      return { forbidden: true, reason: `matches forbidden pattern ${pat}` };
    }
  }
  return { forbidden: false };
}

/**
 * Check ai/ special handling: only allow specific prefixes under ai/
 * Returns { forbidden: bool, reason?: string }
 */
function isAiPathAllowed(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/');
  if (!normalized.startsWith('ai/')) return { forbidden: false };
  const ok = AI_ALLOWLIST_PREFIXES.some(pref => normalized.startsWith(pref));
  if (!ok) return { forbidden: true, reason: 'ai path not in allowlist (only ai/agents, ai/tools, ai/prompts, ai/config, ai/orchestrator, ai/core allowed)' };
  return { forbidden: false };
}

/**
 * Validate list of files before staging.
 * Returns { ok: boolean, rejected: [{path, reason}], accepted: [paths] }
 */
function validateFilesToStage(files) {
  const accepted = [];
  const rejected = [];
  for (const f of files) {
    const abs = path.resolve(process.cwd(), f);
    const rel = path.relative(process.cwd(), abs).replace(/\\/g, '/');
    // disallow absolute traversal outside repo root
    if (rel.startsWith('..')) {
      rejected.push({ path: f, reason: 'path outside repository' });
      continue;
    }

    // Check top-level forbidden patterns first (reports, ai/output, node_modules, logs, etc.)
    const patCheck = isPathForbiddenByPattern(rel);
    if (patCheck.forbidden) {
      rejected.push({ path: f, reason: patCheck.reason });
      continue;
    }

    // Special ai/ handling: allow only whitelisted prefixes
    if (rel.startsWith('ai/')) {
      const aiCheck = isAiPathAllowed(rel);
      if (aiCheck.forbidden) {
        rejected.push({ path: f, reason: aiCheck.reason });
        continue;
      }
    }

    // Disallow staging .env files explicitly
    if (/^\.env($|\.)/i.test(path.basename(rel))) {
      rejected.push({ path: f, reason: 'staging .env files is forbidden' });
      continue;
    }

    // Ensure file exists (allow staging deletions too)
    const exists = fs.existsSync(abs);
    if (!exists) {
      // Allow staging deletions (git can stage deletions by path) — accept but note
      accepted.push(rel);
      continue;
    }

    accepted.push(rel);
  }
  return { ok: rejected.length === 0, accepted, rejected };
}

module.exports = {
  /**
   * Return git status porcelain output
   */
  getStatus() {
    return runGit(['status', '--porcelain=1']);
  },

  /**
   * Get current branch name
   */
  getCurrentBranch() {
    const r = runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (!r.ok) return { ok: false, error: r.stderr || 'git rev-parse failed' };
    return { ok: true, branch: r.stdout.trim() };
  },

  /**
   * Create and checkout a new branch from current HEAD
   * name: suggested branch name (string)
   * returns { ok, branch, stdout, stderr, status }
   */
  createBranch(name) {
    if (!name || typeof name !== 'string') {
      return { ok: false, error: 'branch name required' };
    }
    // validate safe branch name
    const safe = name.replace(/[^A-Za-z0-9._\-\/]/g, '-').slice(0, 250);
    const r = runGit(['checkout', '-b', safe]);
    return { ok: r.ok, branch: safe, stdout: r.stdout, stderr: r.stderr, status: r.status };
  },

  /**
   * Stage files safely.
   * files: array of file paths (relative or absolute)
   * returns { ok, staged: [], rejected: [{path,reason}], gitResult }
   */
  stageFiles(files) {
    if (!Array.isArray(files) || files.length === 0) {
      return { ok: false, error: 'files must be a non-empty array' };
    }
    const validation = validateFilesToStage(files);
    if (!validation.ok) {
      return { ok: false, staged: validation.accepted, rejected: validation.rejected };
    }
    // perform git add for the accepted list
    const toAdd = validation.accepted;
    const r = runGit(['add', '--', ...toAdd]);
    return { ok: r.ok, staged: toAdd, rejected: [], gitResult: r };
  },

  /**
   * Create a commit with message. Will fail if nothing staged.
   * options: { signoff: bool }
   * returns { ok, commitSha, stdout, stderr }
   */
  createCommit(message, options = {}) {
    if (!message || typeof message !== 'string') {
      return { ok: false, error: 'commit message required' };
    }
    // check staged changes
    const status = runGit(['diff', '--name-only', '--staged']);
    if (!status.ok) return { ok: false, error: status.stderr || 'git diff staged failed' };
    const staged = (status.stdout || '').trim();
    if (!staged) return { ok: false, error: 'no staged changes to commit' };

    // build commit args
    const args = ['commit', '-m', message];
    if (options.signoff) args.push('--signoff');

    const r = runGit(args);
    if (!r.ok) return { ok: false, stdout: r.stdout, stderr: r.stderr };

    // get latest commit sha
    const shaRes = runGit(['rev-parse', 'HEAD']);
    const sha = shaRes.ok ? shaRes.stdout.trim() : null;
    return { ok: true, commitSha: sha, stdout: r.stdout, stderr: r.stderr };
  },

  /**
   * Show git diff for given files or whole working tree if files omitted.
   * returns { ok, stdout, stderr }
   */
  showDiff(files = []) {
    const args = files && files.length ? ['diff', '--', ...files] : ['diff'];
    return runGit(args);
  },

  /**
   * Show git staged diff (--staged)
   */
  showStagedDiff() {
    return runGit(['diff', '--staged']);
  },

  /**
   * Unstage files
   * files: array of file paths
   * returns { ok, stdout, stderr }
   */
  unstageFiles(files) {
    if (!Array.isArray(files) || files.length === 0) {
      return { ok: false, error: 'files must be a non-empty array' };
    }
    const r = runGit(['reset', 'HEAD', '--', ...files]);
    return { ok: r.ok, stdout: r.stdout, stderr: r.stderr };
  },

  /**
   * Get latest commit (sha and message)
   */
  getLatestCommit() {
    const r = runGit(['log', '-1', '--pretty=format:%H%n%an%n%ae%n%s%n%b']);
    if (!r.ok) return { ok: false, error: r.stderr || 'git log failed' };
    const parts = r.stdout.split('\n');
    return {
      ok: true,
      sha: parts[0] || '',
      authorName: parts[1] || '',
      authorEmail: parts[2] || '',
      subject: parts[3] || '',
      body: parts.slice(4).join('\n') || ''
    };
  },

  /**
   * Utility: safe wrapper to check if a path would be accepted for staging
   * returns { ok: boolean, reason?: string }
   */
  isPathAllowedForStaging(p) {
    const abs = path.resolve(process.cwd(), p);
    const rel = path.relative(process.cwd(), abs).replace(/\\/g, '/');
    if (rel.startsWith('..')) return { ok: false, reason: 'path outside repository' };
    const patCheck = isPathForbiddenByPattern(rel);
    if (patCheck.forbidden) return { ok: false, reason: patCheck.reason };
    if (rel.startsWith('ai/')) {
      const aiCheck = isAiPathAllowed(rel);
      if (aiCheck.forbidden) return { ok: false, reason: aiCheck.reason };
    }
    if (/^\.env($|\.)/i.test(path.basename(rel))) return { ok: false, reason: 'staging .env files is forbidden' };
    return { ok: true };
  },

  // low-level runGit exposed for callers when they need raw git output (read-only)
  _runGitRaw(args) {
    return runGit(args);
  }
};
