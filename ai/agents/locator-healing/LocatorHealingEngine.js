// LocatorHealingEngine - Orchestrates complete locator healing workflow
// When a locator fails:
//   1. Capture failure context (locator, page, feature, scenario, error)
//   2. Search historical locators for similar patterns
//   3. Score candidate replacements with confidence scoring
//   4. Auto-apply if confidence > threshold
//   5. Record results in history store
//   6. Generate detailed report

const fs = require('fs-extra');
const path = require('path');
const LocatorHistoryStore = require('./LocatorHistoryStore');
const LocatorConfidenceScorer = require('./LocatorConfidenceScorer');
const LocatorHealingApplier = require('../locatorHealingApplier');

class LocatorHealingEngine {
  constructor(options = {}) {
    this.historyStore = options.historyStore || new LocatorHistoryStore();
    this.confidenceScorer = options.confidenceScorer || new LocatorConfidenceScorer({ historyStore: this.historyStore });
    this.applier = options.applier || new LocatorHealingApplier({ backupRoot: options.backupRoot });
    this.autoApplyThreshold = options.autoApplyThreshold || 0.80;
    this.mode = options.mode || 'recommend'; // 'recommend' | 'apply' | 'dry-run'
    this.reportDir = options.reportDir || path.join(process.cwd(), 'reports', 'ai');
    fs.ensureDirSync(this.reportDir);
  }

  /**
   * Analyze a single locator failure and generate healing candidates.
   * @param {Object} failure - { locator, page, feature, scenario, error, locatorType }
   * @returns {Object} Healing analysis result
   */
  async healFailure(failure) {
    const { locator: failedLocator, page: pageName, feature, scenario, error, locatorType } = failure;

    console.log(`[LocatorHealingEngine] Healing failure on: ${failedLocator} (${pageName})`);

    // 1. Record the failure in history
    if (pageName) {
      this.historyStore.recordFailure(pageName, failure.locatorName || failedLocator, error);
    }

    // 2. Generate candidate locators
    const candidates = this._generateCandidates(failure);

    // 3. Score each candidate
    const scored = candidates.map(candidate => {
      const scoringResult = this.confidenceScorer.score({
        failedLocator,
        candidateLocator: candidate.locator,
        pageName,
        locatorName: failure.locatorName || failedLocator,
        locatorType: candidate.type || locatorType || 'css'
      });

      return {
        ...candidate,
        confidenceScore: scoringResult.score,
        confidenceLabel: scoringResult.label,
        confidenceBreakdown: scoringResult.breakdown,
        recommendedAction: this.confidenceScorer.getRecommendedAction(scoringResult.score)
      };
    });

    // Sort by confidence descending
    scored.sort((a, b) => b.confidenceScore - a.confidenceScore);

    // 4. Determine auto-apply
    const bestCandidate = scored[0] || null;
    let applied = false;
    let applyResult = null;

    if (bestCandidate && this.confidenceScorer.isAutoApplyCandidate(bestCandidate.confidenceScore, this.autoApplyThreshold)) {
      if (this.mode === 'apply') {
        applyResult = await this._applyReplacement(failure, bestCandidate);
        applied = applyResult.success;
      } else if (this.mode === 'dry-run') {
        applyResult = { dryRun: true, wouldApply: true, candidate: bestCandidate };
      }
    }

    // 5. Record replacement in history
    if (applied && bestCandidate && pageName) {
      this.historyStore.recordReplacement(
        pageName,
        failure.locatorName || failedLocator,
        failedLocator,
        bestCandidate.locator,
        `auto-heal: confidence=${bestCandidate.confidenceScore}`
      );
    }

    return {
      failure: {
        locator: failedLocator,
        page: pageName,
        feature,
        scenario,
        error
      },
      candidatesGenerated: scored.length,
      bestCandidate,
      applied,
      applyResult,
      allCandidates: scored
    };
  }

