const fs = require('fs-extra');
const path = require('path');

function listPageObjectMethods() {
  const dir = path.join(process.cwd(), 'pages');
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const files = fs.readdirSync(dir).filter(f=>f.endsWith('.js')||f.endsWith('.ts'));
  for (const f of files) {
    try {
      const c = fs.readFileSync(path.join(dir,f),'utf8');
      // find method names: this.methodName = async () => or methodName() {
      const reAssign = /this\.([A-Za-z0-9_]+)\s*=\s*async\s*\(/g;
      let m;
      while ((m = reAssign.exec(c)) !== null) out.push({ method: m[1], file: path.join('pages', f) });
      const reDef = /class\s+[^\s{]+[^{]*{[\s\S]*?([A-Za-z0-9_]+)\s*\([^\)]*\)\s*{?/g;
      // naive: also match function defs (may be noisy)
      while ((m = reDef.exec(c)) !== null) {
        if (m[1] && m[1].length>2) out.push({ method: m[1], file: path.join('pages', f) });
      }
    } catch (e) {}
  }
  return out;
}

const METHODS = listPageObjectMethods();

module.exports = {
  suggestForScenario: function(scenario) {
    // simple heuristic: look for verbs/nouns in steps and match to method names
    const text = (scenario.steps||[]).join(' ').toLowerCase();
    const matches = METHODS.filter(m=> text.includes(m.method.toLowerCase()) || text.includes(m.method.replace(/get|click|enter/gi,'')) ).slice(0,5);
    return matches;
  },
  _methods: METHODS
};
