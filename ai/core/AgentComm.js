// Lightweight agent communication utilities (Phase-1)
const EventEmitter = require('events');
const emitter = new EventEmitter();

module.exports = {
  publish: (topic, payload) => {
    emitter.emit(topic, payload);
  },
  subscribe: (topic, cb) => {
    emitter.on(topic, cb);
    return () => emitter.off(topic, cb);
  },
  log: (agentName, message) => {
    console.log(`[AgentComm][${agentName}] ${message}`);
  }
};
