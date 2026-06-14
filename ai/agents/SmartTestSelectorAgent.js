// SmartTestSelectorAgent - Phase 14
// Intelligent cross-platform test selector that analyzes code changes, test history,
// and risk patterns to determine the optimal subset of tests for any given change.
// Integrates with CI/CD to minimize execution time while maintaining quality coverage.
const fs = require('fs-extra');
const path = require('path');

const SELECTOR_STATE_PATH = path.join(process.cwd(), 'ai/memory/selector-state.json');
const REPORTS_DIR = path.join(process.cwd(), 'reports', 'ai', 'selector');
const FRAMEWORK_DIRS = ['pages', 'step-definitions', 'features', 'framework', 'mobile', 'test-data'];

function ensureDirs() {
  fs.ensureDirSync(path.dirname(SELECTOR_STATE_PATH));
  fs.ensureDirSync(REPORTS_DIR);
}

function loadState() {
  ensureDirs();
  if (!fs.existsSync(SELECTOR_STATE_PATH)) {
    fs.writeJsonSync(SELECTOR_STATE_PATH, { selections: [] }, { spaces: 2 });
  }
  return fs.readJsonSync(SELECTOR_STATE_PATH);
}

function saveState(state) {
  fs.writeJsonSync(SELECTOR_STATE_PATH, state, { spaces: 2 });
}

function timestamp() {
  return new Date().toISOString();
}

function safeReadJson(filePath) {
  try { if (fs.existsSync(filePath)) return fs.readJsonSync(filePath); } catch { /* ignore */ }
  return null;
}

// ---------- Feature Risk Analysis ----------

// Pre-defined feature-to-page mapping for Amazon India
var FEATURE_RISK_MAP = [
  { feature: 'home.feature', pages: ['AmazonHomePage', 'HomePage', 'BasePage'], tags: ['@smoke', '@regression'], risk: 'low', dependencies: ['navigation', 'search'] },
  { feature: 'search_results.feature', pages: ['AmazonSearchResultsPage', 'AmazonHomePage', 'SearchResultsPage'], tags: ['@regression'], risk: 'medium', dependencies: ['search', 'navigation'] },
  { feature: 'product_details.feature', pages: ['AmazonProductDetailsPage', 'AmazonSearchResultsPage', 'AmazonHomePage'], tags: ['@regression'], risk: 'medium', dependencies: ['search', 'product', 'navigation'] },
  { feature: 'cart.feature', pages: ['AmazonCartPage', 'AmazonProductDetailsPage', 'AmazonHomePage', 'AmazonSearchResultsPage', 'CartPage'], tags: ['@smoke', '@regression'], risk: 'high', dependencies: ['cart', 'search', 'product', 'navigation'] },
];

var MOBILE_FEATURES = [
  { feature: 'Android', pages: ['AmazonAndroidPage', 'AndroidLoginPage'], tags: ['@android'], risk: 'medium' },
  { feature: 'iOS', pages: ['AmazonIOSAppPage', 'AmazonIOSSafariPage', 'IOSLoginPage'], tags: ['@ios'], risk: 'medium' },
];

