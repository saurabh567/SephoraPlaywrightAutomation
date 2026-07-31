import fs from 'fs-extra';
import path from 'path';
// PRAgent - Generates PR descriptions, commit messages, changelogs, and release notes

export const run = async function run(input: any = {}) {
    console.log('[PRAgent] Preparing PR description');
    const { execSync } = require('child_process');
    let gitLog = '';
    let gitDiff = '';
    let changedFiles: any[] = [];
    try {
      gitLog = execSync('git log --oneline -10 2>/dev/null', { encoding: 'utf8' }).trim();
    } catch (e: any) { gitLog = 'No git history available'; }
    try {
      gitDiff = execSync('git diff --name-only HEAD~1 2>/dev/null || git diff --name-only 2>/dev/null', { encoding: 'utf8' }).trim();
      changedFiles = gitDiff.split('\n').filter(Boolean);
    } catch (e: any) {
      try {
        const status = execSync('git status --short 2>/dev/null', { encoding: 'utf8' }).trim();
        changedFiles = status.split('\n').filter(Boolean).map((l: any) => l.slice(3).trim()).filter(Boolean);
      } catch (e2: any) { changedFiles = []; }
    }
    let passRate = 0;
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    const reportPath = path.join(process.cwd(), 'reports/json/cucumber-report.json');
    if (fs.existsSync(reportPath)) {
      try {
        const report = fs.readJsonSync(reportPath);
        const features = Array.isArray(report) ? report : [] as any[];
        const allScenarios = features.flatMap(f => (f.elements || []).filter((e: any) => e.type === 'scenario'));
        totalTests = allScenarios.length;
        passedTests = allScenarios.filter(s => (s.steps || []).every((st: any) => st.result?.status === 'passed')).length;
        failedTests = allScenarios.filter(s => (s.steps || []).some((st: any) => st.result?.status === 'failed')).length;
        passRate = totalTests > 0 ? Number(((passedTests / totalTests) * 100).toFixed(2)) : 0;
      } catch (e: any) {  }
    }
    const prTitle = input.title || `[AI] Test framework update - ${new Date().toISOString().slice(0, 10)}`;
    const lines: any[] = [];
    lines.push(`## ${prTitle}`);
    lines.push('');
    lines.push('### Summary');
    lines.push('');
    lines.push('This PR contains automated updates to the test automation framework.');
    lines.push('');
    lines.push('### Changes');
    lines.push('');
    if (changedFiles.length > 0) {
      lines.push(`**${changedFiles.length} file(s) changed:**`);
      lines.push('');
      for (const f of changedFiles.slice(0, 20)) {
        lines.push(`- \`${f}\``);
      }
      if (changedFiles.length > 20) {
        lines.push(`- ... and ${changedFiles.length - 20} more files`);
      }
    } else {
      lines.push('- No file changes detected');
    }
    lines.push('');
    lines.push('### Test Results');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| Total Tests | ${totalTests} |`);
    lines.push(`| Passed | ${passedTests} |`);
    lines.push(`| Failed | ${failedTests} |`);
    lines.push(`| Pass Rate | ${passRate}% |`);
    lines.push('');
    lines.push('### Recent Commits');
    lines.push('');
    lines.push('```');
    lines.push(gitLog.slice(0, 1000));
    lines.push('```');
    lines.push('');
    if (failedTests > 0) {
      lines.push('### Known Failures');
      lines.push('');
      lines.push(`There are ${failedTests} failing tests that require investigation before merging.`);
      lines.push('');
    }
    lines.push('### Checklist');
    lines.push('');
    lines.push('- [ ] Tests pass locally');
    lines.push('- [ ] No new flaky tests introduced');
    lines.push('- [ ] Code reviewed');
    lines.push('- [ ] CHANGELOG updated');
    const prPath = path.join(process.cwd(), 'reports/ai', 'pr-description.md');
    fs.ensureDirSync(path.dirname(prPath));
    fs.writeFileSync(prPath, lines.join('\n'), 'utf8');
    const changelogPath = path.join(process.cwd(), 'reports/ai', 'changelog-entry.md');
    const changelog: any[] = [];
    changelog.push(`## ${new Date().toISOString().slice(0, 10)}`);
    changelog.push('');
    changelog.push('### Changed');
    for (const f of changedFiles.slice(0, 10)) {
      changelog.push(`- Updated ${f}`);
    }
    changelog.push('');
    changelog.push(`### Test Results: ${passRate}% pass rate (${passedTests}/${totalTests})`);
    fs.writeFileSync(changelogPath, changelog.join('\n'), 'utf8');
    const commitPath = path.join(process.cwd(), 'reports/ai', 'suggested-commit-message.txt');
    const commitMsg = `[AI] Automation update\n\n- ${changedFiles.length} files changed\n- Pass rate: ${passRate}%\n- Date: ${new Date().toISOString().slice(0, 10)}`;
    fs.writeFileSync(commitPath, commitMsg, 'utf8');
    return {
      ok: true,
      prFile: path.relative(process.cwd(), prPath),
      changelogFile: path.relative(process.cwd(), changelogPath),
      commitMessageFile: path.relative(process.cwd(), commitPath),
      summary: {
        filesChanged: changedFiles.length,
        totalTests,
        passedTests,
        failedTests,
        passRate
      }
    };
  };
