const sentenceSplitter = (text) => text.split(/\n|\.\s+/).map(s=>s.trim()).filter(Boolean);

module.exports = {
  parse: function(text) {
    const t = String(text || '').trim();
    if (!t) return [];
    // simple heuristic: each sentence becomes an intent with title and description
    const sentences = sentenceSplitter(t);
    return sentences.map((s,i)=>({
      id: `intent-${i+1}`,
      title: s.length>60? s.slice(0,57)+'...': s,
      description: s
    }));
  }
};
