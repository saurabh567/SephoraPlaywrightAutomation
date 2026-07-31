import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import EventBus from '../core/EventBus';
import executionContext from '../core/ExecutionContext';
/**
 * PlaywrightResultIngestion.js
 *
 * Automatic artifact ingestion pipeline for Playwright execution results.
 * Runs after every Playwright CLI execution — discovers, collects, and
 * indexes all generated artifacts into the vector store.
 *
 * Artifacts ingested:
 *   - playwright-report/    (full HTML report directory)
 *   - trace.zip             (Playwright trace files)
 *   - videos                (.webm video recordings)
 *   - screenshots           (failure/success screenshots)
 *   - JUnit XML             (structured test results)
 *   - JSON report           (machine-readable results)
 *   - HTML report           (Playwright HTML report index)
 *   - Cucumber report       (Cucumber JSON report)
 *
 * Results are published through EventBus so subscriber agents
 * (FailureAnalysisAgent, RCAAgent, ReportAgent, etc.) can react.
 *
 * Usage:
 *   const ingester = require('./PlaywrightResultIngestion');
 *   await ingester.ingest({ executionId: 'EXEC-...' });
 *
 * Or via CLI:
 *   node ai/playwright-cli/PlaywrightResultIngestion.js
 */


// ─── Constants ─────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const PW_REPORT_DIR = path.join(ROOT, 'playwright-report');
const TEST_RESULTS_DIR = path.join(ROOT, 'test-results');
const REPORTS_CLI_DIR = path.join(ROOT, 'reports', 'playwright-cli');
const REPORTS_DIR = path.join(ROOT, 'reports');
const SCREENSHOTS_DIR = path.join(TEST_RESULTS_DIR);
const VIDEOS_DIR = path.join(TEST_RESULTS_DIR);
const FEATURES_DIR = path.join(ROOT, 'features');
const REPORTS_JSON_DIR = path.join(ROOT, 'reports', 'json');

// ─── Discovered Artifacts ──────────────────────────────────────────────────

class ArtifactCollection {
  [key: string]: any;
  constructor() {
    this.traceFiles = [];
    this.videoFiles = [];
    this.screenshotFiles = [];
    this.jsonReports = [];
    this.htmlReports = [];
    this.junitReports = [];
    this.cucumberReports = [];
    this.summaryData = {};
    this.error = null;
  }

  get totalArtifacts() {
    return this.traceFiles.length + this.videoFiles.length +
      this.screenshotFiles.length + this.jsonReports.length +
      this.htmlReports.length + this.junitReports.length +
      this.cucumberReports.length;
  }

  toJSON() {
    return {
      traceFiles: this.traceFiles,
      videoFiles: this.videoFiles,
      screenshotFiles: this.screenshotFiles,
      jsonReports: this.jsonReports,
      htmlReports: this.htmlReports,
      junitReports: this.junitReports,
      cucumberReports: this.cucumberReports,
      summaryData: this.summaryData,
      totalArtifacts: this.totalArtifacts
    };
  }
}

// ─── Playwright Result Ingestion Engine ────────────────────────────────────

class PlaywrightResultIngestion {

