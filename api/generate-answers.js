import { generateAnswers } from '../lib/groq.js';
import { countExamQuestions } from '../lib/format.js';

export const config = { maxDuration: 60 };

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') return response.status(405).json({ error: 'Use POST to generate answers.' });
  const { questions, mode } = request.body || {};
  if (typeof questions !== 'string' || !questions.trim()) return response.status(400).json({ error: 'Paste your questions or upload a PDF to get started.' });
  if (questions.length > 16_000) return response.status(413).json({ error: 'Keep the questions under 16,000 characters.' });
  const questionCount = countExamQuestions(questions);
  if (questionCount > 5) return response.status(400).json({ error: 'Please send up to 5 questions at a time for better answers.' });
  if (!['5', '10'].includes(String(mode))) return response.status(400).json({ error: 'Choose 5 Marks or 10 Marks.' });
  try { return response.status(200).json(await generateAnswers({ questions: questions.trim(), mode })); }
  catch (error) {
    console.error('[generate-answers]', error.message);
    const status = error.status || 500;
    const message = status === 429 ? 'The answer generator is busy right now. Try again in a minute.' : status >= 500 ? 'Could not prepare answers just now. Try again in a bit.' : error.message;
    return response.status(status).json({ error: message || 'Something went wrong. Try again.' });
  }
}
