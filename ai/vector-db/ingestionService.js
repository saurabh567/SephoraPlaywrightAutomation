const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const config = require('./vectorConfig');
const ChromaClient = require('./chromaClient');
const EmbeddingService = require('./embeddingService');

function hashId(value) {
  return crypto.createHash('sha1').update(value).digest('hex');
}

function listFiles(directory, extensions = []) {
  if (!fs.existsSync(directory)) return [];

  const results = [];
  for (const entry of fs.readdirSync(directory)) {
    const fullPath = path.join(directory, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...listFiles(fullPath, extensions));
    } else if (extensions.length === 0 || extensions.includes(path.extname(fullPath))) {
      results.push(fullPath);
    }
  }
  return results;
}

function readTextFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return '';
  }
}

function buildDocument(collectionName, filePath, type, extraMetadata = {}) {
  const relativePath = path.relative(config.rootDir, filePath);
  const content = readTextFile(filePath);
  if (!content.trim()) return null;

  return {
    collectionName,
    id: hashId(`${collectionName}:${relativePath}:${content.length}`),
    document: content.slice(0, 12000),
    metadata: {
      sourcePath: relativePath,
      type,
      fileName: path.basename(filePath),
      ingestedAt: new Date().toISOString(),
      ...extraMetadata
    }
  };
}

class IngestionService {
  constructor() {
    this.client = new ChromaClient();
    this.embeddingService = new EmbeddingService();
  }

  async ingestAll() {
    await this.client.ensureCollections(Object.values(config.collections));

    const documents = this.collectFrameworkDocuments();
    const grouped = documents.reduce((groups, document) => {
      groups[document.collectionName] = groups[document.collectionName] || [];
      groups[document.collectionName].push(document);
      return groups;
    }, {});

    const results = [];
    for (const [collectionName, collectionDocuments] of Object.entries(grouped)) {
      const records = [];
      for (const document of collectionDocuments) {
        records.push({
          ...document,
          embedding: await this.embeddingService.embedText(document.document)
        });
      }
      results.push(await this.client.addDocuments(collectionName, records));
    }

    return {
      ingestedAt: new Date().toISOString(),
      totalDocuments: documents.length,
      results
    };
  }

  collectFrameworkDocuments() {
    const documents = [];
    const root = config.rootDir;

    for (const file of listFiles(path.join(root, 'ai/knowledge-base/requirements'), ['.txt', '.md'])) {
      const document = buildDocument(config.collections.requirements, file, 'requirement');
      if (document) documents.push(document);
    }

    const requirementInput = path.join(root, 'ai/input/requirement.txt');
    if (fs.existsSync(requirementInput)) {
      const document = buildDocument(config.collections.requirements, requirementInput, 'requirement-input');
      if (document) documents.push(document);
    }

    for (const file of listFiles(path.join(root, 'features'), ['.feature'])) {
      const document = buildDocument(config.collections.featureFiles, file, 'feature-file');
      if (document) documents.push(document);
    }

    for (const file of listFiles(path.join(root, 'ai/knowledge-base/feature-files'), ['.feature', '.md', '.txt'])) {
      const document = buildDocument(config.collections.featureFiles, file, 'knowledge-feature-file');
      if (document) documents.push(document);
    }

    for (const file of listFiles(path.join(root, 'pages'), ['.js'])) {
      const document = buildDocument(config.collections.locators, file, 'page-object');
      if (document) documents.push(document);
    }

    for (const file of listFiles(path.join(root, 'step-definitions'), ['.js'])) {
      const document = buildDocument(config.collections.featureFiles, file, 'step-definition');
      if (document) documents.push(document);
    }

    for (const file of listFiles(path.join(root, 'mobile/locators'), ['.js', '.json'])) {
      const document = buildDocument(config.collections.locators, file, 'mobile-locator');
      if (document) documents.push(document);
    }

    for (const file of listFiles(path.join(root, 'reports/json'), ['.json'])) {
      documents.push(...this.buildFailureDocuments(file));
    }

    for (const file of listFiles(path.join(root, 'reports/screenshots'), ['.png', '.jpg', '.jpeg'])) {
      documents.push({
        collectionName: config.collections.reports,
        id: hashId(`screenshot:${path.relative(root, file)}`),
        document: `Screenshot artifact: ${path.relative(root, file)}`,
        metadata: {
          sourcePath: path.relative(root, file),
          type: 'screenshot-metadata',
          fileName: path.basename(file),
          ingestedAt: new Date().toISOString()
        }
      });
    }

    for (const file of listFiles(path.join(root, 'ai/knowledge-base/test-failures'), ['.log', '.txt', '.md', '.json'])) {
      const document = buildDocument(config.collections.failures, file, 'known-test-failure');
      if (document) documents.push(document);
    }

    for (const file of listFiles(path.join(root, 'ai/knowledge-base/reports'), ['.log', '.txt', '.md', '.json'])) {
      const document = buildDocument(config.collections.reports, file, 'knowledge-report');
      if (document) documents.push(document);
    }

    const jenkinsLog = path.join(root, 'ai/input/jenkins-console.log');
    if (fs.existsSync(jenkinsLog)) {
      const document = buildDocument(config.collections.failures, jenkinsLog, 'jenkins-console-log');
      if (document) documents.push(document);
    }

    return documents;
  }

  buildFailureDocuments(reportPath) {
    const relativePath = path.relative(config.rootDir, reportPath);
    const documents = [];

    try {
      const report = fs.readJsonSync(reportPath);
      for (const feature of report) {
        for (const scenario of feature.elements || []) {
          const failedStep = (scenario.steps || []).find((step) => step.result?.status === 'failed');
          if (!failedStep) continue;

          const error = failedStep.result?.error_message || '';
          documents.push({
            collectionName: config.collections.failures,
            id: hashId(`failure:${relativePath}:${scenario.name}:${failedStep.name}`),
            document: [
              `Feature: ${feature.name}`,
              `Scenario: ${scenario.name}`,
              `Failed Step: ${failedStep.keyword || ''}${failedStep.name}`,
              `Error: ${error}`
            ].join('\n'),
            metadata: {
              sourcePath: relativePath,
              type: 'cucumber-failure',
              feature: feature.name,
              scenario: scenario.name,
              failedStep: failedStep.name,
              ingestedAt: new Date().toISOString()
            }
          });
        }
      }
    } catch (error) {
      const document = buildDocument(config.collections.reports, reportPath, 'json-report');
      if (document) documents.push(document);
    }

    return documents;
  }
}

module.exports = IngestionService;
