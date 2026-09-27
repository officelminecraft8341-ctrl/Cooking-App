import {
  jsonResponse,
  preflightResponse,
  rateLimit,
  readJson,
  signUpUser,
  loginUser,
  userForToken,
  deleteAccount,
  createSession,
  httpError,
  passwordProblems,
  isBreachedPassword,
  generateTotpSecret,
  verifyTotp,
  otpauthUri,
  generateBackupCodes,
  hashBackupCode,
  normalizeBackupCode,
  createChallenge,
  verifyChallenge,
  ensureCaptchaKey,
  makeCaptcha,
  verifyCaptcha,
  loginGuardCheck,
  loginGuardFail,
  loginGuardSuccess,
  redactEmail,
  getUserByEmail,
  putUser,
  verifyPassword,
  getUserByProvider,
  setUserProvider,
  removeUserProvider,
} from '../../lib/backend.js';
import {
  oauthConfig,
  providerConfigured,
  createState,
  verifyState,
  googleAuthUrl,
  appleAuthUrl,
  exchangeGoogle,
  exchangeApple,
} from '../../shared/oauthShared.js';

// Routes: POST /api/auth/signup | /api/auth/login | /api/auth/logout
//         POST /api/auth/2fa/setup|enable|disable, GET /api/auth/2fa/status
//         GET  /api/auth/me, DELETE /api/auth/account

