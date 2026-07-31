#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import readline from 'readline';
import LocatorApplyManager from '../ai/agents/LocatorApplyManager';
import gitUtils from '../ai/tools/gitUtils';
/**
 * utils/locator-approve-cli.js
 *
 * Human approval CLI for locator healing proposals.
 * Commands:
 *  --list                        List proposals
 *  --preview --id <id>           Show patch preview for proposal id
 *  --prepare --ids id1,id2       Prepare backups for given proposal ids
 *  --apply --ids id1,id2         Apply given LOW-risk proposals (confirmation required)
 *  --rollback --backup <root>    Rollback using provided backup root
 *
 * Safety:
 *  - Only allows proposals with risk === 'LOW'
 *  - Integrates LocatorApplyManager for backup/apply/rollback
 *  - Never stages, commits, or pushes
 */



function usage() {
  console.log('Usage: node utils/locator-approve-cli.js [--list] [--preview --id <id>] [--prepare --ids id1,id2] [--apply --ids id1,id2] [--rollback --backup <backupRoot>]');
}

function exitWith(msg: any, code = 1) {
  if (msg) console.error(msg);
  process.exit(code);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out: Record<string, any> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--list') out.list = true;
    else if (a === '--preview') out.preview = true;
    else if (a === '--id') { out.id = args[++i]; }
    else if (a === '--ids') { out.ids = args[++i]; }
    else if (a === '--prepare') out.prepare = true;
    else if (a === '--apply') out.apply = true;
    else if (a === '--rollback') out.rollback = true;
    else if (a === '--backup') { out.backup = args[++i]; }
    else if (a === '--help' || a === '-h') { out.help = true; }
    else {
      // allow comma-separated shorthand for ids
      if (a.startsWith('--')) { console.warn('Unknown flag', a); }
    }
  }
  return out;
}

function ensureProposalsLoaded(res: any) {
  if (!res || !res.ok) {
    console.error('Failed loading proposals:', res && res.error ? res.error : 'unknown');
    process.exit(2);
  }
  return res.proposals || [];
}

function formatProposalRow(p: any) {
  const feature = (p.failure && p.failure.feature) || '(unknown feature)';
  const scenario = (p.failure && p.failure.scenario) || '(unknown scenario)';
  const confidence = p.confidence || (p.suggested && p.suggested.score ? Math.round(p.suggested.score * 100) + '%' : 'n/a');
  const risk = (p.risk || 'n/a').toUpperCase();
  const target = (p.suggested && p.suggested.sourceFile) || '(unknown file)';
  return `${p.id} | ${feature} | ${scenario} | confidence=${confidence} | risk=${risk} | target=${target}`;
}

async function confirmPrompt(question: any) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question + ' (y/N): ', ans => {
      rl.close();
      const ok = String(ans || '').trim().toLowerCase() === 'y';
      resolve(ok);
    });
  });
}

