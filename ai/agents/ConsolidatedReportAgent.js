#!/usr/bin/env node
/**
 * ConsolidatedReportAgent.js
 *
 * AI agent for consolidated report generation.
 * Reads all existing report outputs, generates consolidated dashboard data,
 * creates a client-ready summary, adds final GO/NO-GO recommendation,
 * and saves the final report under reports/dashboard/.
 *
 * Can be called standalone or from the AI orchestrator.
 *
 * Usage:
 *   node ai/agents/ConsolidatedReportAgent.js
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');

// ──────────────── Agent State ────────────────

class ConsolidatedReportAgent {
  constructor(options = {}) {
    this.name = 'ConsolidatedReportAgent';
    this.version = '1.0.0';
    this.options = {
      outputDir: path.join(ROOT, 'reports', 'dashboard'),
      dataFile: 'dashboard-data.json',
      summaryFile: 'consolidated-summary.md',
      htmlFile: 'index.html',
      verbose: options.verbose || false,
    };
    this.results = {
      agent: this.name,
      version: this.version,
      executedAt: new Date().toISOString(),
      suitesCollected: [],
      totalReports: 0,
      decisions: {},
      recommendation: null,
    };
  }

  log(msg) {
    if (this.options.verbose) {
      console.log(`[${this.name}] ${msg}`);
    }
  }

  /**
   * Execute the agent: load dashboard generator and run it.
   */
  async run() {
    console.log(`\n  🤖 ${this.name} v${this.version}`);
    console.log('  ────────────────────────────────────────\n');

    this.log('Starting consolidated report generation...');

    // Load the consolidated dashboard generator
    let generator;
    try {
      generator = require(path.join(ROOT, 'utils', 'generateConsolidatedDashboard'));
    } catch (err) {
      console.error(`  ❌ Failed to load dashboard generator: ${err.message}`);
      this.results.error = err.message;
      return this.results;
    }

    // Generate dashboard data
    try {
      this.log('Collecting data from all available report sources...');
      const data = generator.generateDashboardData();
      this.results.data = data;
      this.results.suitesCollected = [
        { name: 'Web', available: !!(data.web && data.web.available) },
        { name: 'Android', available: !!(data.android && data.android.available) },
        { name: 'iOS', available: !!(data.ios && data.ios.available) },
        { name: 'API', available: !!(data.api && data.api.available) },
        { name: 'Performance', available: !!(data.performance && data.performance.available) },
        { name: 'AI Analysis', available: !!(data.ai && data.ai.available) },
        { name: 'Self-Healing', available: !!(data.selfHealing && data.selfHealing.available) },
      ];
      this.results.totalReports = this.results.suitesCollected.filter(s => s.available).length;

      const es = data.executiveSummary || {};
      this.results.decisions = {
        releaseDecision: es.releaseDecision || 'UNKNOWN',
        releaseReason: es.releaseReason || '',
        passPercent: es.passPercent || 0,
        totalFailures: es.failed || 0,
        productionReadiness: es.productionReadiness || { score: 0, qualityStatus: 'Not Ready' },
      };

      this.log('Generating AI recommendation...');
      this.results.recommendation = this.generateRecommendation(data);

      // Write all output files
      this.log('Writing output files...');
      fs.mkdirSync(this.options.outputDir, { recursive: true });

      // Data JSON
      const dataPath = path.join(this.options.outputDir, this.options.dataFile);
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8');
      this.log(`  📊 ${this.options.dataFile} written`);

      // Summary Markdown
      const md = generator.generateSummaryMarkdown(data);
      const mdPath = path.join(this.options.outputDir, this.options.summaryFile);
      fs.writeFileSync(mdPath, md, 'utf-8');
      this.log(`  📝 ${this.options.summaryFile} written`);

      // HTML Dashboard
      const html = generator.generateHTML(data);
      const htmlPath = path.join(this.options.outputDir, this.options.htmlFile);
      fs.writeFileSync(htmlPath, html, 'utf-8');
      this.log(`  🏠 ${this.options.htmlFile} written`);

      // ─── AI Recommendation Summary ───
      console.log('\n  ─── AI Agent Recommendation ───');
      console.log(`  🤖 Release:    ${es.releaseDecision}`);
      console.log(`  📊 Pass Rate:  ${es.passPercent}%`);
      console.log(`  🏁 Readiness:  ${es.productionReadiness.score}/100 (${es.productionReadiness.qualityStatus})`);
      console.log(`  📋 Reason:     ${es.releaseReason}`);
      console.log(`\n  📄 Dashboard:   reports/dashboard/index.html`);
      console.log(`  📄 Data:        reports/dashboard/dashboard-data.json`);
      console.log(`  📄 Summary:     reports/dashboard/consolidated-summary.md\n`);

      this.results.status = 'completed';
      this.results.outputPaths = {
        html: path.relative(ROOT, htmlPath),
        data: path.relative(ROOT, dataPath),
        summary: path.relative(ROOT, mdPath),
      };

    } catch (err) {
      console.error(`  ❌ Agent execution failed:`, err.message);
      this.results.status = 'failed';
      this.results.error = err.message;
    }

    return this.results;
  }

  /**
   * Generate an AI recommendation based on all collected data.
   */
  generateRecommendation(data) {
    const es = data.executiveSummary || {};

    const rec = {
      timestamp: new Date().toISOString(),
      releaseDecision: es.releaseDecision || 'UNKNOWN',
      releaseReason: es.releaseReason || '',
      passPercent: es.passPercent || 0,
      totalFailures: es.failed || 0,
      productionScore: (es.productionReadiness && es.productionReadiness.score) || 0,
      qualityStatus: (es.productionReadiness && es.productionReadiness.qualityStatus) || 'Not Ready',
      suggestion: '',
    };

    if (rec.releaseDecision === 'GO') {
      rec.suggestion = 'All critical suites passing. Proceed with release. Monitor production for 24 hours.';
    } else if (rec.releaseDecision === 'WARNING') {
      rec.suggestion = 'Minor issues detected. Review failures, fix non-critical bugs, and consider conditional release with monitoring.';
    } else {
      rec.suggestion = 'Critical failures detected. Do NOT release. Fix blocking issues, rerun affected suites, and re-evaluate.';
    }

    return rec;
  }
}

// ──────────────── CLI Entry ────────────────

if (require.main === module) {
  const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
  const agent = new ConsolidatedReportAgent({ verbose });

  agent.run()
    .then(result => {
      console.log(`\n  ✅ Agent execution completed: ${result.status}`);
      process.exit(result.status === 'completed' ? 0 : 1);
    })
    .catch(err => {
      console.error(`  ❌ Agent execution failed:`, err.message);
      process.exit(1);
    });
}

module.exports = ConsolidatedReportAgent;
