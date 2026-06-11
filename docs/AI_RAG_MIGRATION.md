# ChromaDB and RAG Migration

## Current Architecture

```text
Playwright/Cucumber execution
  -> Cucumber JSON reports
  -> optional generic AI agents

Standalone vector commands
  -> deterministic hash embeddings
  -> Chroma REST attempt
  -> silent local JSON fallback
  -> hard-coded Markdown generation
```

Current limitations:

- ChromaDB availability is optional and failures silently use a JSON store.
- `MOCK_MODE=true` creates hash vectors rather than model embeddings.
- Retrieved documents are not placed in an LLM prompt.
- Normal, platform, and Jenkins test paths do not run vector retrieval.
- Report ingestion only covers one fixed report directory.

## Target Architecture

```text
Framework sources and runtime artifacts
  -> chunking and metadata extraction
  -> real embedding API
  -> ChromaDB collections

Test failure / requirement / Jenkins failure
  -> RetrievalService
  -> ChromaDB similarity query
  -> PromptBuilder with cited retrieved documents
  -> real LLM API
  -> agent Markdown artifact

Cucumber execution
  -> runtime artifact ingestion
  -> FailureAnalysisAgent
  -> LocatorHealingAgent
  -> reports/ai/

Jenkins failed build
  -> console log capture and ingestion
  -> Jenkins failure RAG analysis
  -> reports/ai/
  -> archived build artifacts
```

ChromaDB collections:

- `requirements_collection`
- `feature_files_collection`
- `page_objects_collection`
- `locators_collection`
- `failures_collection`
- `jenkins_logs_collection`

## Files Impacted

Existing files:

- `.env.example`
- `.gitignore`
- `package.json`
- `Jenkinsfile`
- `utils/runCucumberWithAi.js`
- `ai/vector-db/vectorConfig.js`
- `ai/vector-db/chromaClient.js`
- `ai/vector-db/embeddingService.js`
- `ai/vector-db/ingestionService.js`
- `ai/vector-db/retrievalService.js`
- `ai/vector-db/startChroma.js`
- `ai/agents/failureAnalysisAgent.js`
- `ai/agents/locatorHealingAgent.js`
- `ai/agents/testCaseGenerationAgent.js`

New files:

- `docker-compose.chroma.yml`
- `ai/rag/llmService.js`
- `ai/rag/promptBuilder.js`
- `ai/rag/ragService.js`
- `ai/vector-db/health.js`
- `ai/vector-db/vectorTest.js`
- `ai/vector-db/ragTest.js`
- `ai/vector-db/aiTest.js`
- `ai/vector-db/analyzeJenkinsFailure.js`

## Migration Plan

1. Replace local fallback and hash embeddings with strict Chroma and embedding clients.
2. Add source-aware chunking and idempotent collection upserts.
3. Implement scored retrieval across the six collections.
4. Add prompt construction that embeds retrieved document text and source metadata.
5. Route failure analysis, locator healing, and feature generation through RAG.
6. Run failure agents after AI-enabled test execution.
7. Capture and analyze failed Jenkins build logs.
8. Add health, vector, RAG, and agent validation commands.
9. Require external credentials and service health for AI-enabled execution.

## Rollout Safety

- `npm test` keeps the existing Cucumber execution and adds AI startup validation and
  post-test RAG processing through a wrapper.
- `npm run test:core` preserves the original plain Cucumber command.
- `npm run test:ai` is an explicit alias for the AI-enriched execution path.
- AI code does not modify page objects or tests automatically.
- Locator healing remains recommendation-only.
- Missing ChromaDB, embedding credentials, or LLM credentials produces an explicit
  failure instead of simulated output.

Jenkins prerequisites:

- The agent must provide Docker with the Compose plugin, unless `CHROMA_URL` targets
  an externally managed service and the startup stage is adapted accordingly.
- Jenkins must contain a Secret Text credential with ID `openai-api-key`.
- Access to `currentBuild.rawBuild.getLog` may require Jenkins script approval.
