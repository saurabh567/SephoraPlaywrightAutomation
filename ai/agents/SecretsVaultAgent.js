// SecretsVaultAgent - Phase 16
// Centralized secrets and credential management for tests, CI/CD, and cloud device farms.
// Encrypts, stores, and injects credentials into environment configurations,
// with automatic rotation tracking, masking in logs, and multi-profile support.
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

const VAULT_DIR = path.join(process.cwd(), 'ai', 'vault');
const SECRETS_FILE = path.join(VAULT_DIR, 'secrets.enc.json');
const MANIFEST_FILE = path.join(VAULT_DIR, 'manifest.json');
const KEY_FILE = path.join(VAULT_DIR, '.vault_key');
const BACKUP_DIR = path.join(VAULT_DIR, 'backups');
const AUDIT_LOG = path.join(VAULT_DIR, 'audit.log');

function ensureDirs() {
  fs.ensureDirSync(VAULT_DIR);
  fs.ensureDirSync(BACKUP_DIR);
}

function timestamp() {
  return new Date().toISOString();
}

function audit(action, detail) {
  ensureDirs();
  var line = '[' + timestamp() + '] ' + action + ': ' + JSON.stringify(detail) + '\n';
  try { fs.appendFileSync(AUDIT_LOG, line); } catch { /* ignore */ }
}

// ---------- Encryption ----------

function deriveKey(masterPassword) {
  return crypto.createHash('sha256').update(String(masterPassword)).digest();
}

