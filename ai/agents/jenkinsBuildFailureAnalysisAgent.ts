import BaseAgent from '../core/BaseAgent';

class JenkinsBuildFailureAnalysisAgent extends BaseAgent {
  constructor() {
    super({
      name: 'JenkinsBuildFailureAnalysisAgent',
      inputPath: 'ai/input/jenkins-console.log',
      outputPath: 'ai/output/jenkins-failure-analysis.md',
      promptPath: 'ai/prompts/jenkins-failure-analysis.prompt.md',
      purpose: 'Analyze Jenkins console errors and identify root cause.'
    });
  }

  getMockOutput(input: any) {
    const lower = input.toLowerCase();
    const likelyCause = lower.includes('timeout')
      ? 'Timeout while waiting for UI element or page load.'
      : lower.includes('failed')
        ? 'Build contains failed test scenarios.'
        : 'No critical Jenkins failure found in the sample input.';

    return [
      '# Jenkins Build Failure Analysis',
      '',
      `Likely Root Cause: ${likelyCause}`,
      '',
      '## Evidence',
      '',
      '```text',
      input.slice(0, 1500) || 'No Jenkins console log was provided.',
      '```',
      '',
      '## Recommended Action',
      '',
      '1. Check the failed scenario name in the Cucumber report.',
      '2. Open the screenshot and trace from the reports folder.',
      '3. Verify whether the failure is locator, test data, environment, or application related.',
      '4. Re-run the failed tag locally before raising a defect.'
    ].join('\n');
  }
}

export default JenkinsBuildFailureAnalysisAgent;


// Auto-registered metadata for AgentRegistry
export const metadata = {
  "name": "Jenkins Build Failure Analysis Agent",
  "version": "1.0.0",
  "description": "Analyzes Jenkins console errors and identifies root cause",
  "dependencies": ["JenkinsAgent"],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS",
    "API"
  ],
  "tags": [
    "ci",
    "jenkins",
    "analysis"
  ],
  "executionStage": "multi-agent",
  "priority": 35,
  "conditions": [
    {
      "type": "ci"
    },
    {
      "type": "hasJenkinsLog"
    }
  ],
  "retryPolicy": {
    "maxRetries": 0,
    "backoff": "none"
  },
  "lifecycle": "active"
};
