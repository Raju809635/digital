import { handleUpload } from '@vercel/blob/client';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MEDIA_TYPES = [
  'audio/flac', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm',
  'audio/x-flac', 'audio/x-wav', 'video/mp4', 'video/webm', 'video/mpeg'
];

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') return response.status(405).json({ error: 'Use POST to upload an audio or video file.' });
  try {
    const result = await handleUpload({
      body: request.body,
      request,
      onBeforeGenerateToken: async pathname => {
        if (typeof pathname !== 'string' || !pathname.startsWith('digital-orbit-media/')) throw new Error('Invalid upload path.');
        return {
          allowedContentTypes: MEDIA_TYPES,
          maximumSizeInBytes: MAX_FILE_SIZE,
          addRandomSuffix: true,
          validUntil: Date.now() + 10 * 60 * 1000,
          tokenPayload: JSON.stringify({ purpose: 'temporary-media-transcription' })
        };
      }
    });
    return response.status(200).json(result);
  } catch (error) {
    console.error('[upload-media]', error.message);
    const message = /BLOB_READ_WRITE_TOKEN|BLOB_STORE_ID/i.test(error.message || '')
      ? 'Audio uploads are not configured yet. The site owner needs to connect a private Vercel Blob store.'
      : 'Could not prepare the secure upload. Please try again.';
    return response.status(400).json({ error: message });
  }
}