const SESSION_COOKIE = 'chefai_session';
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE}; Secure`;
}
function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure`;
}
function cookieToken(request) {
  const cookie = request.headers.get('cookie') || '';
  const pair = cookie.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (pair) return decodeURIComponent(pair.slice(SESSION_COOKIE.length + 1));
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

// CSRF defense-in-depth: state-changing requests with an Origin header must
// match the site (SameSite=Strict cookie is the primary layer).
function originAllowed(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true; // non-browser client
  try {
    const originHost = new URL(origin).host;
    const host = request.headers.get('host') || new URL(request.url).host;
    return originHost === host;
  } catch {
    return false;
  }
}

function publicCaptcha(captcha) {
  // The answer never reaches the client — only id + question.
  return { id: captcha.id, question: captcha.question };
}

function logAuthEvent(event, details) {
  console.warn(`[auth] ${event}`, JSON.stringify(details));
}

// Per-account lockout, persisted in KV so it survives isolate churn.
async function kvLocked(kv, key) {
  const raw = await kv.get(`lock:${key}`);
  if (!raw) return 0;
  const parsed = JSON.parse(raw);
  return parsed.lockUntil > Date.now() ? Math.ceil((parsed.lockUntil - Date.now()) / 1000) : 0;
}
async function kvRecordFailure(kv, key, count, lockUntil) {
  const ttl = Math.max(Math.ceil((lockUntil ? lockUntil - Date.now() : 30 * 60_000) / 1000), 60);
  await kv.put(`lock:${key}`, JSON.stringify({ count, lockUntil }), { expirationTtl: Math.min(ttl, 3600) });
}
async function kvClearLock(kv, key) {
  await kv.delete(`lock:${key}`);
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflightResponse(request, env);
  if (!originAllowed(request)) {
    return jsonResponse({ error: 'Cross-origin request blocked' }, { status: 403, request, env });
  }

  const url = new URL(request.url);
  const action = url.pathname.replace(/\/api\/auth\/?/, '').replace(/\/$/, '');

  try {
    if (!env.CHEFAI_KV) return jsonResponse({ error: 'Storage is not configured (missing KV binding CHEFAI_KV)' }, { status: 500, request, env });

    const ip = request.headers.get('cf-connecting-ip') || 'unknown';

    if (request.method === 'POST' && action === 'signup') {
      if (!rateLimit(request, { windowMs: 15 * 60_000, max: 10, ip })) return jsonResponse({ error: 'Too many attempts. Try again later.' }, { status: 429, request, env });
      const body = await readJson(request, { maxBytes: 10_000 });
      // COPPA-style age gate: affirmative confirmation, 13+ only. Only the
      // confirmation boolean is stored.
      if (body.ageConfirmed !== true) throw httpError(400, 'Please confirm your age to continue');
      if (Number.isFinite(Number(body.ageYears)) && Number(body.ageYears) > 0 && Number(body.ageYears) < 13) {
        logAuthEvent('signup-age-block', {});
        throw httpError(403, 'ChefAI is only available for users 13 and older');
      }
      const problems = passwordProblems(body.password, { email: body.email });
      if (problems.length > 0) throw httpError(400, problems[0]);
      if (await isBreachedPassword(body.password)) {
        throw httpError(400, 'That password appears in known data breaches — please choose a unique one');
      }
      const user = await signUpUser(env.CHEFAI_KV, body);
      const token = await createSession(env.CHEFAI_KV, user.email);
      return jsonResponse({ user }, { status: 201, request, env, setCookie: sessionCookie(token) });
    }

    if (request.method === 'POST' && action === 'login') {
      if (!rateLimit(request, { windowMs: 15 * 60_000, max: 5, ip })) return jsonResponse({ error: 'Too many login attempts. Try again in 15 minutes.' }, { status: 429, request, env });
      const body = await readJson(request, { maxBytes: 10_000 });
      const email = String(body.email || '').trim().toLowerCase();
      const guardKey = `${email}|${ip}`;

      const kvLock = await kvLocked(env.CHEFAI_KV, guardKey);
      if (kvLock > 0) {
        logAuthEvent('login-locked', { account: redactEmail(email), retryAfter: kvLock });
        return jsonResponse({ error: `Too many failed attempts. Try again in ${kvLock}s.`, lockedFor: kvLock }, { status: 429, request, env });
      }
      const guard = loginGuardCheck(guardKey);
      if (guard.captchaRequired) {
        await ensureCaptchaKey(env.OPENAI_API_KEY || 'chefai-pepper');
        if (!(await verifyCaptcha(body.captchaId, body.captchaAnswer))) {
          return jsonResponse({ error: 'Please solve the captcha to continue', captcha: publicCaptcha(await makeCaptcha()), requiresCaptcha: true }, { status: 401, request, env });
        }
      }

      let result;
      try {
        result = await loginUser(env.CHEFAI_KV, { email, password: body.password, totp: body.totp, backupCode: body.backupCode, challenge: body.challenge });
      } catch (error) {
        if (error.status === 401) {
          const { count, lockedForMs } = loginGuardFail(guardKey);
          await kvRecordFailure(env.CHEFAI_KV, guardKey, count, lockedForMs ? Date.now() + lockedForMs : 0);
          logAuthEvent('login-failed', { account: redactEmail(email), attempt: count, lockedForMs });
          const failBody = { error: error.message };
          // A wrong 2FA code arrives here: keep the client inside the flow by
          // echoing the (still valid, 2-minute) challenge for a retry.
          if (body.challenge) {
            failBody.requiresChallenge = true;
            failBody.challenge = body.challenge;
          }
          if (count >= 3) {
            await ensureCaptchaKey(env.OPENAI_API_KEY || 'chefai-pepper');
            failBody.captcha = publicCaptcha(await makeCaptcha());
            failBody.requiresCaptcha = true;
          }
          if (lockedForMs) failBody.lockedFor = Math.ceil(lockedForMs / 1000);
          return jsonResponse(failBody, { status: 401, request, env });
        }
        throw error;
      }
      if (result.requiresChallenge) {
        logAuthEvent('login-challenge-issued', { account: redactEmail(email) });
        return jsonResponse(result.body, { status: 401, request, env });
      }
      loginGuardSuccess(guardKey);
      await kvClearLock(env.CHEFAI_KV, guardKey);
      return jsonResponse({ user: result.user }, { request, env, setCookie: sessionCookie(result.token) });
    }

    if (request.method === 'POST' && action === 'logout') {
      const token = cookieToken(request);
      if (token) await env.CHEFAI_KV.delete(`session:${token.slice(0, 8)}:${await shaHexPublic(token)}`);
      return jsonResponse({ success: true }, { request, env, setCookie: clearSessionCookie() });
    }

    if (request.method === 'GET' && action === 'me') {
      const user = await userForToken(request, env.CHEFAI_KV);
      if (!user) return jsonResponse({ error: 'Not signed in' }, { status: 401, request, env });
      return jsonResponse({ user: { email: user.email, name: user.name, createdAt: user.createdAt, twoFactorEnabled: Boolean(user.totp?.enabled) } }, { request, env });
    }

    if (request.method === 'POST' && action === '2fa/setup') {
      const user = await requireUser(request, env);
      if (user instanceof Response) return user;
      const secret = generateTotpSecret();
      user.totpPending = { secret, createdAt: Date.now() };
      await putUser(env.CHEFAI_KV, user);
      return jsonResponse({ secret, otpauth: otpauthUri({ secret, email: user.email }) }, { request, env });
    }

    if (request.method === 'POST' && action === '2fa/enable') {
      const user = await requireUser(request, env);
      if (user instanceof Response) return user;
      const { totp: code } = await readJson(request, { maxBytes: 2000 });
      const pending = user.totpPending;
      if (!pending || Date.now() - pending.createdAt > 10 * 60_000) {
        return jsonResponse({ error: 'No pending 2FA setup — start again' }, { status: 400, request, env });
      }
      if (!(await verifyTotp(pending.secret, code))) {
        return jsonResponse({ error: 'That code is not valid — check your authenticator app' }, { status: 400, request, env });
      }
      const plainCodes = generateBackupCodes(10);
      user.totp = { enabled: true, secret: pending.secret, backupCodes: await Promise.all(plainCodes.map((c) => hashBackupCode(c))) };
      delete user.totpPending;
      await putUser(env.CHEFAI_KV, user);
      logAuthEvent('2fa-enabled', { account: redactEmail(user.email) });
      return jsonResponse({ enabled: true, backupCodes: plainCodes }, { request, env });
    }

    if (request.method === 'POST' && action === '2fa/disable') {
      const user = await requireUser(request, env);
      if (user instanceof Response) return user;
      const { password } = await readJson(request, { maxBytes: 2000 });
      if (!user.totp?.enabled) return jsonResponse({ error: '2FA is not enabled' }, { status: 400, request, env });
      if (!(await verifyPassword(String(password || ''), user.passwordHash))) {
        logAuthEvent('2fa-disable-denied', { account: redactEmail(user.email) });
        return jsonResponse({ error: 'Password is required to turn off 2FA' }, { status: 401, request, env });
      }
      delete user.totp;
      delete user.totpPending;
      await putUser(env.CHEFAI_KV, user);
      logAuthEvent('2fa-disabled', { account: redactEmail(user.email) });
      return jsonResponse({ enabled: false }, { request, env });
    }

    if (request.method === 'GET' && action === '2fa/status') {
      const user = await requireUser(request, env);
      if (user instanceof Response) return user;
      return jsonResponse({ enabled: Boolean(user.totp?.enabled) }, { request, env });
    }

    if (request.method === 'DELETE' && action === 'account') {
      const user = await userForToken(request, env.CHEFAI_KV);
      if (!user) return jsonResponse({ error: 'Not signed in' }, { status: 401, request, env });
      await deleteAccount(env.CHEFAI_KV, user);
      return jsonResponse({ success: true, deleted: user.email }, { request, env, setCookie: clearSessionCookie() });
    }

    // ─── OAuth: Google + Apple sign-in / account linking ────────────────────
    if (action === 'oauth/status' && request.method === 'GET') {
      const cfg = oauthConfig(env);
      const user = await userForToken(request, env.CHEFAI_KV);
      return jsonResponse({
        providers: {
          google: providerConfigured(cfg, 'google'),
          apple: providerConfigured(cfg, 'apple'),
        },
        linked: user ? {
          google: Boolean(user.oauth?.google),
          apple: Boolean(user.oauth?.apple),
        } : null,
      }, { request, env });
    }

    if (action.startsWith('oauth/unlink') && request.method === 'POST') {
      const user = await userForToken(request, env.CHEFAI_KV);
      if (!user) return jsonResponse({ error: 'Not signed in' }, { status: 401, request, env });
      const body = await readJson(request, { maxBytes: 2000 });
      const provider = body.provider === 'google' || body.provider === 'apple' ? body.provider : null;
      if (!provider) return jsonResponse({ error: 'Unknown provider' }, { status: 400, request, env });
      if (!user.oauth?.[provider]) return jsonResponse({ error: 'That account is not connected' }, { status: 400, request, env });
      if (!user.passwordHash && Object.keys(user.oauth).length <= 1) {
        return jsonResponse({ error: 'Set a password before disconnecting your only sign-in method' }, { status: 400, request, env });
      }
      await removeUserProvider(env.CHEFAI_KV, user, provider);
      logAuthEvent('oauth-unlinked', { account: redactEmail(user.email), provider });
      return jsonResponse({ linked: { google: Boolean(user.oauth?.google), apple: Boolean(user.oauth?.apple) } }, { request, env });
    }

    const oauthMatch = action.match(/^oauth\/(google|apple)\/(start|callback)$/);
    if (oauthMatch) {
      const [, provider, phase] = oauthMatch;
      const cfg = oauthConfig(env);
      const pepper = env.OPENAI_API_KEY || 'chefai-oauth-pepper';
      // Provider redirects land here full-page; results go to the SPA hash
      // route, which notifies the opener window and closes itself.
      const oauthRedirect = (params) => {
        const query = new URLSearchParams(params).toString();
        return new Response(null, { status: 302, headers: { Location: `/oauth-result#${query}`, 'Cache-Control': 'no-store' } });
      };
      try {
        if (!providerConfigured(cfg, provider)) {
          return phase === 'start'
            ? jsonResponse({ error: `${provider} sign-in is not configured on this server` }, { status: 501, request, env })
            : oauthRedirect({ error: `${provider}_not_configured` });
        }
        if (phase === 'start') {
          const startUrl = new URL(request.url);
          const mode = startUrl.searchParams.get('mode') === 'link' ? 'link' : 'signin';
          if (mode === 'link') {
            const user = await userForToken(request, env.CHEFAI_KV);
            if (!user) return jsonResponse({ error: 'Sign in to connect an account' }, { status: 401, request, env });
            var linkingEmail = user.email;
          } else {
            var linkingEmail = '';
          }
          const stateValue = await createState(pepper, provider, mode, linkingEmail);
          const authUrl = provider === 'google' ? googleAuthUrl(cfg, stateValue) : appleAuthUrl(cfg, stateValue);
          return new Response(null, { status: 302, headers: { Location: authUrl, 'Cache-Control': 'no-store' } });
        }
        // Callback phase (GET redirect from provider, or POST for Apple's form post)
        const callbackUrl = new URL(request.url);
        const code = callbackUrl.searchParams.get('code') || (request.method === 'POST' ? (await request.formData()).get('code') : null);
        const state = callbackUrl.searchParams.get('state') || (request.method === 'POST' ? (await request.formData()).get('state') : null);
        if (!code || !state) return oauthRedirect({ error: 'missing_code' });
        const stateInfo = await verifyState(pepper, String(state), provider);
        if (!stateInfo) return oauthRedirect({ error: 'invalid_state' });
        const identity = provider === 'google' ? await exchangeGoogle(cfg, String(code)) : await exchangeApple(cfg, String(code), env.APPLE_KEY_ID);
        if (!identity.emailVerified) return oauthRedirect({ error: 'email_unverified' });

        let user;
        if (stateInfo.mode === 'link') {
          user = await getUserByEmail(env.CHEFAI_KV, stateInfo.linkingEmail);
          if (!user) return oauthRedirect({ error: 'session_expired' });
          const clash = await getUserByProvider(env.CHEFAI_KV, provider, identity.providerSubject);
          if (clash && clash.email !== user.email) return oauthRedirect({ error: 'provider_linked_elsewhere' });
          await setUserProvider(env.CHEFAI_KV, user, provider, identity.providerSubject);
          return oauthRedirect({ linked: provider, email: user.email });
        }

        user = (await getUserByProvider(env.CHEFAI_KV, provider, identity.providerSubject))
          || (await getUserByEmail(env.CHEFAI_KV, identity.email));
        if (!user) {
          user = {
            email: identity.email,
            name: identity.name || identity.email.split('@')[0],
            createdAt: new Date().toISOString(),
            passwordHash: null,
            oauth: {},
            ageConfirmed: true,
          };
          await putUser(env.CHEFAI_KV, user);
          logAuthEvent('oauth-provisioned', { account: redactEmail(user.email), provider });
        }
        await setUserProvider(env.CHEFAI_KV, user, provider, identity.providerSubject);
        loginGuardSuccess(`${identity.email}|${ip}`);
        const token = await createSession(env.CHEFAI_KV, user.email);
        // The 302 to the SPA must carry the session cookie.
        const dest = `/oauth-result#${new URLSearchParams({ success: '1', email: user.email }).toString()}`;
        return new Response(null, { status: 302, headers: { Location: dest, 'Cache-Control': 'no-store', 'Set-Cookie': sessionCookie(token) } });
      } catch (error) {
        console.error(`OAuth ${provider} ${phase} failed:`, error.message);
        return phase === 'start'
          ? jsonResponse({ error: 'Could not start sign-in' }, { status: 500, request, env })
          : oauthRedirect({ error: 'oauth_failed' });
      }
    }

    return jsonResponse({ error: 'Not found' }, { status: 404, request, env });
  } catch (error) {
    const status = error.status || 500;
    return jsonResponse({ error: status === 500 ? 'Auth request failed' : error.message }, { status, request, env });
  }
}

// Returns the user object, or a 401 Response the caller must return.
async function requireUser(request, env) {
  const user = await userForToken(request, env.CHEFAI_KV);
  if (!user) {
    return jsonResponse({ error: 'Not signed in' }, { status: 401, request, env });
  }
  return user;
}

async function shaHexPublic(text) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}
