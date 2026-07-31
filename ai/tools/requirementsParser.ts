const sentenceSplitter = (text: any) => text.split(/\n|\.\s+/).map((s: any) =>s.trim()).filter(Boolean);

export const parse = function(text: any) {
    const t = String(text || '').trim();
    if (!t) return [];
    const sentences = sentenceSplitter(t);
    return sentences.map((s: any,i: any)=>({
      id: `intent-${i+1}`,
      title: s.length>60? s.slice(0,57)+'...': s,
      description: s
    }));
  };
export default { parse: function(text: any) {
    const t = String(text || '').trim();
    if (!t) return [];
    const sentences = sentenceSplitter(t);
    return sentences.map((s: any,i: any)=>({
      id: `intent-${i+1}`,
      title: s.length>60? s.slice(0,57)+'...': s,
      description: s
    }));
  } };