function runSmokeValidationIfConfigured() {
  const cmd = process.env.LOCATOR_SMOKE_CMD || '';
  if (!cmd) return { ran: false, message: 'LOCATOR_SMOKE_CMD not configured; smoke validation skipped' };
  console.log('Running smoke validation command:', cmd);
  try {
    const res = spawnSync(cmd, { shell: true, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    const ok = res.status === 0;
    return { ran: true, ok, stdout: (res.stdout || '').slice(-2000), stderr: (res.stderr || '').slice(-2000) };
  } catch (e: any) {
    return { ran: true, ok: false, error: e && e.message };
  }
}

async function cmdList() {
  const res: any = LocatorApplyManager.listProposals();
  if (!res.ok) return exitWith('Failed to load proposals: ' + (res.error || 'unknown'));
  const proposals = res.proposals || [];
  if (!proposals.length) { console.log('No proposals found'); return; }
  console.log('Proposals:');
  proposals.forEach((p: any) => console.log(formatProposalRow(p)));
}

async function cmdPreview(id: any) {
  if (!id) return exitWith('--id is required for --preview');
  const res: any = LocatorApplyManager.generatePatchesFor([id]);
  if (!res.ok) return exitWith('Failed generating patch: ' + (res.error || 'unknown'));
  const r = res.results && res.results[0];
  if (!r) return exitWith('No result for id ' + id);
  if (!r.ok) return exitWith('Patch generation error: ' + (r.error || 'unknown'));
  const content = fs.readFileSync(r.patchFile, 'utf8');
  console.log('--- PATCH:', r.patchFile, '---');
  console.log(content);
}

async function cmdPrepare(idsCsv: any) {
  if (!idsCsv) return exitWith('--ids required for --prepare');
  const ids = idsCsv.split(',').map((s: any) => s.trim()).filter(Boolean);
  if (!ids.length) return exitWith('No ids provided');
  // prepare backups
  const res: any = LocatorApplyManager.prepareBackupFor(ids);
  if (!res.ok) return exitWith('Failed preparing backup: ' + (res.error || JSON.stringify(res)));
  console.log('Backup created at:', res.backupRoot);
  console.log('Manifest:', res.manifestPath);
  console.log('Items:', JSON.stringify(res.manifest.items, null, 2));
}

async function cmdApply(idsCsv: any) {
  if (!idsCsv) return exitWith('--ids required for --apply');
  const ids = idsCsv.split(',').map((s: any) => s.trim()).filter(Boolean);
  if (!ids.length) return exitWith('No ids provided');

  // Validate proposals exist and are LOW risk
  const loaded: any = LocatorApplyManager.listProposals();
  if (!loaded.ok) return exitWith('Failed loading proposals');
  const proposals = loaded.proposals || [];
  const byId = new Map<string, any>(proposals.map((p: any) => [p.id, p]));
  for (const id of ids) {
    const p = byId.get(id);
    if (!p) return exitWith(`Proposal ${id} not found`);
    if (((p.risk || '') + '').toUpperCase() !== 'LOW') return exitWith(`Proposal ${id} risk is ${p.risk}; only LOW allowed`);
  }

  console.log('Preparing backup and patch files for:', ids.join(', '));
  const prep: any = LocatorApplyManager.prepareBackupFor(ids);
  if (!prep.ok) return exitWith('Failed preparing backup: ' + (prep.error || JSON.stringify(prep)));
  console.log('Backup root:', prep.backupRoot);

  const confirmed = await confirmPrompt(`Apply ${ids.length} proposals now? This will modify source files (but will NOT stage/commit/push).`);
  if (!confirmed) return console.log('Aborted by user');

  const applyRes: any = LocatorApplyManager.applyMultiple(ids);
  if (!applyRes.ok) return exitWith('Apply failed: ' + (applyRes.error || JSON.stringify(applyRes)));

  console.log('Applied proposals:', applyRes.applied.map((a: any) => a.id).join(', '));
  console.log('Backup root:', applyRes.backupRoot);
  console.log('Approval report:', applyRes.reportPath);

  // Run optional smoke validation
  const smoke = runSmokeValidationIfConfigured();
  if (smoke.ran) {
    console.log('Smoke validation result:', smoke.ok ? 'OK' : 'FAILED');
    if (smoke.stdout) console.log('stdout (tail):\n', smoke.stdout);
    if (smoke.stderr) console.log('stderr (tail):\n', smoke.stderr);
  } else {
    console.log(smoke.message);
  }
}

async function cmdRollback(backupRoot: any) {
  if (!backupRoot) return exitWith('--backup <root> required for --rollback');
  const confirmed = await confirmPrompt(`Rollback will restore files from backup root: ${backupRoot}. Proceed?`);
  if (!confirmed) return console.log('Rollback aborted by user');
  const res: any = LocatorApplyManager.rollback(backupRoot);
  if (!res.ok) return exitWith('Rollback reported errors: ' + JSON.stringify(res.errors || res));
  console.log('Rollback complete. Restored files:', res.restored.length);
  console.log('Approval report:', res.reportPath);
}

async function main() {
  const opts = parseArgs();
  if (opts.help) { usage(); return; }

  try {
    if (opts.list) return await cmdList();
    if (opts.preview) return await cmdPreview(opts.id);
    if (opts.prepare) return await cmdPrepare(opts.ids);
    if (opts.apply) return await cmdApply(opts.ids);
    if (opts.rollback) return await cmdRollback(opts.backup);
    usage();
  } catch (e: any) {
    console.error('Unhandled error:', e && e.stack ? e.stack : e);
    process.exit(3);
  }
}

if (require.main === module) {
  main();
}

export { main };
export default { main: main };
