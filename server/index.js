import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateAnswers } from '../lib/groq.js';
import generatePDF from '../generatePdf.mjs';
import { countExamQuestions } from '../lib/format.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const dev = process.argv.includes('--dev');

async function loadEnv() {
  try {
    const raw = await readFile(join(root, '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (match && !match[1].startsWith('#') && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
function send(res, status, payload) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(payload)); }
async function bodyJson(req, maxSize = 24_000) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > maxSize) throw Object.assign(new Error('Request is too large.'), { status: 413 }); }
  try { return JSON.parse(raw || '{}'); } catch { throw Object.assign(new Error('Send valid JSON.'), { status: 400 }); }
}

await loadEnv();
const vite = dev ? await (async () => { const { createServer: createViteServer } = await import('vite'); return createViteServer({ server: { middlewareMode: true }, appType: 'spa' }); })() : null;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true });
    if (req.method === 'POST' && url.pathname === '/api/generate-pdf') {
      try {
        const input = await bodyJson(req, 250_000);
        if (!Array.isArray(input.answers) || !input.answers.length) return send(res, 400, { error: 'There are no answers to download.' });
        if (input.answers.length > 5) return send(res, 400, { error: 'Download up to 5 answers at a time.' });
        const pdf = await generatePDF({ title: input.title || input.subject || 'Exam Answer Notes', answers: input.answers }, undefined, { revision: Boolean(input.revision) });
        const filename = input.revision ? 'digital-orbit-revision.pdf' : 'digital-orbit-handwritten-answers.pdf';
        res.writeHead(200, { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${filename}"`, 'content-length': pdf.length, 'cache-control': 'no-store' });
        return res.end(pdf);
      } catch (error) {
        console.error('[generate-pdf]', error.message);
        const status = error.status || 500;
        return send(res, status, { error: status === 413 ? error.message : 'Could not create the PDF. Please try again.' });
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/generate-answers') {
      try {
        const input = await bodyJson(req);
        if (typeof input.questions !== 'string' || !input.questions.trim()) return send(res, 400, { error: 'Paste your questions or upload a PDF to get started.' });
        if (input.questions.length > 16_000) return send(res, 413, { error: 'Keep the questions under 16,000 characters.' });
        if (countExamQuestions(input.questions) > 5) return send(res, 400, { error: 'Please send up to 5 questions at a time for better answers.' });
        if (!['5', '10'].includes(String(input.mode))) return send(res, 400, { error: 'Choose 5 Marks or 10 Marks.' });
        const result = await generateAnswers({ questions: input.questions.trim(), mode: input.mode });
        return send(res, 200, result);
      } catch (error) {
        console.error('[generate-answers]', error.message);
        const status = error.status || 500;
        const message = status === 429 ? 'The answer generator is busy right now. Try again in a minute.' : status >= 500 ? 'Could not prepare answers just now. Try again in a bit.' : error.message;
        return send(res, status, { error: message || 'Something went wrong. Try again.' });
      }
    }
    return send(res, 404, { error: 'API route not found.' });
  }
  if (dev) { vite.middlewares(req, res, () => {}); return; }
  const requested = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\]|\.\.(?:[/\\]|$))+/, '');
  let path = join(root, 'dist', requested || 'index.html');
  try { if (!(await stat(path)).isFile()) path = join(root, 'dist', 'index.html'); } catch { path = join(root, 'dist', 'index.html'); }
  try {
    const data = await readFile(path);
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404); res.end('Build the app first with npm run build.'); }
});
const port = Number(process.env.PORT || 5173);
server.listen(port, '127.0.0.1', () => console.log(`Digital Orbit ${dev ? 'dev' : 'server'} listening at http://127.0.0.1:${port}`));
