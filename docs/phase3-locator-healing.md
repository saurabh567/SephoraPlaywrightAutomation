# Phase 3: Integrate Locator Healing (Dry‑Run)

Overview
- The post-test flow extracts locator failures, runs analyzer, and writes proposals to reports/ai/.
- Fully opt-in via env: LOCATOR_HEALING=1. Dry run only.

Environment variables
- LOCATOR_HEALING=1  (enable post-test analysis)
- REPORT_DIR (path to cucumber/playwright reports)
- LOCATOR_DRY_RUN=1  (default) -- when 0, operator can run apply manually via agent.applySafeFixes({mode:'apply', proposalsFile:...})

Files
- ai/integrations/playwrightFailureParser.js : parser
- utils/generateFailedLocators.js : CLI writer
- utils/postTestLocatorAnalyze.js : post-test runner
- utils/runCucumberWithAi.js : minor opt-in hook

Safety
- No automatic modifications unless agent.applySafeFixes(..., mode:'apply') explicitly run by operator.
- Backups saved under ai/backups/<timestamp> when apply mode used.
- All outputs under reports/ai/.

Usage
1. Run tests normally.
2. To enable analysis: LOCATOR_HEALING=1 npm test
3. Review reports/ai/locator-healing-proposals.json and patches in reports/ai/locator-healing-patches before any edits.

Rollback
- If apply performed, call agent.rollback(backupRoot) or restore from ai/backups.

End.
