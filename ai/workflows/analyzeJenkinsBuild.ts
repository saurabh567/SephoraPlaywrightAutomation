import agents from '../agents';
import { writeAiOutput } from '../tools/fileWriter';

async function run(input: any) {
  const analysis = await new agents.jenkinsBuildFailureAnalysis().run();
  const rca = await agents.rca.run({ ...input, analysis });
  const output = `${analysis}\n\n---\n\n${rca}`;
  writeAiOutput('jenkins-build-analysis.md', output);
  return output;
}

export { run };
export default { run: run };