// Map changed files to affected features
function mapChangedFilesToFeatures(changedFiles) {
  var affected = new Set();
  var affectedPages = new Set();
  var affectedTags = new Set();
  var risks = [];

  changedFiles.forEach(function(file) {
    var lower = file.toLowerCase();

    // Check feature-to-page mapping
    FEATURE_RISK_MAP.forEach(function(fm) {
      var matched = fm.pages.some(function(p) {
        return lower.indexOf(p.toLowerCase()) !== -1;
      });
      // Also match step definition files that might use pages
      if (lower.indexOf('step-definition') !== -1 || lower.indexOf('.steps.') !== -1) {
        matched = true;
      }
      if (lower.indexOf(fm.feature.toLowerCase().replace('.feature', '')) !== -1) {
        matched = true;
      }
      if (matched) {
        affected.add(fm.feature);
        fm.tags.forEach(function(t) { affectedTags.add(t); });
        risks.push({ feature: fm.feature, risk: fm.risk, reason: 'Changed file: ' + file });
      }
    });

    // Mobile-specific
    MOBILE_FEATURES.forEach(function(mf) {
      if (lower.indexOf(mf.feature.toLowerCase()) !== -1 || lower.indexOf('mobile/') !== -1) {
        affected.add('mobile-' + mf.feature);
        mf.tags.forEach(function(t) { affectedTags.add(t); });
        risks.push({ feature: 'mobile-' + mf.feature, risk: mf.risk, reason: 'Changed mobile file: ' + file });
      }
    });

    // Framework changes affect everything
    if (lower.indexOf('framework/') !== -1 || lower.indexOf('hooks/') !== -1 || lower.indexOf('cucumber.js') !== -1) {
      affectedTags.add('@all');
      risks.push({ feature: 'ALL', risk: 'critical', reason: 'Framework change: ' + file });
    }

    // Config changes affect everything
    if (lower.indexOf('.env') !== -1 || lower.indexOf('config/') !== -1) {
      affectedTags.add('@all');
      risks.push({ feature: 'ALL', risk: 'critical', reason: 'Config change: ' + file });
    }
  });

  return {
    features: Array.from(affected),
    tags: Array.from(affectedTags),
    risks: risks,
  };
}

// Determine optimal test strategy based on risk and run type
function determineTestStrategy(analysis, options) {
  var strategy = {
    runAll: false,
    runSmoke: false,
    runRegression: false,
    runCustomTags: [],
    features: [],
    priority: 'normal',
    estimatedTime: '~2 min',
    description: '',
  };

  var hasCritical = analysis.risks.some(function(r) { return r.risk === 'critical'; });
  var hasHigh = analysis.risks.some(function(r) { return r.risk === 'high'; });
  var hasMedium = analysis.risks.some(function(r) { return r.risk === 'medium'; });
  var runType = options.runType || (process.env.CI ? 'ci' : 'local');

  if (hasCritical || options.forceFull) {
    strategy.runAll = true;
    strategy.priority = 'critical';
    strategy.estimatedTime = '~5-15 min';
    strategy.description = 'Critical changes detected. Running all tests.';
  } else if (hasHigh && runType === 'ci') {
    strategy.runAll = true;
    strategy.priority = 'high';
    strategy.estimatedTime = '~5-15 min';
    strategy.description = 'High-risk changes in CI. Running all tests.';
  } else if (hasHigh && runType === 'local') {
    strategy.runRegression = true;
    strategy.priority = 'high';
    strategy.estimatedTime = '~3-8 min';
    strategy.description = 'High-risk changes. Running regression suite.';
  } else if (hasMedium) {
    strategy.runRegression = true;
    strategy.priority = 'medium';
    strategy.estimatedTime = '~3-8 min';
    strategy.description = 'Medium-risk changes. Running regression.';
  } else {
    strategy.runSmoke = true;
    strategy.priority = 'low';
    strategy.estimatedTime = '~1-3 min';
    strategy.description = 'Low-risk changes. Running smoke tests.';
  }

  // Add specific affected features
  if (analysis.features.length > 0) {
    strategy.features = analysis.features;
  }

  // Add tags from analysis
  analysis.tags.forEach(function(t) {
    t = t.replace('@', '');
    if (t === 'all' || t === 'smoke') strategy.runSmoke = true;
    if (t === 'regression') strategy.runRegression = true;
  });

  // Custom options
  if (options.tags) {
    strategy.runCustomTags = Array.isArray(options.tags) ? options.tags : [options.tags];
  }

  return strategy;
}

// ---------- Change Detection ----------

