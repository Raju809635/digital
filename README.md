# Digital Orbit — Night Mode

## Run locally

1. Copy `.env.example` to `.env`.
2. Add your key to `OPENAI_API_KEY` in `.env`. Keep the file private; it is ignored by Git.
3. Run `npm install` once, then `npm run dev`.
4. Open `http://127.0.0.1:5173`.

The Node server keeps the OpenAI key server-side and exposes `/api/study-plan` and `/api/check-answer`. The app uses `gpt-4.1-mini` by default; set `OPENAI_MODEL` in `.env` to use a different compatible OpenAI model. Requests incur usage on the API account attached to that key.

For production, run `npm run build` followed by `npm start`.
