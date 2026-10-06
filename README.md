# Digital Orbit

Digital Orbit is a one-page exam-answer helper. Paste up to five questions or upload a selectable-text PDF, choose 5 Marks or 10 Marks, then review and download exam-style answers.

## Run locally

1. Copy `.env.example` to `.env`.
2. Set `GROQ_API_KEY` in `.env`. Keep the file private; `.env` is ignored by Git.
3. Run `npm install` once, then `npm run dev`.
4. Open `http://127.0.0.1:5173`.

The Node server keeps provider keys on the server and serves `/api/generate-answers` and `/api/generate-pdf`. Set `GROQ_API_KEY` to use Groq (`openai/gpt-oss-120b` by default), or `XAI_API_KEY` to use xAI (`grok-4.7` by default). Set `GROQ_MODEL` or `GROK_MODEL` to override the matching provider's default model. If an older deployment has a Groq `gsk_` key stored as `XAI_API_KEY`, the backend detects it and still routes to Groq.

## Deploy to Vercel

Import the repository in Vercel using the Vite preset, build command `npm run build`, and output directory `dist` (also set in `vercel.json`). Add the provider's server-side secret as `GROQ_API_KEY` or `XAI_API_KEY`. The name should match its provider; legacy Groq keys stored in `XAI_API_KEY` are also detected by their prefix. Optionally set `GROQ_MODEL` or `GROK_MODEL`. The `/api` directory contains the Vercel serverless API routes.

Set `VITE_GA_MEASUREMENT_ID` to your GA4 Measurement ID (format `G-XXXXXXXXXX`) in Vercel, then redeploy. Analytics records page views and basic product events such as answer generation, PDF uploads, and PDF downloads; it never sends question text. Tracking remains off if the ID is unset or the visitor has Do Not Track enabled.

The canonical site URL and sitemap use `https://digital-orbit.in/`. Submit `https://digital-orbit.in/sitemap.xml` in Google Search Console and request indexing after deployment; Google may take time to replace old search snippets.

## Notes

- PDF upload extracts selectable text in the browser and keeps line order using page positions. Scanned image-only PDFs are not OCR processed.
- Sessions are capped at five questions. The backend enforces the same limit.
- 5 Marks produces a focused response; 10 Marks asks for roughly 450-650 words when the question warrants a detailed answer.
- Math questions use plain-text formulas and a worked-solution layout.
- `generatePdf.mjs` exports full answers or a one-page revision PDF, using notebook-style layout and the Kalam fonts under `fonts/`.
- Student users do not need or receive the provider key.
