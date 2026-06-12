const chromaManager = require('./chromaServerManager');

async function main() {
  try {
    const res = await chromaManager.start();
    console.log(JSON.stringify(res, null, 2));
  } catch (error) {
    console.error(`[VectorDB] ChromaDB startup failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { start: chromaManager.start };
