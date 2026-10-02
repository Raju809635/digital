# Digital Orbit — Night Mode

## Run locally

1. Copy `.env.example` to `.env`.
2. Add your Groq key to `GROQ_API_KEY` in `.env`. Keep the file private; it is ignored by Git.
3. Run `npm install` once, then `npm run dev`.
4. Open `http://127.0.0.1:5173`.

The Node server keeps the Groq key server-side and exposes `/api/study-plan` and `/api/check-answer`. It uses `openai/gpt-oss-120b` by default; set `GROQ_MODEL` in `.env` to use another model available to your Groq API key. Requests incur usage on the API account attached to that key.

For production, run `npm run build` followed by `npm start`.

## Deploy to Vercel

Import this repository in Vercel with the Vite preset, build command `npm run build`, and output directory `dist` (also set in `vercel.json`). Add the Groq API secret as `GROQ_API_KEY` under Environment Variables. For an existing deployment, `XAI_API_KEY` is also accepted as a variable name; both names stay server-side. Optionally set `GROQ_MODEL`; it defaults to `openai/gpt-oss-120b`. The `/api` directory contains the serverless functions used by the deployed frontend.
