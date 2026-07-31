import agents from '../agents';
import { writeAiOutput } from '../tools/fileWriter';

async function run(input: any) {
  const failure = await agents.failureAnalysis.run(input);
  const rca = await agents.rca.run({ ...input, failure });
  const defect = [
    '# Defect Report',
    '',
    '## Failure Analysis',
    failure,
    '',
    '## Root Cause Analysis',
    rca
  ].join('\n');
  writeAiOutput('defect-report.md', defect);
  return defect;
}

export { run };
export default { run: run };
