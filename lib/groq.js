import { isMathQuestion, readableText } from './format.js'

const answerSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    subject: { type: 'string' },
    answers: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: {
        question: { type: 'string' }, definition: { type: 'string' }, explanation: { type: 'string' }, diagram: { type: 'string' },
        diagramSpec: {
          type: 'object', additionalProperties: false,
          properties: {
            title: { type: 'string' },
            layout: { type: 'string', enum: ['flow', 'layers', 'tree', 'cycle', 'network', 'none'] },
            nodes: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, label: { type: 'string' }, detail: { type: 'string' } }, required: ['id', 'label', 'detail'] } },
            edges: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { from: { type: 'string' }, to: { type: 'string' }, label: { type: 'string' } }, required: ['from', 'to', 'label'] } }
          }, required: ['title', 'layout', 'nodes', 'edges']
        },
        keyPoints: { type: 'array', items: { type: 'string' } },
        conclusion: { type: 'string' }, keywords: { type: 'array', items: { type: 'string' } }
      }, required: ['question', 'definition', 'explanation', 'diagram', 'diagramSpec', 'keyPoints', 'conclusion', 'keywords']
    } }
  }, required: ['subject', 'answers']
};

export async function generateAnswers({ questions, mode }) {
  const apiKey = process.env.GROQ_API_KEY || process.env.XAI_API_KEY;
  if (!apiKey) throw Object.assign(new Error('Answer service is not configured.'), { status: 503 });
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b', temperature: 0.2,
      response_format: { type: 'json_schema', json_schema: { name: 'exam_answers', strict: true, schema: answerSchema } },
      messages: [
        { role: 'system', content: ['You are an expert JNTU exam answer writer. Answer only the exact questions provided in the user message. Do not substitute questions, switch subjects, or add unrelated topics. Preserve each question wording and order. If a question is ambiguous, say so briefly instead of guessing.', 'For conceptual questions, write concise exam answers with Definition, Explanation, Key Points, and Conclusion.', 'For mathematics problems that ask to evaluate, calculate, solve, differentiate, or integrate, return a worked solution. Put numbered calculation steps in explanation and the exact simplified result in conclusion. Leave definition empty, diagram as Not needed, diagramSpec layout none with empty nodes and edges, keyPoints empty, and keywords empty. Do not add generic definitions, keyword lists, or diagrams to calculations.', 'Write formulas in plain ASCII, not LaTeX: use ln(x), (a)/(b), x^2, beta_0, SUM, and ordinary hyphens. Do not include backslash commands, display-math brackets, Unicode math glyphs, non-breaking spaces, or special hyphens. Use real line breaks between numbered steps, not the literal characters backslash and n.', 'For each non-math question where a diagram helps explain its actual subject, create a different, technically relevant diagramSpec. Use 3 to 8 descriptive nodes and edges showing the real structure, sequence, hierarchy, or relationships. Choose flow, layers, tree, cycle, or network as appropriate. Never make a generic question/key-ideas diagram or reuse one for unrelated questions. For MLP, show input neurons connected to a hidden layer and then output neurons. If a diagram would not add understanding, set layout to none and use empty nodes and edges. Add a short hand-draw note in diagram when useful.', mode === 'pass' ? 'Pass Mode: short, direct answers with 3 to 4 concise key points.' : 'Score Mode: detailed answers with 5 to 7 useful key points.', 'Return one answer per supplied question. Only when the user message clearly contains a subject/topic but no questions, generate up to five foundational questions for that subject.'].join(' ') },
        { role: 'user', content: JSON.stringify({ questions, mode }) }
      ]
    }), signal: AbortSignal.timeout(60_000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload?.error?.message || ('Provider request failed (' + response.status + ').')), { status: response.status === 429 ? 429 : 502 });
  const content = payload?.choices?.[0]?.message?.content;
  try {
    const result = JSON.parse(content);
    if (!Array.isArray(result.answers) || !result.answers.length) throw new Error('empty');
    result.answers = result.answers.slice(0, 12).map(answer => {
      const isMath = isMathQuestion(answer.question, result.subject, answer.explanation);
      const spec = answer.diagramSpec || {};
      const nodes = Array.isArray(spec.nodes) ? spec.nodes.slice(0, 8).map((node, index) => ({ id: String(node.id || ('n' + (index + 1))).slice(0, 24), label: readableText(String(node.label || '').slice(0, 70)), detail: readableText(String(node.detail || '').slice(0, 110)) })) : [];
      const ids = new Set(nodes.map(node => node.id));
      const edges = Array.isArray(spec.edges) ? spec.edges.slice(0, 16).filter(edge => ids.has(String(edge.from)) && ids.has(String(edge.to))).map(edge => ({ from: String(edge.from), to: String(edge.to), label: readableText(String(edge.label || '').slice(0, 32)) })) : [];
      const layouts = ['flow', 'layers', 'tree', 'cycle', 'network', 'none'];
      return {
        question: readableText(String(answer.question || '').slice(0, 1200)), isMath,
        definition: isMath ? '' : readableText(String(answer.definition || '').slice(0, 2200)),
        diagram: isMath ? 'Not needed' : readableText(String(answer.diagram || 'Not needed').slice(0, 500)),
        diagramSpec: isMath ? { title: '', layout: 'none', nodes: [], edges: [] } : { title: readableText(String(spec.title || '').slice(0, 100)), layout: layouts.includes(spec.layout) ? spec.layout : 'none', nodes, edges },
        explanation: readableText(String(answer.explanation || '').slice(0, 3500)),
        keyPoints: isMath ? [] : (Array.isArray(answer.keyPoints) ? answer.keyPoints : []).slice(0, 8).map(point => readableText(String(point))),
        conclusion: readableText(String(answer.conclusion || '').slice(0, 1200)),
        keywords: isMath ? [] : (Array.isArray(answer.keywords) ? answer.keywords : []).slice(0, 10).map(word => readableText(String(word)))
      };
    });
    return result;
  } catch { throw Object.assign(new Error('Could not prepare the answers. Please try again.'), { status: 502 }); }
}
