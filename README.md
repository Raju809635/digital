# Digital Orbit – Night Mode

Digital Orbit is a one-page exam answer generator. Students paste questions or upload a text-based PDF, choose Pass Mode or Score Mode, then review structured answers and download notebook-style PDFs.

## Run locally

1. Copy `.env.example` to `.env`.
2. Set `GROQ_API_KEY` in `.env`. Keep the file private; `.env` is ignored by Git.
3. Run `npm install` once, then `npm run dev`.
4. Open `http://127.0.0.1:5173`.

The Node server keeps the provider key on the server and serves `/api/generate-answers`. The default model is `openai/gpt-oss-120b`; set `GROQ_MODEL` to another model available to your Groq API account if needed.

## Deploy to Vercel

Import the repository in Vercel using the Vite preset, build command `npm run build`, and output directory `dist` (also set in `vercel.json`). Add the server-side secret as `GROQ_API_KEY`. Existing deployments may continue using `XAI_API_KEY`; both names are accepted by the backend. Optionally set `GROQ_MODEL`. The `/api` directory contains the Vercel serverless API routes.

## Notes

- PDF upload extracts selectable text in the browser. Scanned image-only PDFs are not OCR processed.
- The handwritten-style answer PDF is rendered from a notebook-like HTML sheet. The 1-page revision export condenses each answer to keywords.
- Browser speech synthesis reads answers aloud inline; it does not create an audio file.
- Student users do not need or receive the provider key.
