# Digital Orbit — Night Mode

## Run locally

1. Copy `.env.example` to `.env`.
2. Add your xAI key to `XAI_API_KEY` in `.env`. Keep the file private; it is ignored by Git.
3. Run `npm install` once, then `npm run dev`.
4. Open `http://127.0.0.1:5173`.

The Node server keeps the xAI key server-side and exposes `/api/study-plan` and `/api/check-answer`. It uses `grok-4.7` by default; set `XAI_MODEL` in `.env` to use another model available to your xAI API key. Requests incur usage on the API account attached to that key.

For production, run `npm run build` followed by `npm start`.

## Deploy to Vercel

Import this repository in Vercel with the Vite preset, build command `npm run build`, and output directory `dist` (also set in `vercel.json`). Add `XAI_API_KEY` under Environment Variables before deploying. Optionally set `XAI_MODEL`; it defaults to `grok-4.7`. The `/api` directory contains the serverless functions used by the deployed frontend.
