#!/usr/bin/env node
/**
 * trace-spawn.js — Intercepts ALL child_process spawn/fork/exec calls
 * and logs the exact command and arguments being executed.
 * 
 * Usage: node -r ./trace-spawn.js node utils/runCucumberWithAi.js
 *   or:  node -r ./trace-spawn.js <any-script>
 */

const cp = require('child_process');
const fs = require('fs-extra');
const path = require('path');

const LOG = path.join(__dirname, 'logs', 'process-trace.log');
fs.ensureDirSync(path.dirname(LOG));

function ts() { return new Date().toISOString(); }
function log(msg) {
  const line = `[${ts()}] ${msg}\n`;
  fs.appendFileSync(LOG, line);
  process.stderr.write(line);
}

// Intercept spawn
const origSpawn = cp.spawn;
cp.spawn = function(command, args, options) {
  const callStack = new Error().stack.split('\n').slice(2, 6).join(' | ');
  const opts = options || {};
  log(`SPAWN  cmd="${command}" args=${JSON.stringify(args)} shell=${!!opts.shell} cwd=${opts.cwd || process.cwd()}`);
  return origSpawn.call(cp, command, args, options);
};

// Intercept spawnSync
const origSpawnSync = cp.spawnSync;
cp.spawnSync = function(command, args, options) {
  const callStack = new Error().stack.split('\n').slice(2, 6).join(' | ');
  const opts = options || {};
  log(`SPAWNSYNC cmd="${command}" args=${JSON.stringify(args)} shell=${!!opts.shell} cwd=${opts.cwd || process.cwd()}`);
  return origSpawnSync.call(cp, command, args, options);
};

// Intercept exec
const origExec = cp.exec;
cp.exec = function(command, options, callback) {
  log(`EXEC    cmd="${command}"`);
  return origExec.call(cp, command, options, callback);
};

// Intercept execSync
const origExecSync = cp.execSync;
cp.execSync = function(command, options) {
  log(`EXECSYNC cmd="${command}"`);
  return origExecSync.call(cp, command, options);
};

// Intercept execFile
const origExecFile = cp.execFile;
cp.execFile = function(file, args, options, callback) {
  log(`EXECFILE file="${file}" args=${JSON.stringify(args)}`);
  return origExecFile.call(cp, file, args, options, callback);
};

// Intercept fork
const origFork = cp.fork;
cp.fork = function(modulePath, args, options) {
  log(`FORK    module="${modulePath}" args=${JSON.stringify(args)}`);
  return origFork.call(cp, modulePath, args, options);
};

log('=== SPAWN TRACER STARTED ===');
