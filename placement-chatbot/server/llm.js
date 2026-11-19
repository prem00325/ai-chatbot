// Optional: answer open-ended placement questions with Claude when ANTHROPIC_API_KEY is set.
// Without a key the chatbot works fully offline on its rule-based logic.
// Requires Node 18+ (global fetch). Never expose the key to the browser; this runs on the server only.

const SYSTEM = [
  'You are a placement-preparation assistant inside a college Placement Portal.',
  'Only help with placement topics: aptitude, coding/technical interviews, HR rounds, resumes, careers and job search.',
  'If asked about anything else, politely steer back to placement prep.',
  'Be concise (under 150 words), practical and encouraging. Use plain text, no markdown tables.',
].join(' ');

function createLlmFallback({ apiKey = process.env.ANTHROPIC_API_KEY, model = process.env.CHATBOT_LLM_MODEL || 'claude-haiku-5-5' } = {}) {
  if (!apiKey) return null;
  return async function llmFallback(message) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 400, system: SYSTEM, messages: [{ role: 'user', content: message }] }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const data = await res.json();
    return data.content?.find((b) => b.type === 'text')?.text?.trim() || null;
  };
}

module.exports = { createLlmFallback };