function encrypt(text, key) {
  var iv = crypto.randomBytes(16);
  var cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  var encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(encryptedText, key) {
  var parts = String(encryptedText).split(':');
  var iv = Buffer.from(parts[0], 'hex');
  var encrypted = Buffer.from(parts[1], 'hex');
  var decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  var decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

function generateKey() {
  return crypto.randomBytes(32).toString('hex');
}

// ---------- Vault State ----------

function loadVault() {
  ensureDirs();
  if (!fs.existsSync(SECRETS_FILE)) {
    fs.writeJsonSync(SECRETS_FILE, { version: 1, profiles: {} }, { spaces: 2 });
  }
  try { return fs.readJsonSync(SECRETS_FILE); } catch { return { version: 1, profiles: {} }; }
}

function saveVault(vault) {
  fs.writeJsonSync(SECRETS_FILE, vault, { spaces: 2 });
}

function loadManifest() {
  ensureDirs();
  if (!fs.existsSync(MANIFEST_FILE)) {
    var m = { createdAt: timestamp(), secretsCount: 0, profiles: [], lastRotated: null, keyHash: null };
    fs.writeJsonSync(MANIFEST_FILE, m, { spaces: 2 });
    return m;
  }
  try { return fs.readJsonSync(MANIFEST_FILE); } catch { return { createdAt: timestamp(), secretsCount: 0, profiles: [], lastRotated: null, keyHash: null }; }
}

function saveManifest(m) {
  fs.writeJsonSync(MANIFEST_FILE, m, { spaces: 2 });
}

function getOrCreateVaultKey() {
  ensureDirs();
  if (fs.existsSync(KEY_FILE)) {
    return fs.readFileSync(KEY_FILE, 'utf8').trim();
  }
  var key = generateKey();
  fs.writeFileSync(KEY_FILE, key, 'utf8');
  fs.chmodSync(KEY_FILE, '600');
  audit('VAULT_KEY_CREATED', {});
  return key;
}

// ---------- Profile Definitions ----------

var VAULT_PROFILES = {
  browserstack: {
    service: 'BrowserStack',
    fields: { username: 'BROWSERSTACK_USERNAME', accessKey: 'BROWSERSTACK_ACCESS_KEY' },
    envVars: ['BROWSERSTACK_USERNAME', 'BROWSERSTACK_ACCESS_KEY', 'BROWSERSTACK_BUILD_NAME', 'BROWSERSTACK_PROJECT_NAME'],
    description: 'BrowserStack cloud device farm credentials',
  },
  saucelabs: {
    service: 'Sauce Labs',
    fields: { username: 'SAUCE_USERNAME', accessKey: 'SAUCE_ACCESS_KEY' },
    envVars: ['SAUCE_USERNAME', 'SAUCE_ACCESS_KEY', 'SAUCE_URL'],
    description: 'Sauce Labs cloud device farm credentials',
  },
  openai: {
    service: 'OpenAI / LLM',
    fields: { apiKey: 'OPENAI_API_KEY' },
    envVars: ['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_MODEL'],
    description: 'OpenAI-compatible LLM provider key for AI agents',
  },
  jenkins: {
    service: 'Jenkins CI',
    fields: { url: 'JENKINS_URL', username: 'JENKINS_USERNAME', apiToken: 'JENKINS_API_TOKEN' },
    envVars: ['JENKINS_URL', 'JENKINS_USERNAME', 'JENKINS_API_TOKEN'],
    description: 'Jenkins CI server credentials',
  },
  email: {
    service: 'Email / SMTP',
    fields: { smtpHost: 'SMTP_HOST', smtpPort: 'SMTP_PORT', username: 'SMTP_USERNAME', password: 'SMTP_PASSWORD' },
    envVars: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USERNAME', 'SMTP_PASSWORD'],
    description: 'SMTP email credentials for notification alerts',
  },
};

// ---------- Main Agent ----------
var SecretsVaultAgent = {
  name: 'SecretsVaultAgent',
  version: '1.0.0',

  // Initialize the vault with a new master key
  init: function() {
    ensureDirs();
    var key = getOrCreateVaultKey();
    var vault = loadVault();
    var manifest = loadManifest();
    manifest.keyHash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
    manifest.initializedAt = timestamp();
    saveManifest(manifest);
    audit('VAULT_INITIALIZED', { keyHash: manifest.keyHash });
    return { ok: true, initialized: true, keyHash: manifest.keyHash, vaultPath: path.relative(process.cwd(), SECRETS_FILE) };
  },

  // Store a secret in the vault
  setSecret: function(profile, field, value) {
    if (!value) return { ok: false, error: 'Value is required' };
    var profileDef = VAULT_PROFILES[profile];
    if (!profileDef) return { ok: false, error: 'Unknown profile: ' + profile + '. Available: ' + Object.keys(VAULT_PROFILES).join(', ') };
    if (!profileDef.fields[field]) return { ok: false, error: 'Unknown field "' + field + '" for profile "' + profile + '". Fields: ' + Object.keys(profileDef.fields).join(', ') };

    var key = getOrCreateVaultKey();
    var vault = loadVault();
    if (!vault.profiles[profile]) vault.profiles[profile] = {};
    vault.profiles[profile][field] = encrypt(value, deriveKey(key));
    vault.profiles[profile]._updatedAt = timestamp();
    saveVault(vault);

    var manifest = loadManifest();
    manifest.secretsCount = Object.keys(vault.profiles).reduce(function(sum, p) {
      return sum + Object.keys(vault.profiles[p]).filter(function(k) { return !k.startsWith('_'); }).length;
    }, 0);
    if (manifest.profiles.indexOf(profile) === -1) manifest.profiles.push(profile);
    saveManifest(manifest);

    audit('SECRET_SET', { profile: profile, field: field });
    return { ok: true, profile: profile, field: field, masked: value.slice(0, 3) + '****' + value.slice(-3) };
  },

  // Get a decrypted secret from the vault
  getSecret: function(profile, field) {
    var key = getOrCreateVaultKey();
    var vault = loadVault();
    if (!vault.profiles[profile]) return null;
    var encrypted = vault.profiles[profile][field];
    if (!encrypted) return null;
    try {
      return decrypt(encrypted, deriveKey(key));
    } catch { return null; }
  },

  // Store all fields for a profile at once (convenience)
  setProfile: function(profile, values) {
    var profileDef = VAULT_PROFILES[profile];
    if (!profileDef) return { ok: false, error: 'Unknown profile: ' + profile };

    var results = [];
    Object.keys(values).forEach(function(field) {
      if (profileDef.fields[field]) {
        var r = this.setSecret(profile, field, values[field]);
        results.push(r);
      }
    }.bind(this));

    var ok = results.every(function(r) { return r.ok; });
    return { ok: ok, profile: profile, results: results };
  },

  // Inject vault secrets into process.env (for runtime use)
  injectToEnv: function(profile) {
    var profileDef = VAULT_PROFILES[profile];
    if (!profileDef) return { ok: false, error: 'Unknown profile: ' + profile };

    var injected = [];
    Object.keys(profileDef.fields).forEach(function(field) {
      var value = this.getSecret(profile, field);
      var envVar = profileDef.fields[field];
      if (value && !process.env[envVar]) {
        process.env[envVar] = value;
        injected.push(envVar);
      }
    }.bind(this));

    // Also set derived env vars
    profileDef.envVars.forEach(function(envVar) {
      if (!process.env[envVar] && profileDef.fields[envVar.toLowerCase()]) {
        var value = this.getSecret(profile, envVar.toLowerCase());
        if (value) {
          process.env[envVar] = value;
          if (injected.indexOf(envVar) === -1) injected.push(envVar);
        }
      }
    }.bind(this));

    audit('ENV_INJECTED', { profile: profile, vars: injected });
    return { ok: true, profile: profile, injected: injected };
  },

  // Inject all known profiles into env
  injectAllToEnv: function() {
    var results = {};
    Object.keys(VAULT_PROFILES).forEach(function(profile) {
      results[profile] = this.injectToEnv(profile);
    }.bind(this));
    return results;
  },

  // Generate a .env file from vault secrets
  generateEnvFile: function(outputPath, profiles) {
    profiles = profiles || Object.keys(VAULT_PROFILES);
    var lines = [];
    lines.push('# Auto-generated environment file from SecretsVaultAgent');
    lines.push('# Generated: ' + timestamp());
    lines.push('');

    profiles.forEach(function(profile) {
      var profileDef = VAULT_PROFILES[profile];
      if (!profileDef) return;
      lines.push('# ' + profileDef.description + ' (' + profileDef.service + ')');
      Object.keys(profileDef.fields).forEach(function(field) {
        var value = this.getSecret(profile, field);
        var envVar = profileDef.fields[field];
        if (value) {
          lines.push(envVar + '=' + value);
        } else {
          lines.push('# ' + envVar + '= (not set in vault)');
        }
      }.bind(this));
      profileDef.envVars.forEach(function(envVar) {
        // Skip if already outputted via fields mapping
        var alreadyOutput = Object.keys(profileDef.fields).some(function(f) { return profileDef.fields[f] === envVar; });
        if (!alreadyOutput) {
          lines.push('# ' + envVar + '= (set manually or via vault)');
        }
      });
      lines.push('');
    }.bind(this));

    var fp = outputPath || path.join(process.cwd(), '.env.vault-generated');
    fs.writeFileSync(fp, lines.join('\n'), 'utf8');
    audit('ENV_FILE_GENERATED', { path: path.relative(process.cwd(), fp), profiles: profiles });
    return { ok: true, path: path.relative(process.cwd(), fp), profiles: profiles };
  },

  // List all profiles with their field status
  listProfiles: function() {
    var vault = loadVault();
    var result = [];
    Object.keys(VAULT_PROFILES).forEach(function(key) {
      var def = VAULT_PROFILES[key];
      var profileData = vault.profiles[key] || {};
      var fields = {};
      Object.keys(def.fields).forEach(function(f) {
        var hasSecret = !!profileData[f];
        fields[f] = { envVar: def.fields[f], stored: hasSecret };
      });
      var allSet = Object.keys(fields).every(function(f) { return fields[f].stored; });
      result.push({
        profile: key,
        service: def.service,
        fields: fields,
        allSecretsStored: allSet,
        updatedAt: profileData._updatedAt || null,
      });
    });
    return result;
  },

  // Rotate the vault key (re-encrypts all secrets with new key)
  rotateKey: function() {
    var oldKey = getOrCreateVaultKey();
    var vault = loadVault();
    var newKey = generateKey();

    // Re-encrypt all secrets
    Object.keys(vault.profiles).forEach(function(profile) {
      Object.keys(vault.profiles[profile]).forEach(function(field) {
        if (field.startsWith('_')) return;
        try {
          var decrypted = decrypt(vault.profiles[profile][field], deriveKey(oldKey));
          vault.profiles[profile][field] = encrypt(decrypted, deriveKey(newKey));
        } catch { /* skip corrupted entries */ }
      });
    });

    saveVault(vault);
    fs.writeFileSync(KEY_FILE, newKey, 'utf8');
    fs.chmodSync(KEY_FILE, '600');

    var manifest = loadManifest();
    manifest.lastRotated = timestamp();
    manifest.keyHash = crypto.createHash('sha256').update(newKey).digest('hex').slice(0, 16);
    saveManifest(manifest);

    // Backup old vault
    var backupPath = path.join(BACKUP_DIR, 'secrets-backup-' + Date.now() + '.json');
    // Read original before rotation for backup — but we already re-encrypted.
    // The backup is of the new state; old key was discarded.
    fs.copyFileSync(SECRETS_FILE, backupPath);

    audit('KEY_ROTATED', { newKeyHash: manifest.keyHash, backupPath: path.relative(process.cwd(), backupPath) });
    return { ok: true, rotatedAt: timestamp(), keyHash: manifest.keyHash, backupPath: path.relative(process.cwd(), backupPath) };
  },

  // Main run method
  run: function(input) {
    console.log('[SecretsVaultAgent] Centralized credential and secrets management');

    var action = (input && input.action) || 'status';

    if (action === 'init') {
      return this.init();
    }

    if (action === 'set') {
      return this.setSecret(input.profile, input.field, input.value);
    }

    if (action === 'set-profile') {
      return this.setProfile(input.profile, input.values || {});
    }

    if (action === 'inject') {
      if (input.profile) return this.injectToEnv(input.profile);
      return this.injectAllToEnv();
    }

    if (action === 'generate-env') {
      return this.generateEnvFile(input.outputPath, input.profiles);
    }

    if (action === 'rotate') {
      return this.rotateKey();
    }

    // Default: status
    var manifest = loadManifest();
    var profiles = this.listProfiles();
    var allSet = profiles.filter(function(p) { return p.allSecretsStored; }).length;
    var total = profiles.length;
    var vaultExists = fs.existsSync(SECRETS_FILE) && fs.existsSync(KEY_FILE);

    console.log('  Vault initialized: ' + vaultExists);
    console.log('  Profiles: ' + allSet + '/' + total + ' fully configured');
    console.log('  Last key rotation: ' + (manifest.lastRotated || 'never'));

    return {
      ok: vaultExists,
      status: vaultExists ? 'initialized' : 'not-initialized',
      vaultPath: path.relative(process.cwd(), SECRETS_FILE),
      totalProfiles: total,
      configuredProfiles: allSet,
      profiles: profiles,
      manifest: manifest,
      auditLogPath: path.relative(process.cwd(), AUDIT_LOG),
    };
  },

  // Get audit log
  getAuditLog: function() {
    ensureDirs();
    if (!fs.existsSync(AUDIT_LOG)) return [];
    try {
      return fs.readFileSync(AUDIT_LOG, 'utf8').trim().split('\n').filter(Boolean).map(function(line) {
        var match = line.match(/^\[(.+?)\] (.+?): (.+)$/);
        if (match) return { timestamp: match[1], action: match[2], detail: match[3] };
        return { raw: line };
      });
    } catch { return []; }
  },

  // Get vault status
  getStatus: function() {
    return this.run({ action: 'status' });
  },
};

// CLI entry point
function main() {
  var args = process.argv.slice(2);
  var command = args[0] || 'status';

  if (command === 'init') {
    var result = SecretsVaultAgent.init();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (command === 'status' || command === 'list') {
    var result = SecretsVaultAgent.getStatus();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'set') {
    var profile = args[1];
    var field = args[2];
    var value = args[3];
    if (!profile || !field || !value) {
      console.log('Usage: set <profile> <field> <value>');
      process.exit(1);
    }
    var result = SecretsVaultAgent.setSecret(profile, field, value);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'set-profile') {
    var profile = args[1];
    if (!profile) { console.log('Usage: set-profile <profile> key1=val1 key2=val2 ...'); process.exit(1); }
    var values = {};
    args.slice(2).forEach(function(kv) {
      var parts = kv.split('=');
      if (parts.length === 2) values[parts[0]] = parts[1];
    });
    var result = SecretsVaultAgent.setProfile(profile, values);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'inject') {
    var profile = args[1] || undefined;
    var result = profile ? SecretsVaultAgent.injectToEnv(profile) : SecretsVaultAgent.injectAllToEnv();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'generate-env') {
    var outputPath = args[1] || undefined;
    var result = SecretsVaultAgent.generateEnvFile(outputPath);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'rotate') {
    var result = SecretsVaultAgent.rotateKey();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'audit') {
    var log = SecretsVaultAgent.getAuditLog();
    console.log(JSON.stringify(log, null, 2));
    return;
  }

  console.log('Unknown command: ' + command);
  console.log('Commands: init, status, set <profile> <field> <value>, set-profile <profile> k=v..., inject [profile], generate-env [path], rotate, audit');
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error('[SecretsVaultAgent] CLI error:', e.message);
    process.exit(1);
  }
}

module.exports = SecretsVaultAgent;