// Get git diff (changed files) between current state and a reference
function getChangedFiles(ref) {
  ref = ref || 'HEAD';
  try {
    var cp = require('child_process');
    var result = cp.spawnSync('git', ['diff', '--name-only', ref], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
    if (result.status === 0 && result.stdout) {
      return result.stdout.trim().split('\n').filter(Boolean);
    }
  } catch { /* ignore */ }
  return [];
}

// Simulate file changes for demo/testing when no git diff exists
function getSimulatedChanges() {
  var files = [];
  FRAMEWORK_DIRS.forEach(function(dir) {
    var dirPath = path.join(process.cwd(), dir);
    if (fs.existsSync(dirPath)) {
      try {
        var entries = fs.readdirSync(dirPath, { recursive: true });
        entries.forEach(function(e) {
          var fp = path.join(dirPath, e);
          if (fs.statSync(fp).isFile() && (e.endsWith('.js') || e.endsWith('.feature'))) {
            files.push(path.relative(process.cwd(), fp));
          }
        });
      } catch { /* ignore */ }
    }
  });
  return files.slice(0, 5); // return only a few for mock
}

// ---------- Main Agent ----------
var SmartTestSelectorAgent = {
  name: 'SmartTestSelectorAgent',
  version: '1.0.0',

  // Analyze changes and select optimal test strategy
  selectTests: function(options) {
    console.log('[SmartTestSelectorAgent] Analyzing changes and selecting optimal tests');

    options = options || {};

    // 1. Get changed files
    var changedFiles = options.changedFiles;
    if (!changedFiles || changedFiles.length === 0) {
      changedFiles = getChangedFiles(options.gitRef);
    }
    if (!changedFiles || changedFiles.length === 0) {
      changedFiles = getSimulatedChanges();
    }

    console.log('  Files changed: ' + changedFiles.length);

    // 2. Map to features/risks
    var analysis = mapChangedFilesToFeatures(changedFiles);
    console.log('  Affected features: ' + analysis.features.join(', '));

    // 3. Determine strategy
    var strategy = determineTestStrategy(analysis, options);

    // 4. Build executable command suggestion
    var command = '';
    if (strategy.runAll) {
      command = 'npm run test:all';
    } else if (strategy.runRegression) {
      command = 'npm run test:regression';
    } else if (strategy.runSmoke) {
      command = 'npm run test:smoke';
    } else if (strategy.features.length > 0) {
      var featurePaths = strategy.features.map(function(f) {
        return 'features/' + f.replace('mobile-', '');
      }).filter(function(fp) { return fs.existsSync(path.join(process.cwd(), fp)); });
      if (featurePaths.length > 0) {
        command = 'npx cucumber-js --config cucumber.js ' + featurePaths.join(' ');
      } else {
        command = 'npm run test:smoke';
      }
    } else {
      command = 'npm run test:smoke';
    }

    // Add tags if specified
    if (strategy.runCustomTags.length > 0) {
      command += ' --tags ' + strategy.runCustomTags.join(' and ');
    }

    // 5. Track selection
    var state = loadState();
    var selection = {
      id: 'sel-' + Date.now(),
      selectedAt: timestamp(),
      changedFiles: changedFiles.length,
      changedFileList: changedFiles.slice(0, 20),
      analysis: {
        features: analysis.features,
        tags: analysis.tags,
        risks: analysis.risks,
      },
      strategy: strategy,
      command: command,
    };
    state.selections.push(selection);
    saveState(state);

    return {
      ok: true,
      selection: selection,
      analysis: analysis,
      strategy: strategy,
      command: command,
    };
  },

  // Run the selector (public API for orchestrator)
  run: function(input) {
    console.log('[SmartTestSelectorAgent] Intelligent cross-platform test selection');

    var options = {
      changedFiles: input && input.changedFiles,
      gitRef: input && input.gitRef,
      runType: input && input.runType,
      forceFull: input && input.forceFull,
      tags: input && input.tags,
    };

    var result = this.selectTests(options);

    // Generate report
    var reportPath = path.join(REPORTS_DIR, 'test-selection-' + result.selection.id + '.md');
    var lines = [];
    lines.push('# Smart Test Selection Report');
    lines.push('');
    lines.push('Generated: ' + timestamp());
    lines.push('Agent: ' + this.name + ' v' + this.version);
    lines.push('');
    lines.push('## Strategy');
    lines.push('');
    lines.push('| Aspect | Value |');
    lines.push('|---|---|');
    lines.push('| Priority | ' + result.strategy.priority + ' |');
    lines.push('| Run All | ' + result.strategy.runAll + ' |');
    lines.push('| Run Smoke | ' + result.strategy.runSmoke + ' |');
    lines.push('| Run Regression | ' + result.strategy.runRegression + ' |');
    lines.push('| Estimated Time | ' + result.strategy.estimatedTime + ' |');
    lines.push('| Description | ' + result.strategy.description + ' |');
    lines.push('');
    lines.push('## Affected Features');
    lines.push('');
    (result.analysis.features.length > 0 ? result.analysis.features : ['(none)']).forEach(function(f) {
      lines.push('- ' + f);
    });
    lines.push('');
    lines.push('## Risk Analysis');
    lines.push('');
    lines.push('| Feature | Risk | Reason |');
    lines.push('|---|---|---|');
    result.analysis.risks.forEach(function(r) {
      var icon = r.risk === 'critical' ? '&#x1F534;' : (r.risk === 'high' ? '&#x26A0;&#xFE0F;' : '&#x1F7E1;');
      lines.push('| ' + icon + ' ' + r.feature + ' | ' + r.risk + ' | ' + r.reason + ' |');
    });
    lines.push('');
    lines.push('## Recommended Command');
    lines.push('');
    lines.push('```bash');
    lines.push(result.command);
    lines.push('```');
    lines.push('');
    lines.push('## Changed Files (' + result.selection.changedFiles + ')');
    lines.push('');
    result.selection.changedFileList.forEach(function(f) {
      lines.push('- ' + f);
    });
    if (result.selection.changedFiles > 20) {
      lines.push('- ... and ' + (result.selection.changedFiles - 20) + ' more');
    }

    fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
    result.reportPath = path.relative(process.cwd(), reportPath);

    return result;
  },

  // Get selection history
  getSelectionHistory: function() {
    var state = loadState();
    return state.selections || [];
  },

  // Manually add list of changed files for analysis
  analyzeChangedFiles: function(fileList) {
    return this.selectTests({ changedFiles: fileList });
  },

  // List all features and their risk profiles
  listFeatureRiskProfile: function() {
    var profiles = [];
    FEATURE_RISK_MAP.forEach(function(fm) {
      profiles.push({
        feature: fm.feature,
        risk: fm.risk,
        pages: fm.pages,
        tags: fm.tags,
        dependencies: fm.dependencies,
      });
    });
    MOBILE_FEATURES.forEach(function(mf) {
      profiles.push({
        feature: mf.feature,
        risk: mf.risk,
        pages: mf.pages,
        tags: mf.tags,
        platform: 'mobile',
      });
    });
    return profiles;
  },

  // Reset selection history
  resetHistory: function() {
    saveState({ selections: [] });
    return { ok: true, message: 'Selection history cleared' };
  },
};

// CLI entry point
function main() {
  var args = process.argv.slice(2);
  var command = args[0] || 'run';

  if (command === 'run' || command === 'select') {
    var result = SmartTestSelectorAgent.run();
    console.log(JSON.stringify({ ok: result.ok, strategy: result.strategy, command: result.command, reportPath: result.reportPath }, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (command === 'analyze') {
    var files = args.slice(1);
    if (files.length === 0) {
      console.log('Usage: analyze <file1> [file2 ...]');
      process.exit(1);
    }
    var result = SmartTestSelectorAgent.analyzeChangedFiles(files);
    console.log(JSON.stringify({ strategy: result.strategy, command: result.command }, null, 2));
    return;
  }

  if (command === 'profile') {
    var profiles = SmartTestSelectorAgent.listFeatureRiskProfile();
    console.log('Feature Risk Profiles:');
    profiles.forEach(function(p) {
      console.log('  ' + p.feature + ' [' + p.risk + '] pages: ' + p.pages.join(', '));
    });
    return;
  }

  if (command === 'history') {
    var history = SmartTestSelectorAgent.getSelectionHistory();
    console.log(JSON.stringify(history, null, 2));
    return;
  }

  if (command === 'reset') {
    var result = SmartTestSelectorAgent.resetHistory();
    console.log(JSON.stringify(result));
    return;
  }

  console.log('Unknown command: ' + command);
  console.log('Commands: run, analyze <files...>, profile, history, reset');
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error('[SmartTestSelectorAgent] CLI error:', e.message);
    process.exit(1);
  }
}

module.exports = SmartTestSelectorAgent;
