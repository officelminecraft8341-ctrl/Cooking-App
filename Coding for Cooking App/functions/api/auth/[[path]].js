import { jsonResponse, preflightResponse, rateLimit, readJson, signUpUser, loginUser, userForToken, deleteAccount, createSession, httpError } from '../../lib/backend.js';

// Routes: POST /api/auth/signup | /api/auth/login | /api/auth/logout,
//         GET  /api/auth/me, DELETE /api/auth/account
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflightResponse(request, env);

  const url = new URL(request.url);
  const action = url.pathname.replace(/\/api\/auth\/?/, '').replace(/\/$/, '');

  try {
    if (!env.CHEFAI_KV) return jsonResponse({ error: 'Storage is not configured (missing KV binding CHEFAI_KV)' }, { status: 500, request, env });

    const ip = request.headers.get('cf-connecting-ip') || 'unknown';

    if (request.method === 'POST' && action === 'signup') {
      if (!rateLimit(request, { windowMs: 15 * 60_000, max: 10, ip })) return jsonResponse({ error: 'Too many attempts. Try again later.' }, { status: 429, request, env });
      const body = await readJson(request, { maxBytes: 10_000 });
      const user = await signUpUser(env.CHEFAI_KV, body);
      const token = await createSession(env.CHEFAI_KV, user.email);
      return jsonResponse({ token, user }, { status: 201, request, env });
    }

    if (request.method === 'POST' && action === 'login') {
      if (!rateLimit(request, { windowMs: 15 * 60_000, max: 10, ip })) return jsonResponse({ error: 'Too many attempts. Try again later.' }, { status: 429, request, env });
      const body = await readJson(request, { maxBytes: 10_000 });
      const result = await loginUser(env.CHEFAI_KV, body);
      return jsonResponse(result, { request, env });
    }

    if (request.method === 'POST' && action === 'logout') {
      const header = request.headers.get('authorization') || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      if (token) await env.CHEFAI_KV.delete(`session:${token.slice(0, 8)}:${await shaHexPublic(token)}`);
      return jsonResponse({ success: true }, { request, env });
    }

    if (request.method === 'GET' && action === 'me') {
      const user = await userForToken(request, env.CHEFAI_KV);
      if (!user) return jsonResponse({ error: 'Not signed in' }, { status: 401, request, env });
      return jsonResponse({ user: { email: user.email, name: user.name, createdAt: user.createdAt } }, { request, env });
    }

    if (request.method === 'DELETE' && action === 'account') {
      const user = await userForToken(request, env.CHEFAI_KV);
      if (!user) return jsonResponse({ error: 'Not signed in' }, { status: 401, request, env });
      await deleteAccount(env.CHEFAI_KV, user);
      return jsonResponse({ success: true, deleted: user.email }, { request, env });
    }

    return jsonResponse({ error: 'Not found' }, { status: 404, request, env });
  } catch (error) {
    const status = error.status || 500;
    return jsonResponse({ error: status === 500 ? 'Auth request failed' : error.message }, { status, request, env });
  }
}

async function shaHexPublic(text) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}
