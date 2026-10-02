import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dev = process.argv.includes('--dev');

async function loadEnv() {
  try {
    const raw = await readFile(join(root, '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (match && !match[1].startsWith('#') && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function send(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function bodyJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20_000) throw Object.assign(new Error('Request is too large.'), { status: 413 });
  }
  try { return JSON.parse(raw || '{}'); }
  catch { throw Object.assign(new Error('Send valid JSON.'), { status: 400 }); }
}

const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    subject: { type: 'string' },
    topics: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, likelihood: { type: 'integer' }, reason: { type: 'string' } }, required: ['name', 'likelihood', 'reason'] } },
    studyOrder: { type: 'string' },
    answers: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { question: { type: 'string' }, intro: { type: 'string' }, points: { type: 'array', items: { type: 'string' } }, tip: { type: 'string' }, marks: { type: 'integer' } }, required: ['question', 'intro', 'points', 'tip', 'marks'] } },
    quiz: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { question: { type: 'string' }, expected: { type: 'string' }, feedback: { type: 'string' } }, required: ['question', 'expected', 'feedback'] } },
    memory: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { label: { type: 'string' }, title: { type: 'string' }, note: { type: 'string' } }, required: ['label', 'title', 'note'] } },
    confidence: { type: 'integer' },
    weakArea: { type: 'string' },
    audioSummary: { type: 'string' },
    panicPlan: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { title: { type: 'string' }, note: { type: 'string' }, minutes: { type: 'integer' } }, required: ['title', 'note', 'minutes'] } }
  },
  required: ['subject', 'topics', 'studyOrder', 'answers', 'quiz', 'memory', 'confidence', 'weakArea', 'audioSummary', 'panicPlan']
};

async function generateStudyPlan(input) {
  const apiKey = process.env.GROQ_API_KEY || process.env.XAI_API_KEY;
  if (!apiKey) throw Object.assign(new Error('Add the Groq key to your .env file, then restart the app.'), { status: 503 });
  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      response_format: { type: 'json_schema', json_schema: { name: 'night_study_plan', strict: true, schema } },
      messages: [
        { role: 'system', content: 'You are a practical exam-cram tutor. Make a useful, accurate, concise study plan from the provided subject or question. Do not claim access to previous papers or verified exam frequency. Topic likelihood numbers are rough study-priority estimates only; explain that briefly in each reason. Answers should be structured for scoring: definition, points, key terms and one write-this-for-marks hint. Keep language student-friendly. Ensure quiz expected answers are short and checkable. Build a realistic panic plan totaling about 120 minutes. Do not invent syllabus-specific certainty when the course is unknown.' },
        { role: 'user', content: JSON.stringify({ subjectOrQuestion: input.topic, goal: input.goal, requestedStyle: 'JNTU-style short, structured exam answers; student has limited time tonight' }) }
      ]
    }),
    signal: AbortSignal.timeout(60_000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result?.error?.message || `Groq API request failed (${response.status}).`;
    const status = response.status === 401 ? 502 : response.status === 429 ? 429 : 502;
    throw Object.assign(new Error(message), { status });
  }
  const content = result?.choices?.[0]?.message?.content;
  if (!content) throw Object.assign(new Error('The model returned an empty answer. Try again.'), { status: 502 });
  try { return JSON.parse(content); }
  catch { throw Object.assign(new Error('Could not read the model response. Try again.'), { status: 502 }); }
}

async function evaluateAnswer(input) {
  const apiKey = process.env.GROQ_API_KEY || process.env.XAI_API_KEY;
  if (!apiKey) throw Object.assign(new Error('Add the Groq key to your .env file, then restart the app.'), { status: 503 });
  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0, response_format: { type: 'json_schema', json_schema: { name: 'answer_feedback', strict: true, schema: { type: 'object', additionalProperties: false, properties: { correct: { type: 'boolean' }, feedback: { type: 'string' } }, required: ['correct', 'feedback'] } } }, messages: [
      { role: 'system', content: 'Check a students short exam answer against the key. Accept accurate equivalent wording and partial credit. Be kind and brief. Point out one missing scoring keyword if needed.' },
      { role: 'user', content: JSON.stringify(input) }
    ] }), signal: AbortSignal.timeout(30_000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result?.error?.message || `Groq API request failed (${response.status}).`), { status: response.status === 429 ? 429 : 502 });
  try { return JSON.parse(result.choices[0].message.content); }
  catch { throw Object.assign(new Error('Could not read the model feedback. Try again.'), { status: 502 }); }
}