  /**
   * Analyze multiple failures at once
   * @param {Array} failures - Array of failure objects
   * @returns {Array} Array of healing results
   */
  async healFailures(failures) {
    if (!Array.isArray(failures) || failures.length === 0) {
      return { skipped: true, reason: 'No failures provided', results: [] };
    }

    console.log(`[LocatorHealingEngine] Healing ${failures.length} failures`);
    const results = [];
    const analytics = {
      totalFailures: failures.length,
      totalCandidatesGenerated: 0,
      totalApplied: 0,
      totalSkipped: 0,
      averageConfidence: 0,
      confidenceDistribution: { HIGH: 0, MEDIUM_HIGH: 0, MEDIUM: 0, LOW_MEDIUM: 0, LOW: 0, VERY_LOW: 0 }
    };

    for (const failure of failures) {
      try {
        const result = await this.healFailure(failure);
        results.push(result);
        analytics.totalCandidatesGenerated += result.candidatesGenerated || 0;
        if (result.applied) analytics.totalApplied++;
        else analytics.totalSkipped++;

        if (result.bestCandidate) {
          analytics.averageConfidence += result.bestCandidate.confidenceScore;
          const label = result.bestCandidate.confidenceLabel || 'MEDIUM';
          if (analytics.confidenceDistribution[label] !== undefined) {
            analytics.confidenceDistribution[label]++;
          }
        }
      } catch (err) {
        console.error(`[LocatorHealingEngine] Error healing failure: ${err.message}`);
        results.push({
          failure,
          error: err.message,
          candidatesGenerated: 0,
          bestCandidate: null,
          applied: false
        });
        analytics.totalSkipped++;
      }
    }

    analytics.averageConfidence = results.length > 0
      ? Math.round((analytics.averageConfidence / results.length) * 100) / 100
      : 0;

    // Generate report
    await this._generateReport(results, analytics);

    return {
      analytics,
      results,
      mode: this.mode,
      autoApplyThreshold: this.autoApplyThreshold
    };
  }

