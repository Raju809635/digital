import { generateAnswers } from '../lib/groq.js';
import { getYouTubeTranscript } from '../lib/youtube.js';

export const config = { maxDuration: 60 };

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') return response.status(405).json({ error: 'Use POST to create video notes.' });
  const { url, mode } = request.body || {};
  if (typeof url !== 'string' || !url.trim()) return response.status(400).json({ error: 'Paste a YouTube video link first.' });
  if (!['5', '10'].includes(String(mode))) return response.status(400).json({ error: 'Choose 5 Marks or 10 Marks.' });
  try {
    const video = await getYouTubeTranscript(url.trim());
    const questions = `Create study notes from this video transcript. Topic: ${video.title}\n\nTranscript:\n${video.transcript}`;
    const result = await generateAnswers({ questions, mode, notesFromVideo: true });
    return response.status(200).json({ ...result, source: 'youtube', truncated: video.truncated });
  } catch (error) {
    console.error('[youtube-notes]', error.message);
    const status = error.status || (error.name === 'TimeoutError' ? 504 : 500);
    const message = status === 429 ? 'The answer service is busy. Try again in a minute.'
      : status >= 500 ? 'Could not prepare notes from that video right now. Try again in a bit.' : error.message;
    return response.status(status).json({ error: message || 'Could not prepare notes from this video.' });
  }
}
