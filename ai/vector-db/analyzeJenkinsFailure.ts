import fs from 'fs-extra';
import path from 'path';
import IngestionService from './unifiedIngestionService';
import RagService from '../rag/ragService';

async function main() {
  const logPath = path.resolve(process.argv[2] || process.env.JENKINS_LOG_PATH || 'logs/jenkins-console.log');
  if (!fs.existsSync(logPath)) throw new Error(`Jenkins console log was not found: ${logPath}`);

  const log = fs.readFileSync(logPath, 'utf8');
  const ingestion = new IngestionService();
  await ingestion.ingestRuntimeArtifacts();
  await ingestion.ingestJenkinsLog(logPath);

  const rag = new RagService();
  const result = await rag.generate({
    task: 'Analyze the current failed Jenkins build using similar Jenkins logs and test failures.',
    input: log.slice(-30000),
    topK: Number(process.env.JENKINS_RAG_TOP_K || 6),
    systemPrompt: 'You are a Jenkins and Playwright automation failure analysis agent. Cite retrieved source paths.',
    instructions: [
      '- Return Markdown with Build Failure Summary, Evidence, Similar Failures, Root Cause, and Recommended Actions.',
      '- Separate infrastructure, test automation, environment, and application causes.'
    ].join('\n'),
    retrieve: async (retrieval: any, topK: any) => {
      const [jenkinsLogs, failures] = await Promise.all([
        retrieval.searchJenkinsLogs(log.slice(-12000), topK),
        retrieval.searchFailures(log.slice(-12000), topK)
      ]);
      return [...jenkinsLogs, ...failures]
        .sort((left, right) => (right.similarityScore || 0) - (left.similarityScore || 0))
        .slice(0, topK);
    }
  });

  const outputPath = path.join(process.cwd(), 'reports/ai/jenkins-failure-analysis.md');
  const evidencePath = path.join(process.cwd(), 'reports/ai/jenkins-rag-evidence.json');
  fs.ensureDirSync(path.dirname(outputPath));
  fs.writeFileSync(outputPath, result.content);
  fs.writeJsonSync(evidencePath, {
    model: result.model,
    usage: result.usage,
    retrievalEvidence: result.promptEvidence
  }, { spaces: 2 });

  console.log(JSON.stringify({
    outputPath: path.relative(process.cwd(), outputPath),
    evidencePath: path.relative(process.cwd(), evidencePath),
    retrievalEvidence: result.promptEvidence
  }, null, 2));
}

main().catch((error) => {
  console.error(`[AI] Jenkins failure analysis failed: ${error.stack || error.message}`);
  process.exit(1);
});
