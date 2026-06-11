const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const config = require('./vectorConfig');
const ChromaClient = require('./chromaClient');
const EmbeddingService = require('./embeddingService');

function hashId(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function listFiles(directory, extensions = []) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath, extensions);
    return extensions.length === 0 || extensions.includes(path.extname(entry.name).toLowerCase()) ? [fullPath] : [];
  });
}

function chunkText(content, chunkSize = config.chunkSize, overlap = config.chunkOverlap) {
  const text = String(content || '').trim();
  if (!text) return [];
  if (overlap >= chunkSize) throw new Error('VECTOR_CHUNK_OVERLAP must be smaller than VECTOR_CHUNK_SIZE.');

  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf(' ', end));
      if (boundary > start + Math.floor(chunkSize * 0.6)) end = boundary;
    }
    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks.filter(Boolean);
}

function scalarMetadata(metadata) {
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) =>
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    )
  );
}

function redactSensitiveData(content) {
  return String(content)
    .replace(/(authorization:\s*bearer\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|token|password|secret)\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED_AWS_ACCESS_KEY]');
}

class IngestionService {
  constructor(options = {}) {
    this.client = options.client || new ChromaClient();
    this.embeddingService = options.embeddingService || new EmbeddingService();
  }

  buildFileRecords(collectionName, filePath, type, extraMetadata = {}) {
    const relativePath = path.relative(config.rootDir, filePath);
    const rawContent = fs.readFileSync(filePath, 'utf8');
    const content = /log|report|failure/i.test(type) ? redactSensitiveData(rawContent) : rawContent;
    return chunkText(content).map((document, chunkIndex) => ({
      collectionName,
      id: hashId(`${collectionName}:${relativePath}:${type}:${chunkIndex}:${document}`),
      document,
      metadata: scalarMetadata({
        sourcePath: relativePath,
        fileName: path.basename(filePath),
        extension: path.extname(filePath).toLowerCase(),
        type,
        chunkIndex,
        ingestedAt: new Date().toISOString(),
        ...extraMetadata
      })
    }));
  }

