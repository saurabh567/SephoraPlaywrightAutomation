import bus from './EventBus';
/**
 * AgentComm.js (Legacy Compatibility)
 *
 * Re-exports the enterprise EventBus for backward compatibility.
 * All functionality now lives in EventBus.js.
 *
 * Legacy usage (still works):
 *   const { publish, subscribe, log } = require('./AgentComm');
 *   publish('topic', { data: 'value' });
 *
 * New usage (recommended):
 *   const bus = require('./core/EventBus');
 *   bus.emit(bus.EVENTS.SCENARIO_FAILED, { scenario: '...' });
 */


module.exports = bus.legacy;
export const EventBus = bus;;
export const EVENTS = bus.EVENTS;;
