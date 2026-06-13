const fs = require('fs-extra');
module.exports = {
  async prepare(context = {}){
    fs.ensureDirSync('reports/ai');
    const summary = {
      title: 'AI: Automated PR Summary',
      description: 'This PR contains AI-prepared fixes and suggested changes. Review before pushing.',
      changes: context.heals || [],
      evidence: context.execResult && context.execResult.artifacts || []
    };
    fs.writeFileSync('reports/ai/pr-summary.md', `# PR Summary\n\n${JSON.stringify(summary,null,2)}\n`);
    return summary;
  }
};
