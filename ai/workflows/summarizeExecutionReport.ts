import agents from '../agents';
import { writeAiOutput } from '../tools/fileWriter';

async function run(input: any) {
  const summary = await agents.reportSummarization.run(input);
  writeAiOutput('execution-summary.md', summary);
  return summary;
}

export { run };
export default { run: run };
