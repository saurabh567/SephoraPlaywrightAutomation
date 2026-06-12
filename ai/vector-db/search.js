const RetrievalService = require('./unifiedRetrievalService');
const config = require('./vectorConfig');

function parseArgs(argv) {
  const args = { type: 'failures', query: '', top: 5 };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith('--')) {
      args[token.slice(2)] = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

function resolveCollection(type) {
  const map = {
    requirements: config.collections.requirements,
    features: config.collections.featureFiles,
    pageObjects: config.collections.pageObjects,
    failures: config.collections.failures,
    locators: config.collections.locators,
    reports: config.collections.failures,
    jenkins: config.collections.jenkinsLogs
  };
  return map[type] || config.collections.failures;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const query = args.query || 'locator failed timeout element not visible';
  const collectionName = resolveCollection(args.type);
  const service = new RetrievalService();
  const results = await service.search(collectionName, query, Number(args.top || 5));

  console.log(`[VectorDB] Collection: ${collectionName}`);
  console.log(`[VectorDB] Query: ${query}`);
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(`[VectorDB] Search failed: ${error.message}`);
  process.exit(1);
});
