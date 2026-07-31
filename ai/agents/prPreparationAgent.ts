import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import gitUtils from '../tools/gitUtils';
/**
 * ai/agents/PRPreparationAgent.js
 *
 * Prepares a local branch with staged files and generates a PR summary for operator review.
 * - Creates branch: ai/locator-fix/<timestamp>-<shortid>
 * - Stages only approved files (uses gitUtils for safe validation)
 * - Generates commit message (but does NOT create commit)
 * - Writes reports/ai/pr-summary.md with branch, changed files, backupRoot, smoke result, proposals applied, and reviewer instructions
 * - NEVER pushes or creates remote PRs
 */


function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function shortId(len = 6) {
  return crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
}

function branchName() {
  return `ai/locator-fix/${timestamp()}-${shortId(8)}`;
}

function ensureReportDir() {
  fs.ensureDirSync(path.join(process.cwd(), 'reports', 'ai'));
}

function generateCommitMessage() {
  return '[AI] Locator healing fixes';
}

async function preparePR({ appliedFiles = [], backupRoot = '', proposals = [], smokeResult = 'not-run', baseBranch = null, force = false }: any = {}) {
  ensureReportDir();
  // Ensure appliedFiles is array of relative paths
  appliedFiles = Array.isArray(appliedFiles) ? appliedFiles : [] as any[];

  // Create branch
  const br = branchName();
  const branchResult = gitUtils.createBranch(br);
  if (!branchResult.ok) return { ok: false, error: 'failed to create branch', details: branchResult };

  // Stage only files that gitUtils accepts
  const stageRes = gitUtils.stageFiles(appliedFiles);
  if (!stageRes.ok) {
    // include rejected info
    return { ok: false, error: 'failed to stage some files', staged: stageRes.staged, rejected: stageRes.rejected };
  }

  const stagedFiles = stageRes.staged || [];
  const commitMessage = generateCommitMessage();

  // We DO NOT create commit automatically. Operator can inspect staged files and commit locally.
  // Generate PR summary
  const prSummary = {
    generatedAt: new Date().toISOString(),
    branch: br,
    stagedFiles,
    backupRoot: backupRoot || null,
    smokeValidation: smokeResult,
    proposalsApplied: proposals.map((p: any) => ({ id: p.id || p, title: p.title || (p.failure && p.failure.feature) || 'n/a', risk: p.risk || 'n/a' })),
    commitMessage
  };

  const summaryPath = path.join(process.cwd(), 'reports', 'ai', 'pr-summary.md');
  const lines: any[] = [];
  lines.push('# PR Summary (AI Locator Healing)');
  lines.push(`Generated: ${prSummary.generatedAt}`);
  lines.push(`Branch: ${prSummary.branch}`);
  lines.push('');
  lines.push('## Staged files');
  if (stagedFiles.length) stagedFiles.forEach(f => lines.push(`- ${f}`)); else lines.push('- (none)');
  lines.push('');
  lines.push(`## Backup root: ${prSummary.backupRoot || '(none provided)'}`);
  lines.push('');
  lines.push(`## Smoke validation: ${prSummary.smokeValidation}`);
  lines.push('');
  lines.push('## Proposals applied');
  if (prSummary.proposalsApplied.length) prSummary.proposalsApplied.forEach((p: any) => lines.push(`- ${p.id}: ${p.title} (risk: ${p.risk})`)); else lines.push('- (none)');
  lines.push('');
  lines.push('## Commit message (suggested)');
  lines.push('```');
  lines.push(prSummary.commitMessage);
  lines.push('```');
  lines.push('');
  lines.push('## Reviewer instructions');
  lines.push('- Review staged changes: `git diff` and `git diff --staged`');
  lines.push('- If OK, create the commit locally: `git commit -m "[AI] Locator healing fixes"`');
  lines.push('- Push the branch: `git push origin ' + prSummary.branch + '` (only after manual approval)');
  lines.push('- Open a PR in GitHub and reference reports/ai/locator-healing-approval.md for backups and rationale.');

  fs.writeFileSync(summaryPath, lines.join(os.EOL), 'utf8');

  return { ok: true, branch: br, stagedFiles, commitMessage, summaryPath };
}

export { preparePR };
export default { preparePR: preparePR };


// Auto-registered metadata for AgentRegistry
export const metadata = {
  "name": "PR Preparation Agent",
  "version": "1.0.0",
  "description": "Prepares local branch with staged files and generates PR summary",
  "dependencies": ["PRAgent","locatorHealingAgent"],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS",
    "API"
  ],
  "tags": [
    "ci",
    "pr"
  ],
  "executionStage": "reporting",
  "priority": 25,
  "conditions": [
    {
      "type": "ci"
    }
  ],
  "retryPolicy": {
    "maxRetries": 0,
    "backoff": "none"
  },
  "lifecycle": "active"
};
