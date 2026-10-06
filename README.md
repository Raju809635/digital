# Digital Orbit

Digital Orbit is a one-page exam-answer helper. Paste up to five questions or upload a selectable-text PDF, choose 5 Marks or 10 Marks, then review and download exam-style answers.

## Run locally

1. Copy `.env.example` to `.env`.
2. Set `GROQ_API_KEY` in `.env`. Keep the file private; `.env` is ignored by Git.
3. Run `npm install` once, then `npm run dev`.
4. Open `http://127.0.0.1:5173`.

The Node server keeps the provider key on the server and serves `/api/generate-answers` and `/api/generate-pdf`. The default model is `openai/gpt-oss-120b`; set `GROQ_MODEL` to another model available to your Groq API account if needed.

## Deploy to Vercel

Import the repository in Vercel using the Vite preset, build command `npm run build`, and output directory `dist` (also set in `vercel.json`). Add the server-side secret as `GROQ_API_KEY`. Existing deployments may continue using `XAI_API_KEY`; both names are accepted by the backend. Optionally set `GROQ_MODEL`. The `/api` directory contains the Vercel serverless API routes.

## Notes

- PDF upload extracts selectable text in the browser and keeps line order using page positions. Scanned image-only PDFs are not OCR processed.
- Sessions are capped at five questions. The backend enforces the same limit.
- 5 Marks produces a focused response; 10 Marks asks for roughly 450-650 words when the question warrants a detailed answer.
- Math questions use plain-text formulas and a worked-solution layout.
- `generatePdf.mjs` exports full answers or a one-page revision PDF, using notebook-style layout and the Kalam fonts under `fonts/`.
- Student users do not need or receive the provider key.