export default { run: async function run(input: any = {}) {
    console.log('[PRAgent] Preparing PR description');
    const { execSync } = require('child_process');
    let gitLog = '';
    let gitDiff = '';
    let changedFiles: any[] = [];
    try {
      gitLog = execSync('git log --oneline -10 2>/dev/null', { encoding: 'utf8' }).trim();
    } catch (e: any) { gitLog = 'No git history available'; }
    try {
      gitDiff = execSync('git diff --name-only HEAD~1 2>/dev/null || git diff --name-only 2>/dev/null', { encoding: 'utf8' }).trim();
      changedFiles = gitDiff.split('\n').filter(Boolean);
    } catch (e: any) {
      try {
        const status = execSync('git status --short 2>/dev/null', { encoding: 'utf8' }).trim();
        changedFiles = status.split('\n').filter(Boolean).map((l: any) => l.slice(3).trim()).filter(Boolean);
      } catch (e2: any) { changedFiles = []; }
    }
    let passRate = 0;
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    const reportPath = path.join(process.cwd(), 'reports/json/cucumber-report.json');
    if (fs.existsSync(reportPath)) {
      try {
        const report = fs.readJsonSync(reportPath);
        const features = Array.isArray(report) ? report : [] as any[];
        const allScenarios = features.flatMap(f => (f.elements || []).filter((e: any) => e.type === 'scenario'));
        totalTests = allScenarios.length;
        passedTests = allScenarios.filter(s => (s.steps || []).every((st: any) => st.result?.status === 'passed')).length;
        failedTests = allScenarios.filter(s => (s.steps || []).some((st: any) => st.result?.status === 'failed')).length;
        passRate = totalTests > 0 ? Number(((passedTests / totalTests) * 100).toFixed(2)) : 0;
      } catch (e: any) {  }
    }
    const prTitle = input.title || `[AI] Test framework update - ${new Date().toISOString().slice(0, 10)}`;
    const lines: any[] = [];
    lines.push(`## ${prTitle}`);
    lines.push('');
    lines.push('### Summary');
    lines.push('');
    lines.push('This PR contains automated updates to the test automation framework.');
    lines.push('');
    lines.push('### Changes');
    lines.push('');
    if (changedFiles.length > 0) {
      lines.push(`**${changedFiles.length} file(s) changed:**`);
      lines.push('');
      for (const f of changedFiles.slice(0, 20)) {
        lines.push(`- \`${f}\``);
      }
      if (changedFiles.length > 20) {
        lines.push(`- ... and ${changedFiles.length - 20} more files`);
      }
    } else {
      lines.push('- No file changes detected');
    }
    lines.push('');
    lines.push('### Test Results');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| Total Tests | ${totalTests} |`);
    lines.push(`| Passed | ${passedTests} |`);
    lines.push(`| Failed | ${failedTests} |`);
    lines.push(`| Pass Rate | ${passRate}% |`);
    lines.push('');
    lines.push('### Recent Commits');
    lines.push('');
    lines.push('```');
    lines.push(gitLog.slice(0, 1000));
    lines.push('```');
    lines.push('');
    if (failedTests > 0) {
      lines.push('### Known Failures');
      lines.push('');
      lines.push(`There are ${failedTests} failing tests that require investigation before merging.`);
      lines.push('');
    }
    lines.push('### Checklist');
    lines.push('');
    lines.push('- [ ] Tests pass locally');
    lines.push('- [ ] No new flaky tests introduced');
    lines.push('- [ ] Code reviewed');
    lines.push('- [ ] CHANGELOG updated');
    const prPath = path.join(process.cwd(), 'reports/ai', 'pr-description.md');
    fs.ensureDirSync(path.dirname(prPath));
    fs.writeFileSync(prPath, lines.join('\n'), 'utf8');
    const changelogPath = path.join(process.cwd(), 'reports/ai', 'changelog-entry.md');
    const changelog: any[] = [];
    changelog.push(`## ${new Date().toISOString().slice(0, 10)}`);
    changelog.push('');
    changelog.push('### Changed');
    for (const f of changedFiles.slice(0, 10)) {
      changelog.push(`- Updated ${f}`);
    }
    changelog.push('');
    changelog.push(`### Test Results: ${passRate}% pass rate (${passedTests}/${totalTests})`);
    fs.writeFileSync(changelogPath, changelog.join('\n'), 'utf8');
    const commitPath = path.join(process.cwd(), 'reports/ai', 'suggested-commit-message.txt');
    const commitMsg = `[AI] Automation update\n\n- ${changedFiles.length} files changed\n- Pass rate: ${passRate}%\n- Date: ${new Date().toISOString().slice(0, 10)}`;
    fs.writeFileSync(commitPath, commitMsg, 'utf8');
    return {
      ok: true,
      prFile: path.relative(process.cwd(), prPath),
      changelogFile: path.relative(process.cwd(), changelogPath),
      commitMessageFile: path.relative(process.cwd(), commitPath),
      summary: {
        filesChanged: changedFiles.length,
        totalTests,
        passedTests,
        failedTests,
        passRate
      }
    };
  } };


// Auto-registered metadata for AgentRegistry
export const metadata = {
  "name": "PR Agent",
  "version": "1.0.0",
  "description": "Generates PR descriptions, commit messages, changelogs, and release notes",
  "dependencies": ["ReportAgent"],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS",
    "API"
  ],
  "tags": [
    "ci",
    "pr"
  ],
  "executionStage": "reporting",
  "priority": 30,
  "conditions": [
    {
      "type": "ci"
    }
  ],
  "retryPolicy": {
    "maxRetries": 0,
    "backoff": "none"
  },
  "lifecycle": "active"
};