await loadEnv();
const vite = dev ? await (async () => {
  const { createServer: createViteServer } = await import('vite');
  return createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
})() : null;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, configured: Boolean(process.env.GROQ_API_KEY || process.env.XAI_API_KEY) });
    if (req.method === 'POST' && url.pathname === '/api/study-plan') {
      try {
        const input = await bodyJson(req);
        if (typeof input.topic !== 'string' || !input.topic.trim()) return send(res, 400, { error: 'Enter a subject, topic, or question.' });
        if (input.topic.length > 2_000) return send(res, 400, { error: 'Keep the topic under 2,000 characters.' });
        const plan = await generateStudyPlan({ topic: input.topic.trim(), goal: ['pass', 'safe', 'topper'].includes(input.goal) ? input.goal : 'pass' });
        if (!Array.isArray(plan.topics) || !plan.topics.length || !Array.isArray(plan.answers) || !plan.answers.length || !Array.isArray(plan.quiz) || !plan.quiz.length) return send(res, 502, { error: 'The model returned an incomplete plan. Try again.' });
        plan.topics = plan.topics.slice(0, 5).map(item => ({ ...item, likelihood: Math.max(1, Math.min(99, Number(item.likelihood) || 50)) }));
        plan.answers = plan.answers.slice(0, 4).map(answer => ({ ...answer, points: (answer.points || []).slice(0, 8), marks: Math.max(2, Math.min(16, Number(answer.marks) || 5)) }));
        plan.quiz = plan.quiz.slice(0, 5); plan.memory = (plan.memory || []).slice(0, 4);
        plan.confidence = Math.max(20, Math.min(95, Number(plan.confidence) || 50));
        plan.panicPlan = (plan.panicPlan || []).slice(0, 5).map(item => ({ ...item, minutes: Math.max(5, Math.min(90, Number(item.minutes) || 20)) }));
        return send(res, 200, plan);
      } catch (error) {
        console.error('[study-plan]', error.message);
        const status = error.status || 500;
        const message = status === 429 ? 'Study mode is busy right now. Try again in a minute.' : status >= 500 ? 'Study mode is taking a quick breather. Try again in a bit.' : error.message;
        return send(res, status, { error: message || 'Something went wrong. Try again.' });
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/check-answer') {
      try {
        const input = await bodyJson(req);
        for (const key of ['question', 'expected', 'answer']) if (typeof input[key] !== 'string' || !input[key].trim()) return send(res, 400, { error: `Missing ${key}.` });
        return send(res, 200, await evaluateAnswer({ question: input.question.slice(0, 1000), expected: input.expected.slice(0, 1000), answer: input.answer.slice(0, 1000) }));
      } catch (error) {
        console.error('[check-answer]', error.message);
        const status = error.status || 500;
        const message = status === 429 ? 'The quick check is busy right now. Try again in a minute.' : status >= 500 ? 'The quick check is taking a breather. Try again in a bit.' : error.message;
        return send(res, status, { error: message || 'Could not check that answer.' });
      }
    }
    return send(res, 404, { error: 'API route not found.' });
  }

  if (dev) {
    vite.middlewares(req, res, () => {});
    return;
  }

  const requested = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\]|\.\.(?:[/\\]|$))+/, '');
  let path = join(root, 'dist', requested || 'index.html');
  try { if (!(await stat(path)).isFile()) path = join(root, 'dist', 'index.html'); }
  catch { path = join(root, 'dist', 'index.html'); }
  try {
    const data = await readFile(path);
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404); res.end('Build the app first with npm run build.'); }
});

const port = Number(process.env.PORT || 5173);
server.listen(port, '127.0.0.1', () => console.log(`Digital Orbit ${dev ? 'dev' : 'server'} listening at http://127.0.0.1:${port}`));
