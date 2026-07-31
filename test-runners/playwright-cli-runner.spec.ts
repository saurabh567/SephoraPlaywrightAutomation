import { test, expect } from '@playwright/test';
import fs from 'fs-extra';
import path from 'path';
import { spawnSync } from 'child_process';
/**
 * playwright-cli-runner.spec.js
 *
 * Playwright CLI test runner — bridges the Playwright CLI execution engine
 * to the existing Cucumber BDD feature files and step definitions.
 *
 * Each Cucumber scenario is wrapped as a Playwright test, allowing
 * `npx playwright test` to drive execution while preserving full
 * BDD compatibility.
 *
 * Architecture:
 *   - Scans features/ directory for .feature files
 *   - Parses scenarios and their tags
 *   - Maps each scenario to a Playwright test case
 *   - Uses existing step definitions and page objects
 *   - Supports tag-based filtering (@web, @android, @smoke, etc.)
 *   - Integrates with AI event bus for observability
 *
 * This file is the key integration point between Playwright CLI
 * and the existing Cucumber BDD framework.
 *
 * Run via:
 *   npx playwright test --config playwright.config.cli.js
 */


// ─── Constants ─────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const FEATURES_DIR = path.join(ROOT, 'features');
const PLATFORM = (process.env.TEST_PLATFORM || 'WEB').toUpperCase();
const TAGS_FILTER = process.env.TAGS || '';

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Parse a .feature file into its component scenarios.
 */
function parseFeatureFile(filePath: any) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const feature = { name: '', tags: [] as any[], scenarios: [] as any[] };
  let currentScenario = null;
  let featureTags: any[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Feature-level tags
    if (trimmed.startsWith('@')) {
      const tags = trimmed.split(/\s+/).filter(t => t.startsWith('@'));
      if (!currentScenario) {
        featureTags.push(...tags);
      } else {
        currentScenario.tags.push(...tags);
      }
      continue;
    }

    // Feature name
    if (trimmed.startsWith('Feature:')) {
      feature.name = trimmed.replace('Feature:', '').trim();
      feature.tags = [...featureTags];
      continue;
    }

    // Scenario outline
    if (trimmed.startsWith('Scenario Outline:') || trimmed.startsWith('Scenario:')) {
      if (currentScenario) feature.scenarios.push(currentScenario);
      currentScenario = {
        name: trimmed.replace(/^(Scenario Outline:|Scenario:)\s*/, '').trim(),
        tags: [...featureTags],
        line: lines.indexOf(line) + 1,
        isOutline: trimmed.startsWith('Scenario Outline:')
      };
      continue;
    }

    // Background
    if (trimmed.startsWith('Background:')) {
      if (currentScenario) feature.scenarios.push(currentScenario);
      currentScenario = null;
      continue;
    }
  }

  // Push last scenario
  if (currentScenario) feature.scenarios.push(currentScenario);

  return feature;
}

/**
 * Check if tags match the filter.
 */
function matchesTags(scenarioTags: any, filter: any) {
  if (!filter) return true;
  const filterTags = filter.split(',').map((t: any) => t.trim());
  return filterTags.every((ft: any) => scenarioTags.includes(ft));
}

/**
 * Check if scenario matches the platform.
 */
function matchesPlatform(scenarioTags: any, platform: any) {
  if (platform === 'WEB') return scenarioTags.includes('@web') || !scenarioTags.some((t: any) => ['@android', '@ios', '@api'].includes(t));
  if (platform === 'ANDROID') return scenarioTags.includes('@android');
  if (platform === 'IOS') return scenarioTags.includes('@ios');
  if (platform === 'API') return scenarioTags.includes('@api');
  return true;
}

// ─── Load Features ─────────────────────────────────────────────────────────

const features: any[] = [];
if (fs.existsSync(FEATURES_DIR)) {
  const files = fs.readdirSync(FEATURES_DIR).filter(f => f.endsWith('.feature'));
  for (const file of files) {
    try {
      const feature = parseFeatureFile(path.join(FEATURES_DIR, file));
      features.push(feature);
    } catch (e: any) {
      console.warn(`[PlaywrightCLIRunner] Failed to parse ${file}: ${e.message}`);
    }
  }
}

// ─── Generate Playwright Tests ─────────────────────────────────────────────

for (const feature of features) {
  for (const scenario of feature.scenarios) {
    const allTags = [...feature.tags, ...scenario.tags];

    // Apply filters
    if (!matchesPlatform(allTags, PLATFORM)) continue;
    if (!matchesTags(allTags, TAGS_FILTER)) continue;

    // Build test name with tags
    const tagStr = allTags.filter(t => t.startsWith('@')).join(' ');
    const testName = tagStr ? `${tagStr} ${scenario.name}` : scenario.name;

    // Register the Playwright test
    test(`${feature.name} > ${testName}`, async ({ page, context, browser }) => {
      test.setTimeout(Number(process.env.TIMEOUT || 60000) + 10000);

      // Set the Playwright page/context on global for step definitions to use
      (global as any).__PLAYWRIGHT_PAGE__ = page;
      (global as any).__PLAYWRIGHT_CONTEXT__ = context;
      (global as any).__PLAYWRIGHT_BROWSER__ = browser;

      // Run the specific Cucumber scenario via CLI
      const featureFile = path.join(FEATURES_DIR, `${feature.name.toLowerCase().replace(/\s+/g, '_')}.feature`);
      const scenarioLine = scenario.line;

      const env = {
        ...process.env,
        TEST_PLATFORM: PLATFORM,
        PLAYWRIGHT_CLI_MODE: 'true',
        PW_PAGE_READY: 'true',
        CUCUMBER_SCENARIO_LINE: String(scenarioLine),
        CUCUMBER_FEATURE_FILE: featureFile
      };

      // Construct the cucumber command for this specific scenario
      const cucumberArgs = [
        'cucumber-js',
        '--config', 'cucumber.js',
        featureFile,
        '--name', scenario.name
      ];

      // Add tag filters
      const platformTag = PLATFORM === 'WEB' ? '@web' : `@${PLATFORM.toLowerCase()}`;
      cucumberArgs.push('--tags', platformTag);

      const result = spawnSync('npx', cucumberArgs, {
        cwd: ROOT,
        stdio: 'pipe',
        env,
        shell: true,
        timeout: Number(process.env.TIMEOUT || 60000) + 20000
      });

      const stdout = result.stdout ? result.stdout.toString() : '';
      const stderr = result.stderr ? result.stderr.toString() : '';

      if (result.status !== 0) {
        // Extract meaningful error from cucumber output
        const errorLines = stderr.split('\n').filter(l => l.trim()).slice(-10).join('\n');
        const failMsg = `Scenario "${scenario.name}" failed (exit ${result.status})`;
        console.error(`\n❌ ${failMsg}\n${errorLines}`);
        throw new Error(failMsg);
      }

      // Log pass
      console.log(`\n✅ ${scenario.name} passed`);
    });
  }
}

// ─── Fallback if no features loaded ────────────────────────────────────────

if (features.length === 0) {
  test('No features loaded — verify features/ directory', async () => {
    console.log(`[PlaywrightCLIRunner] No .feature files found in ${FEATURES_DIR}`);
    console.log(`[PlaywrightCLIRunner] Platform: ${PLATFORM}, Tags: ${TAGS_FILTER || '(none)'}`);
    test.skip();
  });
}
