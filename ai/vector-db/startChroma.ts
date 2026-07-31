import chromaManager from './chromaServerManager';

async function main() {
  try {
    const res = await chromaManager.start();
    console.log(JSON.stringify(res, null, 2));
  } catch (error: any) {
    console.error(`[VectorDB] ChromaDB startup failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export const start = chromaManager.start;
export default { start: chromaManager.start };
