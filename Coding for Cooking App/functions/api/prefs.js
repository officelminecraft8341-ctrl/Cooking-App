import {
  jsonResponse,
  preflightResponse,
  readJson,
  userForToken,
  getPrefs,
  updatePrefs,
} from '../lib/backend.js';

// GET /api/prefs → the caller's synced preferences ({} when none yet)
// PUT /api/prefs { appearance?, accessibility?, consent? } → merged prefs
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflightResponse(request, env);

  try {
    if (!env.CHEFAI_KV) return jsonResponse({ error: 'Storage is not configured (missing KV binding CHEFAI_KV)' }, { status: 500, request, env });
    const user = await userForToken(request, env.CHEFAI_KV);
    if (!user) return jsonResponse({ error: 'Sign in to sync preferences' }, { status: 401, request, env });

    if (request.method === 'GET') {
      return jsonResponse(await getPrefs(env.CHEFAI_KV, user.email), { request, env });
    }
    if (request.method === 'PUT') {
      const body = await readJson(request, { maxBytes: 40_000 });
      const prefs = await updatePrefs(env.CHEFAI_KV, user.email, body);
      return jsonResponse(prefs, { request, env });
    }
    return jsonResponse({ error: 'Method not allowed' }, { status: 405, request, env });
  } catch (error) {
    const status = error.status || 500;
    return jsonResponse({ error: status === 500 ? 'Preferences request failed' : error.message }, { status, request, env });
  }
}
