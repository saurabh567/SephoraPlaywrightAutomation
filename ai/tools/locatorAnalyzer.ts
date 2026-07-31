import fs from 'fs-extra';
import path from 'path';

// Simple file walker to find files under given roots
function listFilesUnderRoots(roots: any, exts: any[] = ['.js', '.ts']) {
  const files: any[] = [];
  for (const root of roots) {
    const p = path.join(process.cwd(), root);
    if (!fs.existsSync(p)) continue;
    const stack = [p];
    while (stack.length) {
      const cur: any = stack.pop();
      const stat = fs.statSync(cur);
      if (stat.isDirectory()) {
        const children = fs.readdirSync(cur).map(c => path.join(cur, c));
        for (const c of children) stack.push(c);
      } else {
        if (exts.includes(path.extname(cur))) files.push(path.relative(process.cwd(), cur));
      }
    }
  }
  return files;
}

function scoreSimilarity(a: any, b: any) {
  if (!a || !b) return 0;
  let max = 0;
  for (let i=0;i<a.length;i++){
    for (let j=i+1;j<=a.length;j++){
      const sub = a.slice(i,j);
      if (b.includes(sub) && sub.length > max) max = sub.length;
    }
  }
  const avg = (a.length + b.length) / 2;
  return avg ? (max/avg) : 0;
}

function extractQuotedStrings(text: any) {
  const out = new Set();
  const re = /(['"`])([^'"`]{3,200}?)\1/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.add(m[2]);
  }
  return Array.from(out);
}

async function findCandidatesForFailure(failure: any, opts: any = {}) {
  const roots = opts.searchRoots || ['pages', 'mobile', 'test-helpers'];
  const files = listFilesUnderRoots(roots);
  const candidates: any = [];
  const targetLocator = String(failure.locator || '');
  if (!targetLocator) return candidates;
  for (const f of files) {
    try {
      const txt = fs.readFileSync(f, 'utf8');
      const strings = extractQuotedStrings(txt);
      for (const candidate of strings) {
        const score = scoreSimilarity(targetLocator, candidate);
        if (score > 0.18) {
          candidates.push({ locator: candidate, sourceFile: f, score, heuristic: 'string-similarity' });
        }
      }
    } catch (e: any) {
      // ignore
    }
  }

  if (!candidates.length) {
    const fragMatch = targetLocator.match(/[#.]([A-Za-z0-9_-]+)/) || [null,null];
    const frag = fragMatch[1];
    if (frag) {
      for (const f of files) {
        try {
          const txt = fs.readFileSync(f, 'utf8');
          if (txt.includes(frag)) {
            candidates.push({ locator: `contains:${frag}`, sourceFile: f, score: 0.25, heuristic: 'fragment-match' });
          }
        } catch (e: any) { }
      }
    }
  }

  candidates.sort((a: any, b: any) => (b.score||0) - (a.score||0));
  return candidates.slice(0, 10);
}

function classifyRisk(failure: any, candidate: any) {
  const s = candidate.score || 0;
  const sf = candidate.sourceFile || '';
  if (s >= 0.6 && /pages[\\/]/i.test(sf)) return 'LOW';
  if (candidate.locator && /^#[-A-Za-z0-9_]+$/.test(candidate.locator)) return 'LOW';
  if (s >= 0.18 && s < 0.6) return 'MEDIUM';
  return 'HIGH';
}

export { findCandidatesForFailure, classifyRisk };
export default { findCandidatesForFailure: findCandidatesForFailure, classifyRisk: classifyRisk };
