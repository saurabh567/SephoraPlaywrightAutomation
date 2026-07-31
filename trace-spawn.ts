#!/usr/bin/env node
/**
 * trace-spawn.ts — Intercepts ALL child_process spawn/fork/exec calls
 * and logs the exact command and arguments being executed.
 *
 * Usage: node -r ./trace-spawn.js node utils/runCucumberWithAi.js
 *   or:  node -r ./trace-spawn.js <any-script>
 */
import cp, { ChildProcess, spawn, spawnSync, exec, execSync, execFile, fork } from 'child_process';
import type { SpawnSyncReturns } from 'child_process';
import fs from 'fs-extra';
import path from 'path';

const LOG = path.join(__dirname, 'logs', 'process-trace.log');
fs.ensureDirSync(path.dirname(LOG));

function ts(): string { return new Date().toISOString(); }
function log(msg: string): void {
  const line = `[${ts()}] ${msg}\n`;
  fs.appendFileSync(LOG, line);
  process.stderr.write(line);
}

// Intercept spawn
const origSpawn: any = cp.spawn;
cp.spawn = (function (command: string, args?: readonly string[], options?: Parameters<typeof spawn>[2]): ChildProcess {
  const opts = options || {};
  log(`SPAWN  cmd="${command}" args=${JSON.stringify(args)} shell=${!!opts.shell} cwd=${opts.cwd || process.cwd()}`);
  return origSpawn.call(cp, command, args, options);
}) as any;

// Intercept spawnSync
const origSpawnSync: any = cp.spawnSync;
cp.spawnSync = (function (command: string, args?: readonly string[], options?: Parameters<typeof spawnSync>[2]): SpawnSyncReturns<Buffer> {
  const opts = options || {};
  log(`SPAWNSYNC cmd="${command}" args=${JSON.stringify(args)} shell=${!!opts.shell} cwd=${opts.cwd || process.cwd()}`);
  return origSpawnSync.call(cp, command, args, options);
}) as any;

// Intercept exec
const origExec: any = cp.exec;
cp.exec = (function (command: string, options?: Parameters<typeof exec>[1], callback?: Parameters<typeof exec>[2]): ChildProcess {
  log(`EXEC    cmd="${command}"`);
  return origExec.call(cp, command, options, callback);
}) as any;

// Intercept execSync
const origExecSync: any = cp.execSync;
cp.execSync = (function (command: string, options?: Parameters<typeof execSync>[1]): Buffer {
  log(`EXECSYNC cmd="${command}"`);
  return origExecSync.call(cp, command, options);
}) as any;

// Intercept execFile
const origExecFile: any = cp.execFile;
cp.execFile = (function (file: string, args?: readonly string[], options?: Parameters<typeof execFile>[2], callback?: Parameters<typeof execFile>[3]): ChildProcess {
  log(`EXECFILE file="${file}" args=${JSON.stringify(args)}`);
  return origExecFile.call(cp, file, args, options, callback);
}) as any;

// Intercept fork
const origFork: any = cp.fork;
cp.fork = (function (modulePath: string, args?: readonly string[], options?: Parameters<typeof fork>[2]): ChildProcess {
  log(`FORK    module="${modulePath}" args=${JSON.stringify(args)}`);
  return origFork.call(cp, modulePath, args, options);
}) as any;

log('=== SPAWN TRACER STARTED ===');

export {};
