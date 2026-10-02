import { generateStudyPlan } from '../lib/grok.js';

export const config = { maxDuration: 60 };

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Use POST for this endpoint.' });
  const body = request.body || {};
  if (typeof body.topic !== 'string' || !body.topic.trim()) return response.status(400).json({ error: 'Enter a subject, topic, or question.' });
  if (body.topic.length > 2_000) return response.status(400).json({ error: 'Keep the topic under 2,000 characters.' });
  try {
    const plan = await generateStudyPlan({ topic: body.topic.trim(), goal: ['pass', 'safe', 'topper'].includes(body.goal) ? body.goal : 'pass' });
    return response.status(200).json(plan);
  } catch (error) {
    console.error('[study-plan]', error.message);
    const status = error.status || 500;
    const message = status === 429 ? 'Study mode is busy right now. Try again in a minute.' : status >= 500 ? 'Study mode is taking a quick breather. Try again in a bit.' : error.message;
    return response.status(status).json({ error: message || 'Something went wrong. Try again.' });
  }
}
