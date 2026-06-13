#!/usr/bin/env node
const AgentClass = require('../agents/TestCaseGenerationAgent');
const fs = require('fs-extra');
const path = require('path');

(async ()=>{
  try {
    const sample = 'As a shopper I want to add an item to cart and checkout so that I can purchase';
    const agent = new AgentClass();
    const res = await agent.generateFeatureWithRag(sample);
    console.log('Test generation (dry-run) completed. Output:', res.outputPath);
    console.log('Generated feature content preview:\n', res.response.slice(0, 500));
  } catch (e) {
    console.error('Error running test generation:', e && e.stack);
    process.exit(2);
  }
})();
