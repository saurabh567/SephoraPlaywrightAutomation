// PRAgent - Generates PR descriptions, commit messages, changelogs, and release notes
const fs = require('fs-extra');
const path = require('path');

module.exports = {
  run: async function run(input = {}) {
    console.log('[PRAgent] Preparing PR description');

    const { execSync } = require('child_process');

    // Gather git changes
    let gitLog = '';
    let gitDiff = '';
    let changedFiles = [];

    try {
      gitLog = execSync('git log --oneline -10 2>/dev/null', { encoding: 'utf8' }).trim();
    } catch (e) { gitLog = 'No git history available'; }

    try {
      gitDiff = execSync('git diff --name-only HEAD~1 2>/dev/null || git diff --name-only 2>/dev/null', { encoding: 'utf8' }).trim();
      changedFiles = gitDiff.split('\n').filter(Boolean);
    } catch (e) {
      try {
        const status = execSync('git status --short 2>/dev/null', { encoding: 'utf8' }).trim();
        changedFiles = status.split('\n').filter(Boolean).map(l => l.slice(3).trim()).filter(Boolean);
      } catch (e2) { changedFiles = []; }
    }

    // Gather test results
    let passRate = 0;
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;

    const reportPath = path.join(process.cwd(), 'reports/json/cucumber-report.json');
    if (fs.existsSync(reportPath)) {
      try {
        const report = fs.readJsonSync(reportPath);
        const features = Array.isArray(report) ? report : [];
        const allScenarios = features.flatMap(f => (f.elements || []).filter(e => e.type === 'scenario'));
        totalTests = allScenarios.length;
        passedTests = allScenarios.filter(s => (s.steps || []).every(st => st.result?.status === 'passed')).length;
        failedTests = allScenarios.filter(s => (s.steps || []).some(st => st.result?.status === 'failed')).length;
        passRate = totalTests > 0 ? Number(((passedTests / totalTests) * 100).toFixed(2)) : 0;
      } catch (e) { /* ignore */ }
    }

    // Build PR description
    const prTitle = input.title || `[AI] Test framework update - ${new Date().toISOString().slice(0, 10)}`;

    const lines = [];
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

    // Write PR description
    const prPath = path.join(process.cwd(), 'reports/ai', 'pr-description.md');
    fs.ensureDirSync(path.dirname(prPath));
    fs.writeFileSync(prPath, lines.join('\n'), 'utf8');

    // Generate changelog entry
    const changelogPath = path.join(process.cwd(), 'reports/ai', 'changelog-entry.md');
    const changelog = [];
    changelog.push(`## ${new Date().toISOString().slice(0, 10)}`);
    changelog.push('');
    changelog.push('### Changed');
    for (const f of changedFiles.slice(0, 10)) {
      changelog.push(`- Updated ${f}`);
    }
    changelog.push('');
    changelog.push(`### Test Results: ${passRate}% pass rate (${passedTests}/${totalTests})`);
    fs.writeFileSync(changelogPath, changelog.join('\n'), 'utf8');

    // Generate commit message suggestion
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
  }
};
