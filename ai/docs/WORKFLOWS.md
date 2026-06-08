# AI Workflow Examples

## Generate Feature File From Requirement

```bash
npm run ai:workflow -- --workflow generateFeatureFromRequirement --requirement "User can search products by brand"
```

Flow:

```text
Requirement -> Test Case Generation Agent -> Feature File Generation Agent -> ai/output/generated-feature.feature
```

## Generate Playwright Code From Feature File

```bash
npm run ai:workflow -- --workflow generatePlaywrightFromFeature --file features/home.feature
```

Flow:

```text
Feature file -> Page Object Generation Agent -> Step Definition Generation Agent -> ai/output/
```

## Heal Broken Locator Automatically

```bash
npm run ai:workflow -- --workflow healBrokenLocator --file failure.log
```

Flow:

```text
Failure log -> Failure Analysis -> Locator Healing -> Self-Healing Automation -> ai/output/locator-healing-plan.md
```

## Analyze Failed Jenkins Build

```bash
npm run ai:workflow -- --workflow analyzeJenkinsBuild --file jenkins-console.txt
```

Flow:

```text
Jenkins log -> Jenkins Build Failure Analysis -> Root Cause Analysis -> ai/output/jenkins-build-analysis.md
```

## Summarize Execution Report

```bash
npm run ai:workflow -- --workflow summarizeExecutionReport --file reports/json/cucumber-report.json
```

Flow:

```text
Cucumber/Allure report -> Report Summarization Agent -> ai/output/execution-summary.md
```

## Generate Defect Report

```bash
npm run ai:workflow -- --workflow generateDefectReport --file failure.log
```

Flow:

```text
Failure log -> Failure Analysis -> Root Cause Analysis -> ai/output/defect-report.md
```

## Automatic Post-Test AI Analysis

```bash
npm test
```

Flow:

```text
Cucumber execution -> Failure Analysis Agent -> Report Summary Agent -> Execution Memory Agent
```

Generated files:

```text
ai/output/failure-summary.md
ai/output/execution-summary.md
ai/memory/execution-history.json
```