  buildLocatorRecords(filePath) {
    const relativePath = path.relative(config.rootDir, filePath);
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    const locatorPattern = /(locator\(|getByRole\(|getByText\(|getByLabel\(|getByPlaceholder\(|getByTestId\(|\$\(|\$\$\(|accessibility id|xpath|css selector)/i;

    return lines.flatMap((line, index) => {
      if (!locatorPattern.test(line)) return [];
      const document = [
        `Source: ${relativePath}`,
        `Line: ${index + 1}`,
        `Locator code: ${line.trim()}`
      ].join('\n');
      return [{
        collectionName: config.collections.locators,
        id: hashId(`${config.collections.locators}:${relativePath}:${index + 1}:${line.trim()}`),
        document,
        metadata: {
          sourcePath: relativePath,
          fileName: path.basename(filePath),
          type: 'locator',
          line: index + 1,
          ingestedAt: new Date().toISOString()
        }
      }];
    });
  }

  buildCucumberFailureRecords(reportPath) {
    const relativePath = path.relative(config.rootDir, reportPath);
    let report;
    try {
      report = fs.readJsonSync(reportPath);
    } catch (error) {
      return [];
    }
    if (!Array.isArray(report)) return [];

    return report.flatMap((feature) =>
      (feature.elements || []).flatMap((scenario) => {
        const failedStep = (scenario.steps || []).find((step) => step.result?.status === 'failed');
        if (!failedStep) return [];
        const document = [
          `Feature: ${feature.name || ''}`,
          `Scenario: ${scenario.name || ''}`,
          `Failed Step: ${failedStep.keyword || ''}${failedStep.name || ''}`,
          `Error: ${failedStep.result?.error_message || ''}`
        ].join('\n');
        return [{
          collectionName: config.collections.failures,
          id: hashId(`cucumber-failure:${relativePath}:${scenario.name}:${failedStep.name}:${document}`),
          document,
          metadata: {
            sourcePath: relativePath,
            fileName: path.basename(reportPath),
            type: 'cucumber-failure',
            feature: String(feature.name || ''),
            scenario: String(scenario.name || ''),
            failedStep: String(failedStep.name || ''),
            ingestedAt: new Date().toISOString()
          }
        }];
      })
    );
  }

  buildCucumberReportSummary(reportPath) {
    let report;
    try {
      report = fs.readJsonSync(reportPath);
    } catch (error) {
      return null;
    }
    if (!Array.isArray(report) || !report.some((feature) => Array.isArray(feature.elements))) return null;

    const scenarios = report.flatMap((feature) => feature.elements || []);
    const failed = scenarios.filter((scenario) =>
      (scenario.steps || []).some((step) => step.result?.status === 'failed')
    ).length;
    const skipped = scenarios.filter((scenario) => {
      const statuses = (scenario.steps || []).map((step) => step.result?.status);
      return statuses.length > 0 && statuses.every((status) => status === 'skipped');
    }).length;
    const relativePath = path.relative(config.rootDir, reportPath);
    const document = [
      `Cucumber report: ${relativePath}`,
      `Features: ${report.length}`,
      `Scenarios: ${scenarios.length}`,
      `Failed scenarios: ${failed}`,
      `Skipped scenarios: ${skipped}`,
      `Passed scenarios: ${Math.max(0, scenarios.length - failed - skipped)}`,
      `Feature names: ${report.map((feature) => feature.name).filter(Boolean).join(', ')}`
    ].join('\n');

    return {
      collectionName: config.collections.failures,
      id: hashId(`test-report:${relativePath}:${document}`),
      document,
      metadata: {
        sourcePath: relativePath,
        fileName: path.basename(reportPath),
        type: 'test-report',
        scenarioCount: scenarios.length,
        failureCount: failed,
        ingestedAt: new Date().toISOString()
      }
    };
  }

  collectFrameworkDocuments(options = {}) {
    const root = config.rootDir;
    const documents = [];
    const includeSources = options.includeSources !== false;
    const includeRuntime = options.includeRuntime !== false;

    if (includeSources) {
      for (const file of listFiles(path.join(root, 'ai/knowledge-base/requirements'), ['.txt', '.md'])) {
        documents.push(...this.buildFileRecords(config.collections.requirements, file, 'requirement'));
      }

      const requirementInput = path.join(root, 'ai/input/requirement.txt');
      if (fs.existsSync(requirementInput)) {
        documents.push(...this.buildFileRecords(config.collections.requirements, requirementInput, 'requirement-input'));
      }

      for (const file of listFiles(path.join(root, 'features'), ['.feature'])) {
        documents.push(...this.buildFileRecords(config.collections.featureFiles, file, 'feature-file'));
      }

      for (const file of listFiles(path.join(root, 'step-definitions'), ['.js'])) {
        documents.push(...this.buildFileRecords(config.collections.featureFiles, file, 'step-definition'));
        documents.push(...this.buildLocatorRecords(file));
      }

      for (const directory of ['pages', 'framework', 'mobile']) {
        for (const file of listFiles(path.join(root, directory), ['.js', '.json'])) {
          documents.push(...this.buildFileRecords(config.collections.pageObjects, file, 'page-object'));
          documents.push(...this.buildLocatorRecords(file));
        }
      }
    }

    if (includeRuntime) {
      const reportFiles = listFiles(path.join(root, 'reports'), ['.json', '.txt', '.md', '.log']);
      for (const file of reportFiles) {
        const summary = this.buildCucumberReportSummary(file);
        if (summary) {
          documents.push(...this.buildCucumberFailureRecords(file), summary);
        } else {
          documents.push(...this.buildFileRecords(config.collections.failures, file, 'test-report'));
        }
      }

      for (const file of listFiles(path.join(root, 'logs'), ['.log', '.txt', '.json'])) {
        documents.push(...this.buildFileRecords(config.collections.failures, file, 'execution-log'));
      }

      const jenkinsFiles = [
        path.join(root, 'ai/input/jenkins-console.log'),
        ...listFiles(path.join(root, 'reports'), ['.log']).filter((file) => /jenkins/i.test(file))
      ];
      for (const file of [...new Set(jenkinsFiles)].filter((item) => fs.existsSync(item))) {
        documents.push(...this.buildFileRecords(config.collections.jenkinsLogs, file, 'jenkins-log'));
      }
    }

    return documents;
  }

  async ingestDocuments(documents) {
    await this.client.healthCheck();
    this.embeddingService.validateConfiguration();
    await this.client.ensureCollections(Object.values(config.collections));

    const grouped = documents.reduce((result, document) => {
      result[document.collectionName] = result[document.collectionName] || [];
      result[document.collectionName].push(document);
      return result;
    }, {});

    const results = [];
    for (const [collectionName, collectionDocuments] of Object.entries(grouped)) {
      const embeddings = await this.embeddingService.embedMany(collectionDocuments.map((item) => item.document));
      const records = collectionDocuments.map((document, index) => ({
        ...document,
        embedding: embeddings[index]
      }));
      results.push(await this.client.upsertDocuments(collectionName, records));
    }
    return results;
  }

  async ingestAll() {
    const documents = this.collectFrameworkDocuments();
    const results = await this.ingestDocuments(documents);
    return {
      ingestedAt: new Date().toISOString(),
      embeddingModel: this.embeddingService.model,
      embeddingDimensions: this.embeddingService.expectedDimensions,
      totalDocuments: documents.length,
      results
    };
  }

  async ingestRuntimeArtifacts() {
    const documents = this.collectFrameworkDocuments({ includeSources: false, includeRuntime: true });
    const results = await this.ingestDocuments(documents);
    return {
      ingestedAt: new Date().toISOString(),
      totalDocuments: documents.length,
      results
    };
  }

  async ingestJenkinsLog(filePath) {
    if (!fs.existsSync(filePath)) throw new Error(`Jenkins log does not exist: ${filePath}`);
    const documents = this.buildFileRecords(config.collections.jenkinsLogs, filePath, 'jenkins-log');
    const results = await this.ingestDocuments(documents);
    return { totalDocuments: documents.length, results };
  }
}

module.exports = IngestionService;
module.exports.chunkText = chunkText;
