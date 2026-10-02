const planSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    subject: { type: 'string' },
    topics: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, likelihood: { type: 'integer' }, reason: { type: 'string' } }, required: ['name', 'likelihood', 'reason'] } },
    studyOrder: { type: 'string' },
    answers: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { question: { type: 'string' }, intro: { type: 'string' }, points: { type: 'array', items: { type: 'string' } }, tip: { type: 'string' }, marks: { type: 'integer' } }, required: ['question', 'intro', 'points', 'tip', 'marks'] } },
    quiz: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { question: { type: 'string' }, expected: { type: 'string' }, feedback: { type: 'string' } }, required: ['question', 'expected', 'feedback'] } },
    memory: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { label: { type: 'string' }, title: { type: 'string' }, note: { type: 'string' } }, required: ['label', 'title', 'note'] } },
    confidence: { type: 'integer' }, weakArea: { type: 'string' }, audioSummary: { type: 'string' },
    panicPlan: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { title: { type: 'string' }, note: { type: 'string' }, minutes: { type: 'integer' } }, required: ['title', 'note', 'minutes'] } }
  },
  required: ['subject', 'topics', 'studyOrder', 'answers', 'quiz', 'memory', 'confidence', 'weakArea', 'audioSummary', 'panicPlan']
};

const feedbackSchema = {
  type: 'object', additionalProperties: false,
  properties: { correct: { type: 'boolean' }, feedback: { type: 'string' } },
  required: ['correct', 'feedback']
};

async function requestJson({ name, schema, messages, temperature = 0.2, timeout = 45_000 }) {
  const apiKey = process.env.GROQ_API_KEY || process.env.XAI_API_KEY;
  if (!apiKey) throw Object.assign(new Error('Set GROQ_API_KEY in the project environment variables.'), { status: 503 });
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b', temperature,
      response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } }, messages
    }),
    signal: AbortSignal.timeout(timeout)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const status = response.status === 429 ? 429 : 502;
    throw Object.assign(new Error(payload?.error?.message || `Groq API request failed (${response.status}).`), { status });
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw Object.assign(new Error('The model returned an empty answer. Try again.'), { status: 502 });
  try { return JSON.parse(content); }
  catch { throw Object.assign(new Error('Could not read the model response. Try again.'), { status: 502 }); }
}

export async function generateStudyPlan({ topic, goal }) {
  const plan = await requestJson({
    name: 'night_study_plan', schema: planSchema, temperature: 0.35,
    messages: [
      { role: 'system', content: 'You are a practical exam-cram tutor. Make a useful, accurate, concise study plan from the provided subject or question. Do not claim access to previous papers or verified exam frequency. Topic likelihood numbers are rough study-priority estimates only; explain that briefly in each reason. Answers should be structured for scoring: definition, points, key terms and one write-this-for-marks hint. Keep language student-friendly. Ensure quiz expected answers are short and checkable. Build a realistic panic plan totaling about 120 minutes. Do not invent syllabus-specific certainty when the course is unknown.' },
      { role: 'user', content: JSON.stringify({ subjectOrQuestion: topic, goal, requestedStyle: 'JNTU-style short, structured exam answers; student has limited time tonight' }) }
    ]
  });
  if (!Array.isArray(plan.topics) || !plan.topics.length || !Array.isArray(plan.answers) || !plan.answers.length || !Array.isArray(plan.quiz) || !plan.quiz.length) throw Object.assign(new Error('The model returned an incomplete plan. Try again.'), { status: 502 });
  plan.topics = plan.topics.slice(0, 5).map(item => ({ ...item, likelihood: Math.max(1, Math.min(99, Number(item.likelihood) || 50)) }));
  plan.answers = plan.answers.slice(0, 4).map(answer => ({ ...answer, points: (answer.points || []).slice(0, 8), marks: Math.max(2, Math.min(16, Number(answer.marks) || 5)) }));
  plan.quiz = plan.quiz.slice(0, 5); plan.memory = (plan.memory || []).slice(0, 4);
  plan.confidence = Math.max(20, Math.min(95, Number(plan.confidence) || 50));
  plan.panicPlan = (plan.panicPlan || []).slice(0, 5).map(item => ({ ...item, minutes: Math.max(5, Math.min(90, Number(item.minutes) || 20)) }));
  return plan;
}

export function evaluateAnswer(input) {
  return requestJson({
    name: 'answer_feedback', schema: feedbackSchema, temperature: 0, timeout: 30_000,
    messages: [
      { role: 'system', content: 'Check a students short exam answer against the key. Accept accurate equivalent wording and partial credit. Be kind and brief. Point out one missing scoring keyword if needed.' },
      { role: 'user', content: JSON.stringify(input) }
    ]
  });
}
