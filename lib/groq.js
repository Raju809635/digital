import { isMathQuestion, readableText } from './format.js';

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
  const groqKey = process.env.GROQ_API_KEY;
  const xaiKey = process.env.XAI_API_KEY;
  const apiKey = groqKey || xaiKey;
  if (!apiKey) throw Object.assign(new Error('Answer service is not configured.'), { status: 503 });
  // Respect the configured provider. Older Vercel setups stored Groq keys under
  // XAI_API_KEY, so recognize Groq's key prefix while still supporting real xAI keys.
  const useXai = !groqKey && !/^gsk_/i.test(xaiKey || '');
  const provider = useXai ? 'xAI' : 'Groq';
  const model = useXai
    ? process.env.GROK_MODEL || 'grok-4.7'
    : process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const response = await fetch(useXai ? 'https://api.x.ai/v1/chat/completions' : 'https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model, temperature: 0.2,
      ...(useXai ? { max_tokens: 16000 } : { max_completion_tokens: 16000 }),
      response_format: { type: 'json_schema', json_schema: { name: 'exam_answers', strict: true, schema: answerSchema } },
      messages: [
        { role: 'system', content: ['You are an expert JNTU exam answer writer. Answer only the exact questions provided. Preserve question wording and order. Extract actual questions from uploaded question-paper text, ignoring headers, footers, page numbers, and instructions. Never invent unrelated questions. Return no more than five answers.', 'For conceptual questions, match the structure to the exact request. Use Definition, Explanation, Key Points, and Conclusion where useful. For compare questions, provide a comparison. For processes and algorithms, explain the steps. Include relevant examples, formulas, diagrams, or tables only when they help answer that exact question.', '5 Marks mode: give a focused answer around 180 to 280 words, with enough explanation and key scoring points for a 5-mark response.', '10 Marks mode: give a full answer, around 450 to 650 words when the question warrants it, enough detail for about 2 to 3 handwritten pages. Explain the concept, structure or working step by step, include relevant examples, formulas, algorithms, advantages or limitations only when asked or useful, and close with a direct conclusion. Do not pad or repeat points.', 'For mathematics problems asking to evaluate, calculate, solve, differentiate, or integrate, return a worked solution with numbered calculation steps and the exact simplified result. Leave definition empty, diagram as Not needed, diagramSpec layout none with empty nodes and edges, keyPoints empty, and keywords empty. Never add generic definitions, keyword lists, or diagrams to a calculation.', 'Write formulas in plain ASCII, not LaTeX: use ln(x), (a)/(b), x^2, beta_0, SUM, and ordinary hyphens. Do not include backslash commands, display-math brackets, Unicode math glyphs, non-breaking spaces, or special hyphens. Use real line breaks between numbered steps.', 'For each non-math question where a diagram helps explain its actual subject, create a unique, technically relevant diagramSpec with 3 to 8 descriptive nodes and edges that show real structures, sequences, hierarchies, or relationships. Choose flow, layers, tree, cycle, or network as appropriate. Never reuse a generic question/key-ideas diagram. For MLP, show input neurons connected to a hidden layer and then output neurons. Set layout to none and use empty nodes and edges when no diagram adds understanding.', mode === '10' ? 'Write for 10 marks with thorough but question-focused detail.' : 'Write for 5 marks with concise but complete detail.', 'If the input contains more than five questions, answer only the first five.'].join(' ') },
        { role: 'user', content: JSON.stringify({ questions, mode }) }
      ]
    }), signal: AbortSignal.timeout(60_000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerMessage = payload?.error?.message || ('Provider request failed (' + response.status + ').');
    throw Object.assign(new Error(provider + ' API ' + response.status + ': ' + providerMessage), { status: response.status === 429 ? 429 : 502 });
  }
  const choice = payload?.choices?.[0];
  const content = choice?.message?.content;
  if (!content && choice?.finish_reason === 'length') {
    throw Object.assign(new Error(provider + ' response reached its output limit (' + model + ').'), { status: 502 });
  }
  try {
    const result = JSON.parse(content);
    if (!Array.isArray(result.answers) || !result.answers.length) throw new Error('empty');
    result.answers = result.answers.slice(0, 5).map(answer => {
      const isMath = isMathQuestion(answer.question, result.subject, answer.explanation);
      const spec = answer.diagramSpec || {};
      const nodes = Array.isArray(spec.nodes) ? spec.nodes.slice(0, 8).map((node, index) => ({ id: String(node.id || ('n' + (index + 1))).slice(0, 24), label: readableText(String(node.label || '').slice(0, 70)), detail: readableText(String(node.detail || '').slice(0, 110)) })) : [];
      const ids = new Set(nodes.map(node => node.id));
      const edges = Array.isArray(spec.edges) ? spec.edges.slice(0, 16).filter(edge => ids.has(String(edge.from)) && ids.has(String(edge.to))).map(edge => ({ from: String(edge.from), to: String(edge.to), label: readableText(String(edge.label || '').slice(0, 32)) })) : [];
      const layouts = ['flow', 'layers', 'tree', 'cycle', 'network', 'none'];
      return {
        question: readableText(String(answer.question || '').slice(0, 1800)), isMath,
        definition: isMath ? '' : readableText(String(answer.definition || '').slice(0, 3000)),
        diagram: isMath ? 'Not needed' : readableText(String(answer.diagram || 'Not needed').slice(0, 500)),
        diagramSpec: isMath ? { title: '', layout: 'none', nodes: [], edges: [] } : { title: readableText(String(spec.title || '').slice(0, 100)), layout: layouts.includes(spec.layout) ? spec.layout : 'none', nodes, edges },
        explanation: readableText(String(answer.explanation || '').slice(0, 7000)),
        keyPoints: isMath ? [] : (Array.isArray(answer.keyPoints) ? answer.keyPoints : []).slice(0, 8).map(point => readableText(String(point))),
        conclusion: readableText(String(answer.conclusion || '').slice(0, 1800)),
        keywords: isMath ? [] : (Array.isArray(answer.keywords) ? answer.keywords : []).slice(0, 10).map(word => readableText(String(word)))
      };
    });
    return result;
  } catch { throw Object.assign(new Error('Could not prepare the answers. Please try again.'), { status: 502 }); }
}
