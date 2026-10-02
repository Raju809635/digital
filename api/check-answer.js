import { evaluateAnswer } from '../lib/openai.js';

export const config = { maxDuration: 35 };

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Use POST for this endpoint.' });
  const body = request.body || {};
  for (const key of ['question', 'expected', 'answer']) {
    if (typeof body[key] !== 'string' || !body[key].trim()) return response.status(400).json({ error: `Missing ${key}.` });
  }
  try {
    const result = await evaluateAnswer({ question: body.question.slice(0, 1000), expected: body.expected.slice(0, 1000), answer: body.answer.slice(0, 1000) });
    return response.status(200).json(result);
  } catch (error) {
    console.error('[check-answer]', error.message);
    return response.status(error.status || 500).json({ error: error.message || 'Could not check that answer.' });
  }
}
