/**
 * plugins/custom-events/myPluginEvents.js
 *
 * Custom event definitions for plugins.
 * These events are loaded by EventBus.loadCustomEventsFromDir().
 * Users can add custom events WITHOUT modifying ai/core/EventBus.js.
 *
 * Each file should export an array of { name, description } objects.
 */

module.exports = [
  { name: 'PluginDeployed', description: 'A plugin was deployed successfully' },
  { name: 'PluginHealthCheckPassed', description: 'Plugin health check passed' },
  { name: 'PluginHealthCheckFailed', description: 'Plugin health check failed' },
  { name: 'CustomDataProcessed', description: 'Custom data was processed by a plugin' },
  { name: 'ExternalSystemSynced', description: 'External system data was synchronized' }
];
