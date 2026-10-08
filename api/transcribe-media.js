import { del, get } from '@vercel/blob';
import { generateAnswers } from '../lib/groq.js';

export const config = { maxDuration: 60 };

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const EXTENSIONS = new Map([
  ['audio/flac', 'flac'], ['audio/x-flac', 'flac'], ['audio/mpeg', 'mp3'], ['audio/mp4', 'm4a'],
  ['audio/ogg', 'ogg'], ['audio/wav', 'wav'], ['audio/x-wav', 'wav'], ['audio/webm', 'webm'],
  ['video/mp4', 'mp4'], ['video/webm', 'webm'], ['video/mpeg', 'mpeg']
]);

async function transcribe(buffer, contentType, extension) {
  const apiKey = process.env.GROQ_STT_API_KEY || (/^gsk_/i.test(process.env.XAI_API_KEY || '') ? process.env.XAI_API_KEY : '');
  if (!apiKey) throw Object.assign(new Error('Speech transcription is not configured. Add GROQ_STT_API_KEY as a private Vercel environment variable.'), { status: 503 });
  const form = new FormData();
  form.set('file', new Blob([buffer], { type: contentType }), `lesson.${extension}`);
  form.set('model', process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo');
  form.set('response_format', 'json');
  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST', headers: { authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(25_000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `Speech transcription service returned ${response.status}.`;
    throw Object.assign(new Error(message), { status: response.status === 429 ? 429 : 502 });
  }
  const text = String(payload.text || '').trim();
  if (text.length < 40) throw Object.assign(new Error('There was not enough clear speech in this file to make study notes.'), { status: 422 });
  return text;
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') return response.status(405).json({ error: 'Use POST to transcribe lesson audio or video.' });
  const { pathname, mode } = request.body || {};
  if (typeof pathname !== 'string' || !pathname.startsWith('digital-orbit-media/')) return response.status(400).json({ error: 'Upload an audio or video file first.' });
  if (!['5', '10'].includes(String(mode))) return response.status(400).json({ error: 'Choose 5 Marks or 10 Marks.' });
  let shouldDelete = false;
  try {
    const stored = await get(pathname, { access: 'private' });
    if (!stored) return response.status(404).json({ error: 'That upload expired. Please choose the file again.' });
    if (stored.statusCode !== 200 || !stored.stream) return response.status(404).json({ error: 'That upload expired. Please choose the file again.' });
    shouldDelete = true;
    const contentType = String(stored.blob.contentType || '').toLowerCase().split(';')[0];
    const extension = EXTENSIONS.get(contentType);
    if (!extension) return response.status(415).json({ error: 'Use an MP3, M4A, WAV, OGG, FLAC, WebM, or MP4 file.' });
    if (!stored.blob.size || stored.blob.size > MAX_FILE_SIZE) return response.status(413).json({ error: 'Audio and video uploads must be 25 MB or smaller.' });
    const bytes = Buffer.from(await new Response(stored.stream).arrayBuffer());
    const transcript = await transcribe(bytes, contentType, extension);
    const maxChars = 13_500;
    const questions = `Create study notes from the speech in this uploaded audio or video. Use the transcript as the source.\n\nTranscript:\n${transcript.slice(0, maxChars)}`;
    const result = await generateAnswers({ questions, mode, notesFromVideo: true });
    return response.status(200).json({ ...result, source: 'media', truncated: transcript.length > maxChars });
  } catch (error) {
    console.error('[transcribe-media]', error.message);
    const status = error.status || (error.name === 'TimeoutError' ? 504 : 500);
    const message = status === 429 ? 'The transcription or answer service is busy. Try again in a minute.'
      : status === 503 ? error.message
        : status >= 500 ? 'Could not transcribe this file right now. Try again in a bit.' : error.message;
    return response.status(status).json({ error: message || 'Could not prepare notes from this file.' });
  } finally {
    if (shouldDelete) await del(pathname, { access: 'private' }).catch(error => console.error('[transcribe-media-delete]', error.message));
  }
}