  /**
   * Generate candidate locators based on the failed locator.
   * Uses heuristic strategies to suggest alternatives.
   */
  _generateCandidates(failure) {
    const { locator: failedLocator, locatorType } = failure;
    const candidates = [];

    if (!failedLocator) return candidates;

    // Strategy 1: Convert XPath to CSS or vice versa
    if (failedLocator.startsWith('//') || failedLocator.startsWith('./')) {
      // Try to extract a CSS-like selector from XPath
      const idMatch = failedLocator.match(/@id=['"]([^'"]+)['"]/);
      if (idMatch) {
        candidates.push({ locator: `#${idMatch[1]}`, type: 'css', strategy: 'xpath-to-css-id' });
      }
      const classMatch = failedLocator.match(/@class=['"]([^'"]+)['"]/);
      if (classMatch) {
        const classes = classMatch[1].split(/\s+/);
        candidates.push({ locator: `.${classes.join('.')}`, type: 'css', strategy: 'xpath-to-css-class' });
      }
      const textMatch = failedLocator.match(/text\(\)=['"]([^'"]+)['"]/);
      if (textMatch) {
        candidates.push({ locator: `text=${textMatch[1]}`, type: 'text', strategy: 'xpath-to-text' });
      }
      // Tag-based
      const tagMatch = failedLocator.match(/^\/*(\w+)/);
      if (tagMatch) {
        candidates.push({ locator: tagMatch[1], type: 'css', strategy: 'xpath-tag-to-css' });
      }
    } else {
      // Convert CSS/other to alternatives
      // Try text/role based on content
      if (failedLocator.includes('.')) {
        const parts = failedLocator.split('>').map(s => s.trim());
        const lastPart = parts[parts.length - 1];
        const classMatch = lastPart.match(/\.([\w-]+)/);
        if (classMatch) {
          candidates.push({
            locator: `[class*="${classMatch[1]}"]`,
            type: 'css',
            strategy: 'class-to-attribute'
          });
        }
      }
      // Add role-based locator as fallback
      candidates.push({
        locator: failedLocator,
        type: locatorType || 'css',
        strategy: 'original-with-alt-type'
      });
    }

    // Strategy 2: Use data-testid if present in original pattern
    if (!/data-test/.test(failedLocator)) {
      candidates.push({
        locator: failedLocator.replace(/(['"`])[\w-]+(['"`])/g, '[data-testid=$1$2]'),
        type: 'css',
        strategy: 'testid-adaptation'
      });
    }

    // Strategy 3: Simplify the locator (remove index positions)
    const simplified = failedLocator.replace(/\[(\d+)\]/g, '');
    if (simplified !== failedLocator) {
      candidates.push({ locator: simplified, type: locatorType || 'css', strategy: 'simplified-no-index' });
    }

    // Strategy 4: Check historical versions from history store
    try {
      const pageName = failure.page;
      const locatorName = failure.locatorName || failedLocator;
      if (pageName) {
        const history = this.historyStore.getLocatorHistory(pageName, locatorName);
        if (history && history.versions) {
          for (const ver of history.versions) {
            if (ver.previousValue && ver.previousValue !== failedLocator) {
              candidates.push({
                locator: ver.previousValue,
                type: locatorType || 'css',
                strategy: 'historical-rollback',
                versionInfo: ver
              });
            }
            if (ver.newValue && ver.newValue !== failedLocator) {
              candidates.push({
                locator: ver.newValue,
                type: locatorType || 'css',
                strategy: 'historical-previous',
                versionInfo: ver
              });
            }
          }
        }
      }
    } catch (e) {
      // Non-critical
    }

    // Deduplicate by locator value
    const seen = new Set();
    return candidates.filter(c => {
      const key = c.locator;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Apply a locator replacement using the applier
   */
  async _applyReplacement(failure, candidate) {
    try {
      const proposal = {
        failure: {
          locator: failure.locator,
          feature: failure.feature,
          scenario: failure.scenario,
          error: failure.error
        },
        suggested: {
          locator: candidate.locator,
          sourceFile: failure.sourceFile || failure.page || 'unknown'
        }
      };

      const patch = this.applier.createPatchForSuggestion(proposal);
      const applied = await this.applier.applyPatch(proposal);

      return {
        success: true,
        patchGenerated: !!patch,
        patchApplied: applied,
        targetFile: proposal.suggested.sourceFile
      };
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Generate markdown healing report
   */
  async _generateReport(results, analytics) {
    const reportPath = path.join(this.reportDir, 'locator-healing-report.md');
    const timestamp = new Date().toISOString();

    const lines = [];
    lines.push('# Locator Healing Report');
    lines.push('');
    lines.push(`Generated: ${timestamp}`);
    lines.push(`Mode: ${this.mode}`);
    lines.push(`Auto-Apply Threshold: ${this.autoApplyThreshold}`);
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| Total Failures Analyzed | ${analytics.totalFailures} |`);
    lines.push(`| Candidates Generated | ${analytics.totalCandidatesGenerated} |`);
    lines.push(`| Auto-Applied | ${analytics.totalApplied} |`);
    lines.push(`| Skipped / Manual Required | ${analytics.totalSkipped} |`);
    lines.push(`| Average Confidence Score | ${analytics.averageConfidence} |`);
    lines.push('');
    lines.push('## Confidence Distribution');
    lines.push('');
    lines.push(`| Level | Count |`);
    lines.push(`|---|---|`);
    for (const [label, count] of Object.entries(analytics.confidenceDistribution)) {
      lines.push(`| ${label} | ${count} |`);
    }
    lines.push('');
    lines.push('## Detailed Results');
    lines.push('');

    for (const result of results) {
      lines.push(`### Failure: ${result.failure?.locator || 'unknown'}`);
      lines.push('');
      lines.push(`- **Page**: ${result.failure?.page || 'N/A'}`);
      lines.push(`- **Feature**: ${result.failure?.feature || 'N/A'}`);
      lines.push(`- **Scenario**: ${result.failure?.scenario || 'N/A'}`);
      lines.push(`- **Error**: ${result.failure?.error || 'N/A'}`);
      lines.push(`- **Candidates Generated**: ${result.candidatesGenerated}`);
      lines.push(`- **Applied**: ${result.applied ? 'Yes' : 'No'}`);
      lines.push('');

      if (result.error) {
        lines.push(`> ❌ Error: ${result.error}`);
        lines.push('');
        continue;
      }

      if (result.bestCandidate) {
        lines.push('#### Best Candidate');
        lines.push('');
        lines.push(`| Property | Value |`);
        lines.push(`|---|---|`);
        lines.push(`| Locator | \`${result.bestCandidate.locator}\` |`);
        lines.push(`| Type | ${result.bestCandidate.type} |`);
        lines.push(`| Strategy | ${result.bestCandidate.strategy} |`);
        lines.push(`| Confidence Score | ${result.bestCandidate.confidenceScore} |`);
        lines.push(`| Confidence Label | ${result.bestCandidate.confidenceLabel} |`);
        lines.push(`| Recommended Action | ${result.bestCandidate.recommendedAction} |`);
        lines.push('');

        if (result.bestCandidate.confidenceBreakdown) {
          lines.push('##### Confidence Breakdown');
          lines.push('');
          lines.push(`| Factor | Score | Weight | Contribution |`);
          lines.push(`|---|---|---|---|`);
          const bd = result.bestCandidate.confidenceBreakdown;
          for (const [factor, info] of Object.entries(bd)) {
            lines.push(`| ${factor} | ${info.score} | ${info.weight} | ${info.contribution.toFixed(3)} |`);
          }
          lines.push('');
        }

        if (result.applyResult) {
          lines.push('#### Apply Result');
          lines.push('');
          lines.push('```json');
          lines.push(JSON.stringify(result.applyResult, null, 2));
          lines.push('```');
          lines.push('');
        }

        if (result.allCandidates && result.allCandidates.length > 1) {
          lines.push('#### All Candidates (ranked)');
          lines.push('');
          lines.push(`| Rank | Locator | Type | Strategy | Confidence | Action |`);
          lines.push(`|---|---|---|---|---|---|`);
          result.allCandidates.forEach((c, i) => {
            lines.push(`| ${i + 1} | \`${c.locator}\` | ${c.type} | ${c.strategy} | ${c.confidenceScore} | ${c.recommendedAction} |`);
          });
          lines.push('');
        }
      } else {
        lines.push('> No suitable replacement candidates found.');
        lines.push('');
      }
    }

    // History stats
    const historyAnalytics = this.historyStore.getAnalytics();
    lines.push('## Locator History Statistics');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| Total Recorded Events | ${historyAnalytics.totalRecorded} |`);
    lines.push(`| Total Replacements | ${historyAnalytics.totalReplacements} |`);
    lines.push(`| Version Counter | ${this.historyStore._read().versionCounter} |`);

    const healingRate = this.historyStore.getHealingSuccessRate();
    lines.push(`| Healing Success Rate | ${(healingRate.rate * 100).toFixed(1)}% |`);
    lines.push('');

    // Unstable locators
    const unstable = this.historyStore.getAllUnstableLocators();
    if (unstable.length > 0) {
      lines.push('## Unstable Locators (needing attention)');
      lines.push('');
      lines.push(`| Key | Consecutive Failures | Total Failures | Total Successes | Failure Rate |`);
      lines.push(`|---|---|---|---|---|`);
      for (const u of unstable) {
        const total = (u.totalSuccesses || 0) + (u.totalFailures || 0);
        const rate = total > 0 ? ((u.totalFailures / total) * 100).toFixed(1) + '%' : 'N/A';
        lines.push(`| ${u.key} | ${u.consecutiveFailures || 0} | ${u.totalFailures || 0} | ${u.totalSuccesses || 0} | ${rate} |`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');
    lines.push('*Report generated by LocatorHealingEngine*');

    const content = lines.join('\n');
    fs.writeFileSync(reportPath, content, 'utf8');
    console.log(`[LocatorHealingEngine] Report written to ${reportPath}`);

    return reportPath;
  }

  /**
   * Rollback a previously applied healing
   */
  async rollbackReplacement(backupRoot) {
    if (!backupRoot) {
      return { error: 'backupRoot is required' };
    }
    try {
      const result = await this.applier.restoreFromBackup(backupRoot);
      return { success: true, restoredFiles: result.restored };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Run the healing engine as a standalone operation
   */
  async run(options = {}) {
    const { failures, mode, autoApplyThreshold } = options;
    if (mode) this.mode = mode;
    if (autoApplyThreshold !== undefined) this.autoApplyThreshold = autoApplyThreshold;

    if (!failures || failures.length === 0) {
      // Try to read from default input path
      const inputPath = path.join(process.cwd(), 'ai/input/failed-locators.json');
      if (fs.existsSync(inputPath)) {
        const inputData = fs.readJsonSync(inputPath);
        const failureList = Array.isArray(inputData) ? inputData : (inputData.failures || []);
        return this.healFailures(failureList);
      }
      return { skipped: true, reason: 'No failures provided and no input file found' };
    }

    return this.healFailures(failures);
  }
}

module.exports = LocatorHealingEngine;
