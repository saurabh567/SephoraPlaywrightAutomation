import { spawnSync } from 'child_process';
import path from 'path';
import cleanReports from './cleanReports';

// ── Clean stale artifacts before any test execution ────────────────────────

(async () => {
  try {
    await cleanReports();
  } catch (err: any) {
    console.error(`[Framework] Cleanup warning (non-fatal): ${err.message}`);
  }
})().then(() => {
  // ═══════════════════════════════════════════════════════════════════════
  // ENTERPRISE MULTI-PLATFORM EXECUTION ORCHESTRATOR
  //
  // Execution order (strictly sequential — platform independence):
  //   1. WEB         — Playwright / Cucumber (headed or headless)
  //   2. ANDROID     — Appium + Emulator lifecycle
  //   3. IOS         — Appium + Simulator lifecycle
  //   4. API         — Playwright APIRequestContext (no browser)
  //   5. PERFORMANCE — Apache JMeter (non-GUI)
  //
  // Post-execution:
  //   6. AI Analysis (JMeter Performance)
  //   7. HTML Reports (all platforms)
  //   8. Consolidated Dashboard
  //
  // Platform Independence:
  //   - One platform failure NEVER blocks subsequent platforms.
  //   - Each platform generates independent reports.
  //   - Dashboard generation runs even if all platforms fail.
  // ═══════════════════════════════════════════════════════════════════════
  const platforms = [
    { name: 'WEB',         script: 'test:web' },
    { name: 'ANDROID',     script: 'test:android' },
    { name: 'IOS',         script: 'test:ios' },
    { name: 'API',         script: 'test:api' },
    { name: 'PERFORMANCE', script: 'perf:jmeter' }
  ];

  const failedPlatforms: any = [];
  const executedPlatforms: any[] = [];

  for (const platform of platforms) {
    console.log(`\n[Framework] ═══════════════════════════════════════════`);
    console.log(`[Framework]  Starting ${platform.name} execution`);
    console.log(`[Framework]  Command: npm run ${platform.script}`);
    console.log(`[Framework] ═══════════════════════════════════════════\n`);

    const startTime = Date.now();
    const result = spawnSync('npm', ['run', platform.script], {
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    executedPlatforms.push({
      name: platform.name,
      exitCode: result.status,
      duration: duration + 's'
    });

    if (result.status !== 0) {
      console.error(`[Framework] ❌ ${platform.name} FAILED (exit code: ${result.status}, duration: ${duration}s)`);
      failedPlatforms.push(platform.name);
    } else {
      console.log(`[Framework] ✅ ${platform.name} PASSED (duration: ${duration}s)`);
    }
  }

  // ── Post-execution: AI Analysis ────────────────────────────────────
  console.log(`\n[Framework] Running AI Performance Analysis...`);
  const aiResult = spawnSync('npm', ['run', 'ai:jmeter-analysis'], {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (aiResult.status !== 0) {
    console.warn(`[Framework] AI Analysis warning (exit: ${aiResult.status})`);
  }

  // ── Post-execution: Consolidated Reports ──────────────────────────
  console.log(`\n[Framework] Generating platform reports...`);
  const reportResult = spawnSync('npm', ['run', 'report:all'], {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (reportResult.status !== 0) {
    console.warn(`[Framework] Report generation warning (exit: ${reportResult.status})`);
  }

  // ── Post-execution: Enterprise Dashboard ──────────────────────────
  console.log(`\n[Framework] Generating consolidated dashboard...`);
  const dashResult = spawnSync('npm', ['run', 'dashboard:generate'], {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (dashResult.status !== 0) {
    console.warn(`[Framework] Dashboard generation warning (exit: ${dashResult.status})`);
  }

  // ── Executive Summary ─────────────────────────────────────────────
  console.log(`\n`);
  console.log(`╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║        ENTERPRISE EXECUTION SUMMARY                         ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝`);
  console.log(``);
  console.log(`  ${'Platform'.padEnd(15)} ${'Status'.padEnd(10)} ${'Duration'.padEnd(10)}`);
  console.log(`  ${'-'.repeat(15)} ${'-'.repeat(10)} ${'-'.repeat(10)}`);
  for (const ep of executedPlatforms) {
    const status = failedPlatforms.includes(ep.name) ? '❌ FAIL' : '✅ PASS';
    console.log(`  ${ep.name.padEnd(15)} ${status.padEnd(10)} ${ep.duration.padEnd(10)}`);
  }
  console.log(``);

  if (failedPlatforms.length > 0) {
    console.error(`  ❌ Failed platform(s): ${failedPlatforms.join(', ')}`);
    console.error(`  ✅ Passed platform(s): ${executedPlatforms.filter(ep => !failedPlatforms.includes(ep.name)).map(ep => ep.name).join(', ')}`);
    console.log(``);
    process.exit(1);
  }

  console.log(`  ✅ All platforms completed successfully`);
  console.log(``);
});
