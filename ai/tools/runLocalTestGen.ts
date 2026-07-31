#!/usr/bin/env node
import RequirementsParser from './requirementsParser';
import Synth from './featureSynthesizer';
import StepMapper from './stepMapper';
import PageObjectLinker from './pageObjectLinker';
import OutputWriter from './outputWriter';

(async ()=>{
  try {
    const sample = process.argv.slice(2).join(' ') || 'As a shopper I want to add an item to cart and checkout so that I can purchase';
    const intents = RequirementsParser.parse(sample);
    const writer = new OutputWriter({ dryRun: true });
    const generated: any[] = [];
    for (const intent of intents) {
      const feats = Synth.synthesize(intent, { max: 2 });
      for (const f of feats) {
        const scenarios: any[] = [];
        for (const sc of f.scenarios) {
          const steps = sc.steps.map((st: any) => ({ text: st, mapping: StepMapper.findMatch(st) }));
          const poLinks = PageObjectLinker.suggestForScenario(sc);
          const confidence = Math.round((steps.reduce((a: any, b: any) => a + (b.mapping ? b.mapping.matchConfidence : 0.5), 0)/steps.length)*100);
          scenarios.push({ title: sc.title, steps, poLinks, confidence });
        }
        const featureObj = { id: `gen-${Date.now()}-${Math.abs(Math.floor(Math.random()*1e9))}`, title: f.title, scenarios };
        const out = writer.writeFeature(featureObj);
        generated.push({ featureObj, out });
      }
    }
    // write summary
    const fs = require('fs-extra');
    const path = require('path');
    const summaryPath = path.join(process.cwd(), 'reports', 'ai', 'generated-tests-summary.md');
    fs.ensureDirSync(require('path').dirname(summaryPath));
    const lines = ['# Generated Tests Summary', `Generated: ${generated.length} features`, ''];
    for (const g of generated) {
      lines.push(`- ${g.featureObj.title} (id: ${g.featureObj.id})`);
      for (const s of g.featureObj.scenarios) lines.push(`  - ${s.title} (confidence: ${s.confidence})`);
    }
    fs.writeFileSync(summaryPath, lines.join('\n'));

    console.log('Dry-run generation complete. Generated count:', generated.length);
    console.log('Summary:', summaryPath);
    process.exit(0);
  } catch (e: any) {
    console.error('Generation error:', e && e.stack);
    process.exit(2);
  }
})();
