import fs from 'fs-extra';
import path from 'path';

function extractStepStringsFromFile(content: any) {
  const out: any[] = [];
  // naive: find strings inside Given(, When(, Then( calls
  const re = /(?:Given|When|Then)\s*\(\s*(['"`])([^'"`]{3,200})\1/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    out.push(m[2]);
  }
  return out;
}

function buildStepIndex() {
  const dir = path.join(process.cwd(), 'step-definitions');
  const index: any = [];
  if (!fs.existsSync(dir)) return index;
  const files = fs.readdirSync(dir).filter(f=>f.endsWith('.js')||f.endsWith('.ts'));
  for (const f of files) {
    try {
      const c = fs.readFileSync(path.join(dir,f),'utf8');
      const strs = extractStepStringsFromFile(c);
      for (const s of strs) index.push({ text: s, file: path.join('step-definitions', f) });
    } catch (e: any) {}
  }
  return index;
}

const INDEX = buildStepIndex();

function similarity(a: any,b: any) {
  if (!a||!b) return 0;
  a=a.toLowerCase(); b=b.toLowerCase();
  const shared = a.split(' ').filter((w: any) =>b.includes(w)).length;
  const avg = (a.split(' ').length + b.split(' ').length)/2;
  return avg? shared/avg : 0;
}

export const findMatch = function(stepText: any) {
    let best = null;
    for (const s of INDEX) {
      const c = similarity(stepText, s.text);
      if (!best || c>best.score) best = { source: s, score: c };
    }
    if (!best) return null;
    return { matchedStep: best.source.text, sourceFile: best.source.file, matchConfidence: Number(best.score.toFixed(2)) };
  };
export const _index = INDEX;
export default { findMatch: function(stepText: any) {
    let best = null;
    for (const s of INDEX) {
      const c = similarity(stepText, s.text);
      if (!best || c>best.score) best = { source: s, score: c };
    }
    if (!best) return null;
    return { matchedStep: best.source.text, sourceFile: best.source.file, matchConfidence: Number(best.score.toFixed(2)) };
  }, _index: INDEX };