  /**
   * Run full ingestion pipeline.
   * Discovers, collects, indexes, and publishes all Playwright artifacts.
   *
   * @param {Object} [options]
   * @param {string} [options.executionId] - Override execution ID
   * @param {boolean}[options.skipVectorIngest] - Skip vector store indexing
   * @param {boolean}[options.skipEventPublish] - Skip EventBus publishing
   * @returns {Promise<ArtifactCollection>}
   */
  async ingest(options: any = {}) {
    const executionId = options.executionId || executionContext.executionId || 'unknown';
    console.log(`\n══════════════════════════════════════════════`);
    console.log(`  Playwright Result Ingestion`);
    console.log(`  Execution: ${executionId}`);
    console.log(`══════════════════════════════════════════════\n`);

    const artifacts = new ArtifactCollection();

    try {
      // ── Phase 1: Discover all artifacts ──────────────────────────────
      console.log('  Phase 1: Discovering artifacts...');
      this._discoverArtifacts(artifacts);
      console.log(`  Found ${artifacts.totalArtifacts} artifact(s):`);
      if (artifacts.jsonReports.length) console.log(`    JSON reports: ${artifacts.jsonReports.length}`);
      if (artifacts.htmlReports.length) console.log(`    HTML reports: ${artifacts.htmlReports.length}`);
      if (artifacts.traceFiles.length) console.log(`    Trace files: ${artifacts.traceFiles.length}`);
      if (artifacts.videoFiles.length) console.log(`    Video files: ${artifacts.videoFiles.length}`);
      if (artifacts.screenshotFiles.length) console.log(`    Screenshots: ${artifacts.screenshotFiles.length}`);
      if (artifacts.junitReports.length) console.log(`    JUnit reports: ${artifacts.junitReports.length}`);
      if (artifacts.cucumberReports.length) console.log(`    Cucumber reports: ${artifacts.cucumberReports.length}`);

      // ── Phase 2: Parse summary data ──────────────────────────────────
      console.log('\n  Phase 2: Parsing result summaries...');
      this._parseSummary(artifacts);
      if (artifacts.summaryData.total !== undefined) {
        console.log(`    Tests: ${artifacts.summaryData.passed} passed, ${artifacts.summaryData.failed} failed, ${artifacts.summaryData.skipped} skipped`);
        console.log(`    Duration: ${artifacts.summaryData.duration || '—'}`);
      }

      // ── Phase 3: Canonicalize reports ────────────────────────────────
      console.log('\n  Phase 3: Canonicalizing reports...');
      this._canonicalizeReports(artifacts);

      // ── Phase 4: Index into vector store ─────────────────────────────
      if (!options.skipVectorIngest) {
        console.log('\n  Phase 4: Indexing into vector store...');
        await this._vectorIngest(artifacts);
      } else {
        console.log('\n  Phase 4: Vector indexing skipped');
      }

      // ── Phase 5: Copy canonical artifacts ────────────────────────────
      console.log('\n  Phase 5: Copying artifacts to reports directory...');
      this._copyArtifacts(artifacts);

      // ── Phase 6: Publish results via EventBus ────────────────────────
      if (!options.skipEventPublish) {
        console.log('\n  Phase 6: Publishing results via EventBus...');
        this._publishResults(artifacts, executionId);
      } else {
        console.log('\n  Phase 6: EventBus publishing skipped');
      }

      // ── Phase 7: Prepare for AI analysis agents ──────────────────────
      console.log('\n  Phase 7: Preparing for AI analysis...');
      this._writeIngestionManifest(artifacts, executionId);

      console.log(`\n  [✓] Ingestion complete — ${artifacts.totalArtifacts} artifacts processed`);

    } catch (err: any) {
      artifacts.error = err.message;
      console.error(`\n  [✗] Ingestion failed: ${err.message}`);
    }

    return artifacts;
  }

  // ╔══════════════════════════════════════════════════════════════════════════╗
  // ║                     ARTIFACT DISCOVERY                                 ║
  // ╚══════════════════════════════════════════════════════════════════════════╝

