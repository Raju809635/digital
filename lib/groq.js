const answerSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    subject: { type: 'string' },
    answers: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: {
        question: { type: 'string' }, definition: { type: 'string' }, explanation: { type: 'string' }, diagram: { type: 'string' },
        keyPoints: { type: 'array', items: { type: 'string' } },
        conclusion: { type: 'string' }, keywords: { type: 'array', items: { type: 'string' } }
      }, required: ['question', 'definition', 'explanation', 'diagram', 'keyPoints', 'conclusion', 'keywords']
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
        { role: 'system', content: ['You are an expert JNTU exam answer writer. Answer only the exact questions provided in the user message. Do not substitute questions, switch subjects, or add unrelated topics. Preserve each question wording and order in the output. Use facts relevant to the question’s stated subject; if a question is ambiguous, say so briefly in the answer instead of guessing.', 'Write like a student in an exam with these sections: Definition, Explanation, Key Points, Conclusion. Keep it focused on marks and avoid unnecessary theory. List scoring terms in keywords.', 'Use plain ASCII punctuation in all answers: regular spaces and hyphens only; avoid non-breaking spaces, special hyphens, zero-width characters, and decorative bullets. For math write beta_0, beta_1, x_mean, SUM, <=, >=, and ^2 instead of Greek letters, combining marks, or specialist math symbols.', 'For diagram, give a short hand-draw instruction in square brackets when a diagram would help (for example, [Draw circular wait between P1 to P2 to P1]); otherwise write Not needed. Never generate an image.', mode === 'pass' ? 'Pass Mode: short, direct answers with 3 to 4 concise key points.' : 'Score Mode: detailed answers with 5 to 7 useful key points.', 'Return one answer per supplied question and no extras. Only when the user message clearly contains a subject/topic but no questions, generate up to five foundational questions for that subject.'].join(' ') },
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
    result.answers = result.answers.slice(0, 12).map(answer => ({
      question: String(answer.question || '').slice(0, 1200), definition: String(answer.definition || '').slice(0, 2200), diagram: String(answer.diagram || 'Not needed').slice(0, 500),
      explanation: String(answer.explanation || '').slice(0, 3500), keyPoints: (Array.isArray(answer.keyPoints) ? answer.keyPoints : []).slice(0, 8).map(String),
      conclusion: String(answer.conclusion || '').slice(0, 1200), keywords: (Array.isArray(answer.keywords) ? answer.keywords : []).slice(0, 10).map(String)
    }));
    return result;
  } catch { throw Object.assign(new Error('Could not prepare the answers. Please try again.'), { status: 502 }); }
}
