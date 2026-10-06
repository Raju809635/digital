const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function getVideoId(value) {
  let url;
  try { url = new URL(value); } catch { throw Object.assign(new Error('Paste a valid YouTube video link.'), { status: 400 }); }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  let id = '';
  if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] || '';
  else if (['youtube.com', 'm.youtube.com'].includes(host)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
    else if (/^\/(?:shorts|embed|live)\//.test(url.pathname)) id = url.pathname.split('/')[2] || '';
  }
  if (!VIDEO_ID.test(id)) throw Object.assign(new Error('Use a YouTube video link, such as youtube.com/watch?v=…'), { status: 400 });
  return id;
}

function balancedJson(source, start) {
  const first = source.indexOf('{', start);
  if (first < 0) return null;
  let depth = 0; let quoted = false; let escaped = false;
  for (let i = first; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return source.slice(first, i + 1);
  }
  return null;
}

function decodeEntities(value) {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

function captionText(payload) {
  try {
    const json = JSON.parse(payload);
    const lines = (json.events || []).flatMap(event => (event.segs || []).map(segment => segment.utf8 || '')).join(' ');
    if (lines.trim()) return lines.replace(/\s+/g, ' ').trim();
  } catch { /* Some caption tracks return XML even when JSON was requested. */ }
  return [...payload.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)]
    .map(match => decodeEntities(match[1].replace(/<[^>]*>/g, ' '))).join(' ').replace(/\s+/g, ' ').trim();
}

export async function getYouTubeTranscript(value) {
  const id = getVideoId(value);
  const watch = await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; DigitalOrbit/1.0)', 'accept-language': 'en-US,en;q=0.8' },
    signal: AbortSignal.timeout(8_000)
  });
  if (!watch.ok) throw Object.assign(new Error('Could not open that video. Check the link and try a public video.'), { status: 422 });
  const html = await watch.text();
  const marker = html.indexOf('ytInitialPlayerResponse');
  const playerText = marker >= 0 ? balancedJson(html, marker + 'ytInitialPlayerResponse'.length) : null;
  let player;
  try { player = JSON.parse(playerText || 'null'); } catch { player = null; }
  const video = player?.videoDetails;
  if (!video?.title) throw Object.assign(new Error('This video could not be read. It may be private, age-restricted, or unavailable.'), { status: 422 });
  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  const track = tracks.find(item => item.languageCode === 'en' && !item.kind)
    || tracks.find(item => item.languageCode?.startsWith('en'))
    || tracks.find(item => !item.kind) || tracks[0];
  if (!track?.baseUrl) throw Object.assign(new Error('This video has no captions Digital Orbit can read. Try a public video with captions, or paste the transcript into the questions box.'), { status: 422 });
  const captionUrl = new URL(track.baseUrl);
  if (captionUrl.protocol !== 'https:' || !/(^|\.)youtube\.com$/i.test(captionUrl.hostname)) {
    throw Object.assign(new Error('YouTube did not provide a readable caption link for this video.'), { status: 422 });
  }
  captionUrl.searchParams.set('fmt', 'json3');
  const response = await fetch(captionUrl, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; DigitalOrbit/1.0)' }, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw Object.assign(new Error('Could not read this video’s captions. Try a different public video with captions.'), { status: 422 });
  const transcript = captionText(await response.text());
  if (transcript.length < 80) throw Object.assign(new Error('The video transcript is unavailable or too short to make useful notes.'), { status: 422 });
  return { title: String(video.title).slice(0, 180), transcript: transcript.slice(0, 13_500), truncated: transcript.length > 13_500 };
}