  _discoverArtifacts(artifacts: any) {
    // Trace files (.zip in test-results)
    if (fs.existsSync(TEST_RESULTS_DIR)) {
      const traceFiles = this._findFiles(TEST_RESULTS_DIR, (name: any) =>
        name.endsWith('.zip') && (name.includes('trace') || this._readZipHint(name))
      );
      artifacts.traceFiles = traceFiles;
    }

    // Video files (.webm)
    if (fs.existsSync(VIDEOS_DIR)) {
      artifacts.videoFiles = this._findFiles(VIDEOS_DIR, (name: any) => name.endsWith('.webm'));
    }

    // Screenshots (.png)
    if (fs.existsSync(SCREENSHOTS_DIR)) {
      artifacts.screenshotFiles = this._findFiles(SCREENSHOTS_DIR, (name: any) =>
        name.endsWith('-failed.png') || name.endsWith('.png')
      );
    }

    // JSON reports from playwright-report and playwright-cli
    if (fs.existsSync(REPORTS_CLI_DIR)) {
      artifacts.jsonReports = this._findFiles(REPORTS_CLI_DIR, (name: any) => name.endsWith('.json'));
    }
    // Also check reports/ root for JSON
    if (fs.existsSync(REPORTS_DIR)) {
      const reportJsons = this._findFiles(REPORTS_DIR, (name: any) =>
        name === 'results.json' || (name.endsWith('.json') && !name.includes('node_modules'))
      );
      for (const f of reportJsons) {
        if (!artifacts.jsonReports.includes(f)) artifacts.jsonReports.push(f);
      }
    }

    // HTML report from playwright-report
    if (fs.existsSync(PW_REPORT_DIR)) {
      const htmlIndex = path.join(PW_REPORT_DIR, 'index.html');
      if (fs.existsSync(htmlIndex)) artifacts.htmlReports.push(htmlIndex);
      // Also collect all HTML files in playwright-report
      const allHtml = this._findFiles(PW_REPORT_DIR, (name: any) => name.endsWith('.html'));
      for (const f of allHtml) {
        if (!artifacts.htmlReports.includes(f)) artifacts.htmlReports.push(f);
      }
    }

    // JUnit XML reports
    if (fs.existsSync(REPORTS_CLI_DIR)) {
      artifacts.junitReports = this._findFiles(REPORTS_CLI_DIR, (name: any) => name.endsWith('.xml'));
    }
    if (fs.existsSync(REPORTS_DIR)) {
      const junits = this._findFiles(REPORTS_DIR, (name: any) => name.endsWith('.xml'));
      for (const f of junits) {
        if (!artifacts.junitReports.includes(f)) artifacts.junitReports.push(f);
      }
    }

    // Cucumber JSON reports
    if (fs.existsSync(REPORTS_DIR)) {
      artifacts.cucumberReports = this._findFiles(REPORTS_DIR, (name: any) => name === 'cucumber-report.json');
    }
    // Also check platform-specific dirs
    for (const platform of ['web', 'android', 'ios', 'api']) {
      const platformDir = path.join(REPORTS_DIR, platform);
      if (fs.existsSync(platformDir)) {
        const cukes = this._findFiles(platformDir, (name: any) => name === 'cucumber-report.json');
        for (const f of cukes) {
          if (!artifacts.cucumberReports.includes(f)) artifacts.cucumberReports.push(f);
        }
      }
    }
  }

