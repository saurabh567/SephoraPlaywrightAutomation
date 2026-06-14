/**
 * ai/agents/LocatorApplyManager.js
 *
 * Manager to prepare/apply locator healing proposals safely with backups and rollback.
 * - Loads proposals from reports/ai/locator-healing-proposals.json
 * - Only allows LOW-risk proposals for apply
 * - Creates backups under ai/backups/<timestamp>
 * - Writes patch previews to reports/ai/locator-healing-patches/<id>.patch
 * - Applies selected proposals via locatorHealingApplier
 * - Rollback restores files from backup (skips manifest.json only)
 * - Produces reports/ai/locator-healing-approval.md entries
 *
 * Safety:
 * - Uses gitUtils read-only checks for working-tree status
 * - Refuses to apply if meaningful dirty files exist (outside allowed generated folders)
 * - NEVER stages, commits, or pushes
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');

const LocatorApplier = require('./locatorHealingApplier');
const gitUtils = require('../tools/gitUtils');

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function ensureDirs() {
  fs.ensureDirSync(path.join(process.cwd(), 'ai', 'backups'));
  fs.ensureDirSync(path.join(process.cwd(), 'reports', 'ai', 'locator-healing-patches'));
}

function appendApprovalReport(entry) {
  const reportPath = path.join(process.cwd(), 'reports', 'ai', 'locator-healing-approval.md');
  fs.ensureDirSync(path.dirname(reportPath));
  const header = `\n\n---\n\n${new Date().toISOString()}\n\n`;
  fs.appendFileSync(reportPath, header + entry + os.EOL, 'utf8');
  return reportPath;
}

function loadProposals(proposalsFile = path.join(process.cwd(), 'reports', 'ai', 'locator-healing-proposals.json')) {
  if (!fs.existsSync(proposalsFile)) return { ok: false, error: 'proposals file not found', path: proposalsFile };
  try {
    const data = fs.readJsonSync(proposalsFile);
    const proposals = Array.isArray(data.proposals) ? data.proposals : [];
    proposals.forEach((p, idx) => { if (!p.id) p.id = `p-${idx+1}`; });
    return { ok: true, proposals, meta: { generatedAt: data.generatedAt } };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

function createBackupRoot() {
  const root = path.join(process.cwd(), 'ai', 'backups', timestamp());
  fs.ensureDirSync(root);
  return root;
}

// Allowed/generated folders to ignore for cleanliness check
const WORKTREE_ALLOWED_PREFIXES = [
  'reports/',
  'reports/ai/',
  'ai/output/',
  'generated-features/',
  'ai/backups/',
  'ai/ingest/'
];

// Check working tree for meaningful changes outside allowed prefixes.
// Returns { ok: boolean, dirtyFiles: [paths], rawStatus }
function isWorkingTreeCleanExceptAllowed() {
  const status = gitUtils.getStatus();
  const out = (status.stdout || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const remaining = [];

  for (const line of out) {
    // Parse porcelain: take the path portion
    // lines may start with '?? ', ' M ', 'A  ', etc.
    const m = line.match(/^(?:[MADRCU\?]{1,2})\s+(.*)$/) || line.match(/^\?\?\s+(.*)$/);
    const filePath = m ? m[1] : (line.length > 3 ? line.slice(3).trim() : line);
    if (!filePath) continue;
    const norm = filePath.replace(/\\/g, '/');

    // Ignore allowed prefixes
    if (WORKTREE_ALLOWED_PREFIXES.some(pref => norm.startsWith(pref))) continue;

    // Ignore runtime / node_modules and binary/log files
    if (/^node_modules\//.test(norm)) continue;
    if (/.*\.(log|pid|sqlite3?|bin)$/.test(norm)) continue;
    if (/^chroma[\\/]/i.test(norm)) continue;

    remaining.push(norm);
  }

  return { ok: remaining.length === 0, dirtyFiles: remaining, rawStatus: status.stdout || '' };
}

const LocatorApplyManager = {
  listProposals(proposalsFile) {
    const loaded = loadProposals(proposalsFile);
    if (!loaded.ok) return loaded;
    const view = loaded.proposals.map(p => ({ id: p.id, failure: p.failure, suggested: p.suggested, risk: p.risk, confidence: p.confidence || (p.suggested && p.suggested.score ? Math.round(p.suggested.score*100) : undefined) }));
    return { ok: true, proposals: view, meta: loaded.meta };
  },

  generatePatchesFor(proposalIds = [], proposalsFile) {
    ensureDirs();
    const loaded = loadProposals(proposalsFile);
    if (!loaded.ok) return loaded;
    const byId = new Map(loaded.proposals.map(p => [p.id, p]));
    const applier = new LocatorApplier({ backupRoot: path.join(process.cwd(), 'ai', 'backups', 'preview') });
    const result = [];
    for (const id of proposalIds) {
      const p = byId.get(id);
      if (!p) { result.push({ id, ok: false, error: 'proposal not found' }); continue; }
      if ((p.risk || '').toUpperCase() !== 'LOW') { result.push({ id, ok: false, error: `proposal risk is ${p.risk}; only LOW allowed` }); continue; }
      try {
        const patch = applier.createPatchForSuggestion(p);
        const patchFile = path.join(process.cwd(), 'reports', 'ai', 'locator-healing-patches', `${id}.patch`);
        fs.writeFileSync(patchFile, patch, 'utf8');
        result.push({ id, ok: true, patchFile });
      } catch (e) {
        result.push({ id, ok: false, error: e && e.message ? e.message : String(e) });
      }
    }
    return { ok: true, results: result };
  },

  prepareBackupFor(proposalIds = [], proposalsFile) {
    ensureDirs();
    const loaded = loadProposals(proposalsFile);
    if (!loaded.ok) return loaded;
    const byId = new Map(loaded.proposals.map(p => [p.id, p]));
    const backupRoot = createBackupRoot();
    const manifest = { createdAt: new Date().toISOString(), backupRoot, items: [] };
    for (const id of proposalIds) {
      const p = byId.get(id);
      if (!p) { manifest.items.push({ id, ok: false, error: 'proposal not found' }); continue; }
      if ((p.risk || '').toUpperCase() !== 'LOW') { manifest.items.push({ id, ok: false, error: `proposal risk is ${p.risk}; only LOW allowed` }); continue; }
      const target = p.suggested && p.suggested.sourceFile ? path.resolve(process.cwd(), p.suggested.sourceFile) : null;
      if (!target || !fs.existsSync(target)) { manifest.items.push({ id, ok: false, error: `target file not found (${String(target)})` }); continue; }
      try {
        const rel = path.relative(process.cwd(), target);
        const dest = path.join(backupRoot, rel);
        fs.ensureDirSync(path.dirname(dest));
        fs.copyFileSync(target, dest);
        manifest.items.push({ id, ok: true, file: rel, backupPath: path.relative(process.cwd(), dest) });
      } catch (e) { manifest.items.push({ id, ok: false, error: e && e.message ? e.message : String(e) }); }
    }
    const manifestPath = path.join(backupRoot, 'manifest.json');
    fs.writeJsonSync(manifestPath, manifest, { spaces: 2 });
    return { ok: true, backupRoot, manifestPath, manifest };
  },

  applyProposal(id, options = {}) {
    ensureDirs();
    const proposalsFile = options.proposalsFile;
    const loaded = loadProposals(proposalsFile);
    if (!loaded.ok) return loaded;
    const p = (loaded.proposals || []).find(x => x.id === id);
    if (!p) return { ok: false, error: `proposal ${id} not found` };
    if ((p.risk || '').toUpperCase() !== 'LOW') return { ok: false, error: `proposal ${id} risk is ${p.risk}; only LOW allowed` };

    // Check working tree for meaningful changes outside allowed/generated paths
    const wt = isWorkingTreeCleanExceptAllowed();
    if (!wt.ok && !options.force) {
      return { ok: false, error: 'git working tree has uncommitted changes outside allowed folders; use force=true to override', dirtyFiles: wt.dirtyFiles };
    }

    // Prepare backup (if not provided)
    const backupInfo = options.backupRoot ? { ok: true, backupRoot: options.backupRoot } : this.prepareBackupFor([id], proposalsFile);
    if (!backupInfo.ok) return { ok: false, error: 'failed creating backup', details: backupInfo };

    const applier = new LocatorApplier({ backupRoot: backupInfo.backupRoot });
    let patch;
    try { patch = applier.createPatchForSuggestion(p); } catch (e) { return { ok: false, error: 'failed creating patch', exception: e && e.message }; }
    const patchFilePath = path.join(process.cwd(), 'reports', 'ai', 'locator-healing-patches', `${id}.patch`);
    fs.ensureDirSync(path.dirname(patchFilePath));
    fs.writeFileSync(patchFilePath, patch, 'utf8');

    let appliedOk = false;
    try { appliedOk = applier.applyPatch(p); } catch (e) { try { this.rollback(backupInfo.backupRoot); } catch (_) {} return { ok: false, error: 'applyPatch threw exception', exception: e && e.message }; }
    if (!appliedOk) { this.rollback(backupInfo.backupRoot); return { ok: false, error: 'applyPatch reported false; rollback attempted' }; }

    const status = gitUtils.getStatus();
    const entry = [
      `Applied proposal: ${id}`,
      `Target file: ${p.suggested && p.suggested.sourceFile}`,
      `Backup root: ${backupInfo.backupRoot}`,
      `Patch file: ${patchFilePath}`,
      `Confidence: ${p.confidence || 'n/a'}`,
      `Risk: ${p.risk}`,
      `Git status at apply time: ${status.stdout || '(clean)'}`
    ].join(os.EOL + os.EOL);
    const reportPath = appendApprovalReport(entry);

    return { ok: true, applied: true, id, patchFilePath, backupRoot: backupInfo.backupRoot, reportPath };
  },

  applyMultiple(proposalIds = [], options = {}) {
    if (!Array.isArray(proposalIds) || proposalIds.length === 0) return { ok: false, error: 'proposalIds required' };
    const loaded = loadProposals(options.proposalsFile);
    if (!loaded.ok) return loaded;
    const proposalsMap = new Map(loaded.proposals.map(p => [p.id, p]));
    for (const id of proposalIds) { const p = proposalsMap.get(id); if (!p) return { ok: false, error: `proposal ${id} not found` }; if ((p.risk || '').toUpperCase() !== 'LOW') return { ok: false, error: `proposal ${id} risk is ${p.risk}; only LOW allowed` }; }

    const wt = isWorkingTreeCleanExceptAllowed();
    if (!wt.ok && !options.force) return { ok: false, error: 'git working tree has uncommitted changes outside allowed folders; use force=true to override', dirtyFiles: wt.dirtyFiles };

    const backupInfo = this.prepareBackupFor(proposalIds, options.proposalsFile);
    if (!backupInfo.ok) return { ok: false, error: 'failed creating backup', details: backupInfo };
    const applier = new LocatorApplier({ backupRoot: backupInfo.backupRoot });

    const applied = [];
    try {
      for (const id of proposalIds) {
        const p = proposalsMap.get(id);
        const patch = applier.createPatchForSuggestion(p);
        const patchFilePath = path.join(process.cwd(), 'reports', 'ai', 'locator-healing-patches', `${id}.patch`);
        fs.writeFileSync(patchFilePath, patch, 'utf8');
        const ok = applier.applyPatch(p);
        if (!ok) throw new Error(`applyPatch returned false for ${id}`);
        applied.push({ id, patchFilePath, target: p.suggested && p.suggested.sourceFile });
      }
    } catch (e) {
      try { this.rollback(backupInfo.backupRoot); } catch (_) {}
      return { ok: false, error: 'applyMultiple failed: rolled back', exception: e && e.message, applied };
    }

    const entryLines = [
      `Applied ${applied.length} proposals: ${applied.map(a=>a.id).join(', ')}`,
      `Backup root: ${backupInfo.backupRoot}`,
      `Applied details:`,
      ...applied.map(a => ` - ${a.id}: ${a.target} (patch: ${a.patchFilePath})`)
    ];
    const reportPath = appendApprovalReport(entryLines.join(os.EOL + os.EOL));
    return { ok: true, applied, backupRoot: backupInfo.backupRoot, reportPath };
  },

  rollback(backupRoot) {
    if (!backupRoot) return { ok: false, error: 'backupRoot required' };
    const absBackup = path.resolve(process.cwd(), backupRoot);
    if (!fs.existsSync(absBackup)) return { ok: false, error: 'backupRoot not found' };

    const restored = [];
    const errors = [];

    const listAll = function listAll(dir) {
      const out = [];
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        const stat = fs.statSync(p);
        if (stat.isDirectory()) out.push(...listAll(p));
        else out.push(p);
      }
      return out;
    };

    const items = listAll(absBackup);

    for (const f of items) {
      const base = path.basename(f);
      // Skip manifest.json only (explicit metadata filename)
      if (base === 'manifest.json') continue;
      const rel = path.relative(absBackup, f);
      const dest = path.join(process.cwd(), rel);
      try {
        fs.ensureDirSync(path.dirname(dest));
        fs.copyFileSync(f, dest);
        restored.push(rel);
      } catch (e) {
        errors.push({ file: rel, error: e && e.message });
      }
    }

    const entry = [
      `Rollback executed for backupRoot: ${backupRoot}`,
      `Restored files: ${restored.length}`,
      `Errors: ${errors.length > 0 ? JSON.stringify(errors, null, 2) : 'none'}`
    ].join(os.EOL + os.EOL);
    const reportPath = appendApprovalReport(entry);
    return { ok: errors.length === 0, restored, errors, reportPath };
  }
};

module.exports = LocatorApplyManager;
