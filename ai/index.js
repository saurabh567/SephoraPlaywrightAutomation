// Beginner-friendly AI CLI.
const AgentRunner = require('./core/AgentRunner');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--all') {
      args.all = true;
    } else if (token === '--post-test') {
      args.postTest = true;
    } else if (token.startsWith('--')) {
      args[token.slice(2)] = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runner = new AgentRunner();

  if (args.all) {
    await runner.runAll();
    return;
  }

  if (args.postTest) {
    await runner.runPostTestAnalysis();
    return;
  }

  if (args.agent) {
    await runner.runAgent(args.agent);
    return;
  }

  console.log('Usage:');
  console.log('  node ai/index.js --agent TestCaseGenerationAgent');
  console.log('  node ai/index.js --all');
  console.log('  node ai/index.js --post-test');
}

main().catch((error) => {
  console.error(`[AI] Failed: ${error.message}`);
  process.exit(1);
});