  /**
   * Parse execution summary from JSON reports.
   */
  _parseSummary(artifacts: any) {
    // Try CLI results first
    const cliResultPath = path.join(REPORTS_CLI_DIR, 'results.json');
    const manifestPath = path.join(REPORTS_CLI_DIR, 'execution-manifest.json');

    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = fs.readJsonSync(manifestPath);
        artifacts.summaryData = {
          total: (manifest.passed || 0) + (manifest.failed || 0) + (manifest.skipped || 0),
          passed: manifest.passed || 0,
          failed: manifest.failed || 0,
          skipped: manifest.skipped || 0,
          flaky: manifest.flaky || 0,
          duration: manifest.durationFormatted || (manifest.duration ? manifest.duration + 'ms' : null),
          workers: manifest.workers || 0,
          retries: manifest.retries || 0,
          exitCode: manifest.exitCode
        };
        return;
      } catch {}
    }

    if (fs.existsSync(cliResultPath)) {
      try {
        const data = fs.readJsonSync(cliResultPath);
        if (data.stats) {
          const s = data.stats;
          artifacts.summaryData = {
            total: (s.expected || 0) + (s.unexpected || 0) + (s.skipped || 0),
            passed: s.expected || 0,
            failed: s.unexpected || 0,
            skipped: s.skipped || 0,
            duration: s.duration ? (s.duration / 1000).toFixed(1) + 's' : null
          };
          return;
        }
      } catch {}
    }

    // Fallback: try cucumber report
    for (const cr of artifacts.cucumberReports) {
      try {
        const data = fs.readJsonSync(cr);
        if (Array.isArray(data)) {
          let passed = 0, failed = 0, skipped = 0;
          for (const feature of data) {
            const elements = feature.elements || [];
            for (const el of elements) {
              if (el.type === 'scenario') {
                const steps = el.steps || [];
                const hasFail = steps.some((s: any) => s.result && s.result.status === 'failed');
                const hasSkip = steps.some((s: any) => s.result && s.result.status === 'skipped');
                if (hasFail) failed++;
                else if (hasSkip) skipped++;
                else passed++;
              }
            }
          }
          artifacts.summaryData = {
            total: passed + failed + skipped,
            passed, failed, skipped
          };
          return;
        }
      } catch {}
    }
  }

  /**
   * Canonicalize reports into a standard location.
   */
  _canonicalizeReports(artifacts: any) {
    fs.ensureDirSync(REPORTS_JSON_DIR);

    // Copy cucumber reports to reports/json/
    for (const cr of artifacts.cucumberReports) {
      const dest = path.join(REPORTS_JSON_DIR, 'cucumber-report.json');
      try {
        const content = fs.readFileSync(cr, 'utf8');
        if (content.trim() && JSON.parse(content)) {
          fs.copySync(cr, dest, { overwrite: true });
          console.log(`    Copied cucumber report: ${cr} → ${dest}`);
        }
      } catch {
        // Skip invalid JSON
      }
    }

    // Copy CLI JSON results to reports/json/
    const cliResultPath = path.join(REPORTS_CLI_DIR, 'results.json');
    if (fs.existsSync(cliResultPath)) {
      const dest = path.join(REPORTS_JSON_DIR, 'playwright-results.json');
      fs.copySync(cliResultPath, dest, { overwrite: true });
      console.log(`    Copied CLI results: ${cliResultPath} → ${dest}`);
    }

    // Copy CLI manifest to reports/json/
    const manifestPath = path.join(REPORTS_CLI_DIR, 'execution-manifest.json');
    if (fs.existsSync(manifestPath)) {
      const dest = path.join(REPORTS_JSON_DIR, 'execution-manifest.json');
      fs.copySync(manifestPath, dest, { overwrite: true });
    }
  }

  /**
   * Index artifacts into the vector store.
   */
  async _vectorIngest(artifacts: any) {
    try {
      // Try local ingestion service first
      const localIngestPath = path.join(ROOT, 'ai', 'local', 'localIngest.js');
      if (fs.existsSync(localIngestPath)) {
        spawnSync('node', [localIngestPath], {
          stdio: 'inherit',
          env: process.env
        });
        console.log('    Local vector store ingestion completed');
      }
    } catch (e: any) {
      console.warn(`    Vector ingestion warning: ${e.message}`);
    }


    // Vector store ingestion complete
  }

  /**
   * Copy artifacts to standardized locations for AI analysis agents.
   */
  _copyArtifacts(artifacts: any) {
    const ingestDir = path.join(REPORTS_DIR, 'ingestion');
    fs.ensureDirSync(ingestDir);

    // Copy trace files
    if (artifacts.traceFiles.length > 0) {
      const traceDir = path.join(ingestDir, 'traces');
      fs.ensureDirSync(traceDir);
      for (const tf of artifacts.traceFiles.slice(0, 20)) {
        try {
          fs.copySync(tf, path.join(traceDir, path.basename(tf)), { overwrite: true });
        } catch {}
      }
    }

    // Copy screenshots
    if (artifacts.screenshotFiles.length > 0) {
      const ssDir = path.join(ingestDir, 'screenshots');
      fs.ensureDirSync(ssDir);
      for (const ss of artifacts.screenshotFiles.slice(0, 50)) {
        try {
          fs.copySync(ss, path.join(ssDir, path.basename(ss)), { overwrite: true });
        } catch {}
      }
    }

    // Write ingestion index for AI agents to reference
    const indexDir = path.join(REPORTS_DIR, 'ingestion');
    fs.ensureDirSync(indexDir);
    fs.writeJsonSync(path.join(indexDir, 'artifact-index.json'), artifacts.toJSON(), { spaces: 2 });
    
    // Build and write ingestion docs
    const docs: any[] = [];
    const timestamp = new Date().toISOString();
    if (artifacts.traceFiles.length > 0) {
      docs.push({ type: 'trace', files: artifacts.traceFiles, count: artifacts.traceFiles.length, ingestedAt: timestamp });
    }
    if (artifacts.videoFiles.length > 0) {
      docs.push({ type: 'video', files: artifacts.videoFiles, count: artifacts.videoFiles.length, ingestedAt: timestamp });
    }
    if (Object.keys(artifacts.summaryData).length > 0) {
      docs.push({ type: 'execution-summary', data: artifacts.summaryData, ingestedAt: timestamp });
    }
    fs.writeJsonSync(path.join(indexDir, 'ingestion-docs.json'), docs, { spaces: 2 });

    // Write an AI-ready summary markdown file
    if (Object.keys(artifacts.summaryData).length > 0) {
      const s = artifacts.summaryData;
      const md = [
        '# Execution Results Summary',
        '',
        `**Ingested:** ${new Date().toISOString()}`,
        '',
        '| Metric | Value |',
        '|--------|-------|',
        `| Total Tests | ${s.total || '—'} |`,
        `| Passed | ${s.passed || 0} |`,
        `| Failed | ${s.failed || 0} |`,
        `| Skipped | ${s.skipped || 0} |`,
        `| Duration | ${s.duration || '—'} |`,
        `| Exit Code | ${s.exitCode !== undefined ? s.exitCode : '—'} |`,
        '',
        '## Artifacts',
        '',
        `- **Traces:** ${artifacts.traceFiles.length} file(s)`,
        `- **Videos:** ${artifacts.videoFiles.length} file(s)`,
        `- **Screenshots:** ${artifacts.screenshotFiles.length} file(s)`,
        `- **JSON Reports:** ${artifacts.jsonReports.length} file(s)`,
        `- **HTML Reports:** ${artifacts.htmlReports.length} file(s)`,
        `- **JUnit Reports:** ${artifacts.junitReports.length} file(s)`,
        `- **Cucumber Reports:** ${artifacts.cucumberReports.length} file(s)`,
        '',
        '---',
        '*Auto-generated by PlaywrightResultIngestion*'
      ].join('\n');
      fs.writeFileSync(path.join(ingestDir, 'execution-summary.md'), md, 'utf8');
    }
  }

  /**
   * Publish results through EventBus so subscriber agents can react.
   */
  _publishResults(artifacts: any, executionId: any) {
    try {
      const summary = artifacts.summaryData;

      // Publish EXECUTION_COMPLETED with full artifact details
      EventBus.emit(EventBus.EVENTS.EXECUTION_COMPLETED, {
        executionId,
        engine: 'playwright-cli',
        summary,
        artifacts: {
          total: artifacts.totalArtifacts,
          traces: artifacts.traceFiles.length,
          videos: artifacts.videoFiles.length,
          screenshots: artifacts.screenshotFiles.length,
          jsonReports: artifacts.jsonReports.length,
          htmlReports: artifacts.htmlReports.length,
          junitReports: artifacts.junitReports.length,
          cucumberReports: artifacts.cucumberReports.length
        },
        timestamp: new Date().toISOString()
      });

      // Publish VECTOR_STORE_INGESTED
      EventBus.emit(EventBus.EVENTS.VECTOR_STORE_INGESTED, {
        executionId,
        artifactCount: artifacts.totalArtifacts,
        timestamp: new Date().toISOString()
      });

      // If there are failures, emit SCENARIO_FAILED for each
      if (summary && summary.failed > 0) {
        EventBus.emit(EventBus.EVENTS.SCENARIO_FAILED, {
          executionId,
          failedCount: summary.failed,
          totalCount: summary.total,
          timestamp: new Date().toISOString()
        });

        // Trigger analysis
        EventBus.emit(EventBus.EVENTS.ANALYSIS_STARTED, {
          executionId,
          reason: 'failures_detected',
          failedCount: summary.failed,
          timestamp: new Date().toISOString()
        });
      }

      // If no failures, emit SCENARIO_PASSED
      if (summary && summary.failed === 0 && summary.passed > 0) {
        EventBus.emit(EventBus.EVENTS.SCENARIO_PASSED, {
          executionId,
          passedCount: summary.passed,
          totalCount: summary.total,
          timestamp: new Date().toISOString()
        });
      }

      console.log(`    Published ${summary && summary.failed > 0 ? 'EXECUTION_COMPLETED + ANALYSIS_STARTED' : 'EXECUTION_COMPLETED'} to EventBus`);

    } catch (e: any) {
      console.warn(`    EventBus publish warning: ${e.message}`);
    }
  }

  /**
   * Write an ingestion manifest for AI analysis agents.
   */
  _writeIngestionManifest(artifacts: any, executionId: any) {
    try {
      const manifest = {
        executionId,
        ingestedAt: new Date().toISOString(),
        totalArtifacts: artifacts.totalArtifacts,
        summary: artifacts.summaryData,
        artifactPaths: {
          traces: artifacts.traceFiles,
          videos: artifacts.videoFiles,
          screenshots: artifacts.screenshotFiles,
          jsonReports: artifacts.jsonReports,
          htmlReports: artifacts.htmlReports,
          junitReports: artifacts.junitReports,
          cucumberReports: artifacts.cucumberReports
        },
        error: artifacts.error
      };

      const manifestPath = path.join(REPORTS_CLI_DIR, 'ingestion-manifest.json');
      fs.ensureDirSync(path.dirname(manifestPath));
      fs.writeJsonSync(manifestPath, manifest, { spaces: 2 });
    } catch (e: any) {
      console.warn(`    Manifest write warning: ${e.message}`);
    }
  }

  // ╔══════════════════════════════════════════════════════════════════════════╗
  // ║                     UTILITY HELPERS                                    ║
  // ╚══════════════════════════════════════════════════════════════════════════╝

  _findFiles(dir: any, predicate: any) {
    const results: any = [];
    if (!fs.existsSync(dir)) return results;
    try {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          results.push(...this._findFiles(full, predicate));
        } else if (predicate(entry)) {
          results.push(full);
        }
      }
    } catch {}
    return results;
  }

  _readZipHint(name: any) {
    // Best-effort: if name ends with .zip and test-results convention
    return name.endsWith('.zip');
  }
}

// ─── CLI Entry Point ───────────────────────────────────────────────────────

if (require.main === module) {
  const ingester = new PlaywrightResultIngestion();
  ingester.ingest({}).then(artifacts => {
    console.log(`\nIngested ${artifacts.totalArtifacts} artifacts`);
    process.exit(artifacts.error ? 1 : 0);
  }).catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}

// ─── Singleton ─────────────────────────────────────────────────────────────
const instance = new PlaywrightResultIngestion();

export default instance;
export { PlaywrightResultIngestion, ArtifactCollection };
