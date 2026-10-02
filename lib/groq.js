const answerSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    subject: { type: 'string' },
    answers: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: {
        question: { type: 'string' }, definition: { type: 'string' }, explanation: { type: 'string' },
        keyPoints: { type: 'array', items: { type: 'string' } },
        conclusion: { type: 'string' }, keywords: { type: 'array', items: { type: 'string' } }
      }, required: ['question', 'definition', 'explanation', 'keyPoints', 'conclusion', 'keywords']
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
        { role: 'system', content: ['You are an expert JNTU exam answer writer. Generate structured, accurate answers for the questions provided. Write like a student in an exam. Use exactly these sections: Definition, Explanation, Key Points, Conclusion. Keep answers focused on marks and avoid unnecessary theory. Highlight important scoring keywords by listing them in keywords. For each answer, include enough detail to be useful and do not invent facts.', mode === 'pass' ? 'Pass Mode: short, direct answers with 3 to 4 concise key points.' : 'Score Mode: detailed high-mark answers with 5 to 7 useful key points and enough explanation.', 'Separate every question into its own answer. If the source gives questions, answer them. If it gives only a subject/topic, generate up to five likely foundational exam questions, without claiming access to actual exam papers.'].join(' ') },
      ]
    }), signal: AbortSignal.timeout(60_000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload?.error?.message || ('Provider request failed (' + response.status + ').')), { status: response.status === 429 ? 429 : 502 });
  const content = payload?.choices?.[0]?.message?.content;
  try {
    const result = JSON.parse(content);
    if (!Array.isArray(result.answers) || !result.answers.length) throw new Error('empty');
    result.answers = result.answers.slice(0, 12).map(answer => ({
      question: String(answer.question || '').slice(0, 1200), definition: String(answer.definition || '').slice(0, 2200),
      explanation: String(answer.explanation || '').slice(0, 3500), keyPoints: (Array.isArray(answer.keyPoints) ? answer.keyPoints : []).slice(0, 8).map(String),
      conclusion: String(answer.conclusion || '').slice(0, 1200), keywords: (Array.isArray(answer.keywords) ? answer.keywords : []).slice(0, 10).map(String)
    }));
    return result;
  } catch { throw Object.assign(new Error('Could not prepare the answers. Please try again.'), { status: 502 }); }
}
