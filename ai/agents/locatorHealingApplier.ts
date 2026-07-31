import fs from 'fs-extra';
import path from 'path';

class LocatorHealingApplier {
  [key: string]: any;
  constructor(opts: any = {}) {
    this.backupRoot = opts.backupRoot || path.join(process.cwd(), 'ai', 'backups', String(Date.now()));
    fs.ensureDirSync(this.backupRoot);
  }

  // createPatchForSuggestion returns a readable patch string (original vs patched) for review
  createPatchForSuggestion(proposal: any) {
    const target = path.isAbsolute(proposal.suggested.sourceFile) ? proposal.suggested.sourceFile : path.join(process.cwd(), proposal.suggested.sourceFile);
    if (!fs.existsSync(target)) {
      return `# Target file not found: ${target}\n`;
    }
    const original = fs.readFileSync(target, 'utf8');
    const updated = this._applyLocatorReplacementInText(original, proposal.failure.locator, proposal.suggested.locator);

    // Simple human-friendly patch: show header, --- original, +++ patched
    const parts: any[] = [];
    parts.push(`# Patch for proposal: ${proposal.failure.feature || proposal.failure.scenario || 'unknown'}`);
    parts.push(`# Target: ${target}`);
    parts.push('');
    parts.push('--- ORIGINAL ---');
    parts.push(original);
    parts.push('--- PATCHED ---');
    parts.push(updated);
    return parts.join('\n');
  }

  // applyPatch writes the change after backing up the original file
  async applyPatch(proposal: any) {
    const target = path.isAbsolute(proposal.suggested.sourceFile) ? proposal.suggested.sourceFile : path.join(process.cwd(), proposal.suggested.sourceFile);
    if (!fs.existsSync(target)) return false;
    // backup
    const rel = path.relative(process.cwd(), target);
    const backupPath = path.join(this.backupRoot, rel);
    fs.ensureDirSync(path.dirname(backupPath));
    fs.copyFileSync(target, backupPath);
    // write modified content
    const original = fs.readFileSync(target, 'utf8');
    const updated = this._applyLocatorReplacementInText(original, proposal.failure.locator, proposal.suggested.locator);
    fs.writeFileSync(target, updated, 'utf8');
    return true;
  }

  // restoreFromBackup: restore all files from backupRoot
  async restoreFromBackup(backupRoot: any) {
    if (!fs.existsSync(backupRoot)) return { error: 'backupRoot not found' };
    const results: any[] = [];
    const files = this._listAllFiles(backupRoot);
    for (const f of files) {
      const rel = path.relative(backupRoot, f);
      const dest = path.join(process.cwd(), rel);
      fs.ensureDirSync(path.dirname(dest));
      fs.copyFileSync(f, dest);
      results.push(dest);
    }
    return { restored: results };
  }

  _listAllFiles(root: any) {
    const out: any[] = [];
    const items = fs.readdirSync(root);
    for (const it of items) {
      const p = path.join(root, it);
      const stat = fs.statSync(p);
      if (stat.isDirectory()) out.push(...this._listAllFiles(p));
      else out.push(p);
    }
    return out;
  }

  _applyLocatorReplacementInText(text: any, oldLocator: any, newLocator: any) {
    if (!oldLocator) return text;
    if (oldLocator === newLocator) return text;
    const escapedOld = oldLocator.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const qRe = new RegExp(`(["'` + "`])(${escapedOld})\\1", 'g');
    let updated;
    try {
      updated = text.replace(qRe, (m: any, q: any, inner: any) => `${q}${newLocator}${q}`);
    } catch (e: any) {
      // fallback
      updated = text.split(oldLocator).join(newLocator);
    }
    if (updated === text) {
      updated = text.split(oldLocator).join(newLocator);
    }
    return updated;
  }
}

export default LocatorHealingApplier;


// Auto-registered metadata for AgentRegistry
export const metadata = {
  "name": "Locator Healing Applier",
  "version": "1.0.0",
  "description": "Low-level patch creation and application for locator healing",
  "dependencies": [] as any[],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS"
  ],
  "tags": [
    "healing",
    "utility"
  ],
  "executionStage": "analysis",
  "priority": 40,
  "conditions": [] as any[],
  "retryPolicy": {
    "maxRetries": 0,
    "backoff": "none"
  },
  "lifecycle": "active"
};
