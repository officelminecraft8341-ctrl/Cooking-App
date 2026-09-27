import { preflightResponse, rateLimit, jsonResponse } from '../../lib/backend.js';
import { handleGenerate } from '../../lib/ai.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflightResponse(request, env);
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, { status: 405, request, env });
  if (!rateLimit(request, { windowMs: 60_000, max: 20 })) {
    return jsonResponse({ error: 'Too many requests. Try again in a minute.' }, { status: 429, request, env });
  }
  try {
    return await handleGenerate({ request, env });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('generate failed:', error.message);
    return jsonResponse({ error: status === 500 ? 'AI request failed. Please try again.' : error.message }, { status, request, env });
  }
}
