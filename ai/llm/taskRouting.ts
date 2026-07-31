/**
 * taskRouting.js
 *
 * Defines task-to-provider routing rules based on capability, cost, and context.
 *
 * Each task type specifies:
 *   - preferredProvider: The primary provider for this task
 *   - fallbackProvider: Provider to try if primary fails
 *   - minContextWindow: Minimum required context window
 *   - priority: Task priority (critical, high, normal, low)
 *   - description: What this task involves
 */

const TASK_ROUTES: Record<string, any> = {
  // Code Analysis & Generation
  'code-generation': {
    preferredProvider: 'openai',
    fallbackProvider: 'ollama',
    model: { openai: 'gpt-4o-mini', ollama: 'llama3.2:3b', gemini: 'gemini-1.5-flash', claude: 'claude-3-5-sonnet-20241022' },
    minContextWindow: 32000,
    priority: 'high',
    description: 'Test generation, step definitions, page objects, API tests'
  },
  'code-review': {
    preferredProvider: 'claude',
    fallbackProvider: 'openai',
    model: { claude: 'claude-3-5-sonnet-20241022', openai: 'gpt-4o', gemini: 'gemini-1.5-pro' },
    minContextWindow: 64000,
    priority: 'high',
    description: 'Playwright code review, PR review, locator review'
  },
  'architecture-analysis': {
    preferredProvider: 'claude',
    fallbackProvider: 'gemini',
    model: { claude: 'claude-3-opus-20240229', gemini: 'gemini-1.5-pro', openai: 'gpt-4o' },
    minContextWindow: 128000,
    priority: 'critical',
    description: 'Architecture review, dependency analysis, design recommendations'
  },
  'documentation': {
    preferredProvider: 'gemini',
    fallbackProvider: 'claude',
    model: { gemini: 'gemini-1.5-pro', claude: 'claude-3-5-sonnet-20241022', openai: 'gpt-4o' },
    minContextWindow: 256000,
    priority: 'normal',
    description: 'Large-context documentation generation, README, API docs'
  },

  // Analysis & RCA
  'failure-analysis': {
    preferredProvider: 'openai',
    fallbackProvider: 'ollama',
    model: { openai: 'gpt-4o-mini', ollama: 'llama3.2:3b', gemini: 'gemini-1.5-flash' },
    minContextWindow: 32000,
    priority: 'high',
    description: 'Test failure analysis, root cause classification'
  },
  'root-cause-analysis': {
    preferredProvider: 'claude',
    fallbackProvider: 'openai',
    model: { claude: 'claude-3-5-sonnet-20241022', openai: 'gpt-4o', gemini: 'gemini-1.5-pro' },
    minContextWindow: 64000,
    priority: 'critical',
    description: 'Deep root cause analysis with reasoning'
  },

  // Healing
  'locator-healing': {
    preferredProvider: 'openai',
    fallbackProvider: 'ollama',
    model: { openai: 'gpt-4o-mini', ollama: 'llama3.2:3b', gemini: 'gemini-1.5-flash' },
    minContextWindow: 16000,
    priority: 'high',
    description: 'Locator healing recommendations, selector generation'
  },

  // Reporting
  'report-summarization': {
    preferredProvider: 'openai',
    fallbackProvider: 'ollama',
    model: { openai: 'gpt-4o-mini', ollama: 'llama3.2:3b', gemini: 'gemini-1.5-flash' },
    minContextWindow: 32000,
    priority: 'normal',
    description: 'Execution report summarization, trend analysis'
  },

  // Privacy-sensitive tasks (always use local Ollama)
  'privacy-sensitive': {
    preferredProvider: 'ollama',
    fallbackProvider: null,
    model: { ollama: 'llama3.2:3b' },
    minContextWindow: 16000,
    priority: 'normal',
    description: 'Privacy-sensitive data processing (local only)'
  },
  'offline': {
    preferredProvider: 'ollama',
    fallbackProvider: null,
    model: { ollama: 'llama3.2:3b' },
    minContextWindow: 16000,
    priority: 'low',
    description: 'Offline-capable task (no network required)'
  }
};

const TASK_GROUPS = {
  'analysis': ['failure-analysis', 'root-cause-analysis', 'code-review'],
  'generation': ['code-generation', 'locator-healing', 'documentation'],
  'reporting': ['report-summarization', 'architecture-analysis'],
  'private': ['privacy-sensitive', 'offline']
};

function getRoute(taskType: any, options: any = {}) {
  const route = TASK_ROUTES[taskType];
  if (!route) return TASK_ROUTES['code-generation']; // Default to code-gen

  // If a specific provider is requested, use it
  if (options.preferredProvider && route.model[options.preferredProvider]) {
    return { ...route, preferredProvider: options.preferredProvider };
  }

  return route;
}

function getModelForProvider(route: any, providerName: any) {
  return (route.model && route.model[providerName]) || 'llama3.2:3b';
}

export { TASK_ROUTES, TASK_GROUPS, getRoute, getModelForProvider };
export default { TASK_ROUTES, TASK_GROUPS, getRoute, getModelForProvider };
