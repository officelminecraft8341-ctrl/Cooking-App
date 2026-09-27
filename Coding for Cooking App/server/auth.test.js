import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Boots the real Express app in-process on an ephemeral port with an
// isolated data file, then exercises the hardened auth API end-to-end.
process.env.CHEFAI_DATA_FILE = path.join(os.tmpdir(), `chefai-auth-test-${Date.now()}.json`);
process.env.OPENAI_API_KEY = '';
// The per-IP limiter stays strict in production; the test exercises the
// per-account guards (captcha, lockout, 2FA) across many logins.
process.env.LOGIN_RATE_MAX = '1000';
process.env.SIGNUP_RATE_MAX = '1000';
process.env.AUTH_RATE_MAX = '1000';

const { default: app } = await import('./index.js');

let baseUrl;

beforeAll(async () => {
  await new Promise((resolve) => {
    const server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  try { fs.unlinkSync(process.env.CHEFAI_DATA_FILE); } catch { /* already gone */ }
});

// Session auth now rides an httpOnly cookie; this helper captures Set-Cookie
// and replays it, exactly like a browser would.
async function api(pathname, { method = 'GET', body, token, cookie } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}), // deprecated transport, still honored
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = response.headers.get('set-cookie');
  const sessionCookie = setCookie?.split(/;\s*/).find((c) => c.startsWith('chefai_session='));
  const cookieValue = sessionCookie && !sessionCookie.startsWith('chefai_session=;')
    ? sessionCookie.split(';')[0]
    : null;
  return { status: response.status, data: await response.json().catch(() => ({})), cookie: cookieValue, setCookie };
}

const STRONG = 'Str0ng!Pw-x1';
const STRONG2 = 'C0rr3ct!Horse-Battery';
const TOO_WEAK = 'abcdefgh1'; // 9 chars, single class — fails the 3-of-4 rule

// "What is 7 + 5?" → 12 (test-side solver for the stateless math captcha)
function captchaAnswerFor(question) {
  const [, a, b] = question.match(/What is (\d+) \+ (\d+)?/) || [];
  return Number(a) + Number(b);
}

describe('auth API — hardened', () => {
  it('rejects signup with an invalid email, weak password, or missing age confirmation', async () => {
    expect((await api('/api/auth/signup', { method: 'POST', body: { email: 'nope', password: STRONG, ageConfirmed: true } })).status).toBe(400);
    expect((await api('/api/auth/signup', { method: 'POST', body: { email: 'a@b.co', password: 'short', ageConfirmed: true } })).status).toBe(400);
    expect((await api('/api/auth/signup', { method: 'POST', body: { email: 'a@b.co', password: TOO_WEAK, ageConfirmed: true } })).status).toBe(400);
    expect((await api('/api/auth/signup', { method: 'POST', body: { email: 'a@b.co', password: 'Password123!', ageConfirmed: true } })).status).toBe(400); // blocklisted
    expect((await api('/api/auth/signup', { method: 'POST', body: { email: 'a@b.co', password: STRONG, ageConfirmed: false } })).status).toBe(400);
  });

  it('rejects under-13 signups (COPPA age gate)', async () => {
    const { status, data } = await api('/api/auth/signup', {
      method: 'POST',
      body: { email: 'kid@test.com', password: STRONG, ageConfirmed: true, ageYears: 9 },
    });
    expect(status).toBe(403);
    expect(data.error).toMatch(/13/);
  });

  it('signs up, sets an httpOnly session cookie, and returns no token in the body', async () => {
    const { status, data, cookie, setCookie } = await api('/api/auth/signup', {
      method: 'POST',
      body: { email: 'Chef@Test.com', password: STRONG, name: 'Test Chef', ageConfirmed: true },
    });
    expect(status).toBe(201);
    expect(data.user).toMatchObject({ email: 'chef@test.com', name: 'Test Chef' });
    expect(data.token).toBeUndefined();
    expect(cookie).toMatch(/^chefai_session=[a-f0-9]{64}$/);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
  });

  it('blocks duplicate signups with 409', async () => {
    const { status } = await api('/api/auth/signup', {
      method: 'POST',
      body: { email: 'chef@test.com', password: STRONG, ageConfirmed: true },
    });
    expect(status).toBe(409);
  });

  it('logs in with the right password and rejects the wrong one', async () => {
    const ok = await api('/api/auth/login', { method: 'POST', body: { email: 'chef@test.com', password: STRONG } });
    expect(ok.status).toBe(200);
    expect(ok.cookie).toMatch(/^chefai_session=/);

    const bad = await api('/api/auth/login', { method: 'POST', body: { email: 'chef@test.com', password: 'WrongPassword-999!' } });
    expect(bad.status).toBe(401);
  });

  it('serves a captcha after three failed attempts and never leaks the answer', async () => {
    // Fresh account so the guard counter starts at zero.
    await api('/api/auth/signup', { method: 'POST', body: { email: 'captcha@test.com', password: STRONG2, ageConfirmed: true } });
    let last;
    for (let i = 0; i < 3; i += 1) {
      last = await api('/api/auth/login', { method: 'POST', body: { email: 'captcha@test.com', password: 'WrongPassword-999!' } });
    }
    expect(last.status).toBe(401);
    expect(last.data.requiresCaptcha).toBe(true);
    expect(last.data.captcha.id).toBeTruthy();
    expect(last.data.captcha.question).toMatch(/What is \d+ \+ \d+\?/);
    expect(JSON.stringify(last.data)).not.toContain('"answer"');
  });

  it('locks an account after five failed attempts (exponential backoff)', async () => {
    await api('/api/auth/signup', { method: 'POST', body: { email: 'lockout@test.com', password: STRONG2, ageConfirmed: true } });
    let last;
    let captchaState = null;
    for (let i = 0; i < 5; i += 1) {
      // From the 3rd failure the server demands a captcha; solve it so the
      // failure counter keeps climbing (the captcha is checked BEFORE the
      // password, so unsolved captchas do not register as new failures).
      last = await api('/api/auth/login', {
        method: 'POST',
        body: {
          email: 'lockout@test.com',
          password: 'WrongPassword-999!',
          ...(captchaState ? { captchaId: captchaState.data.captcha.id, captchaAnswer: String(captchaAnswerFor(captchaState.data.captcha.question)) } : {}),
        },
      });
      if (last.data.captcha) captchaState = last;
    }
    expect(last.status).toBe(401);
    expect(last.data.lockedFor).toBeGreaterThan(0);
    // Even the correct password is refused while locked.
    const locked = await api('/api/auth/login', { method: 'POST', body: { email: 'lockout@test.com', password: STRONG2 } });
    expect(locked.status).toBe(429);
  });

  it('enforces the full 2FA lifecycle: setup, enable, challenge login, backup code, disable', async () => {
    const { cookie } = await api('/api/auth/signup', {
      method: 'POST', body: { email: 'tfa@test.com', password: STRONG2, ageConfirmed: true },
    });

    const setup = await api('/api/auth/2fa/setup', { method: 'POST', cookie });
    expect(setup.status).toBe(200);
    expect(setup.data.secret).toMatch(/^[A-Z2-7]+$/);
    expect(setup.data.otpauth).toContain('otpauth://totp/ChefAI');

    const { totpCode } = await import('../shared/authShared.js');
    const code = await totpCode(setup.data.secret);
    const enable = await api('/api/auth/2fa/enable', { method: 'POST', cookie, body: { totp: code } });
    expect(enable.status).toBe(200);
    expect(enable.data.backupCodes).toHaveLength(10);

    const status = await api('/api/auth/2fa/status', { cookie });
    expect(status.data.enabled).toBe(true);

    // Password alone is no longer enough — the server issues a challenge.
    const step1 = await api('/api/auth/login', { method: 'POST', body: { email: 'tfa@test.com', password: STRONG2 } });
    expect(step1.status).toBe(401);
    expect(step1.data.requiresChallenge).toBe(true);
    expect(step1.data.challenge).toBeTruthy();

    // Wrong code is rejected but keeps the challenge alive for a retry.
    const wrong = await api('/api/auth/login', {
      method: 'POST',
      body: { email: 'tfa@test.com', password: STRONG2, challenge: step1.data.challenge, totp: '000000' },
    });
    expect(wrong.status).toBe(401);
    expect(wrong.data.requiresChallenge).toBe(true);

    // Correct code completes the login and sets the cookie.
    const code2 = await totpCode(setup.data.secret);
    const step2 = await api('/api/auth/login', {
      method: 'POST',
      body: { email: 'tfa@test.com', password: STRONG2, challenge: step1.data.challenge, totp: code2 },
    });
    expect(step2.status).toBe(200);
    expect(step2.cookie).toMatch(/^chefai_session=/);

    // Backup code: single use, then invalid on reuse.
    const backup = enable.data.backupCodes[0];
    const step3 = await api('/api/auth/login', { method: 'POST', body: { email: 'tfa@test.com', password: STRONG2 } });
    const step4 = await api('/api/auth/login', {
      method: 'POST',
      body: { email: 'tfa@test.com', password: STRONG2, challenge: step3.data.challenge, backupCode: backup },
    });
    expect(step4.status).toBe(200);
    const step5 = await api('/api/auth/login', { method: 'POST', body: { email: 'tfa@test.com', password: STRONG2 } });
    const step6 = await api('/api/auth/login', {
      method: 'POST',
      body: { email: 'tfa@test.com', password: STRONG2, challenge: step5.data.challenge, backupCode: backup },
    });
    expect(step6.status).toBe(401);

    // Disabling requires the password again — wrong password denied first.
    const noPw = await api('/api/auth/2fa/disable', { method: 'POST', cookie, body: { password: 'nope' } });
    expect(noPw.status).toBe(401);
    const disable = await api('/api/auth/2fa/disable', { method: 'POST', cookie, body: { password: STRONG2 } });
    expect(disable.status).toBe(200);
    expect(disable.data.enabled).toBe(false);
  });

  it('scopes recipe collections per account and validates sessions via /me', async () => {
    const a = await api('/api/auth/login', { method: 'POST', body: { email: 'chef@test.com', password: STRONG } });
    const b = await api('/api/auth/signup', { method: 'POST', body: { email: 'second@test.com', password: STRONG2, ageConfirmed: true } });

    await api('/api/recipes', { method: 'POST', cookie: a.cookie, body: { title: 'Chef A Dish' } });
    await api('/api/recipes', { method: 'POST', cookie: b.cookie, body: { title: 'Chef B Dish' } });

    const listA = await api('/api/recipes', { cookie: a.cookie });
    const listB = await api('/api/recipes', { cookie: b.cookie });
    expect(listA.data.map((r) => r.title)).toEqual(['Chef A Dish']);
    expect(listB.data.map((r) => r.title)).toEqual(['Chef B Dish']);

    const me = await api('/api/auth/me', { cookie: a.cookie });
    expect(me.status).toBe(200);
    expect(me.data.user.email).toBe('chef@test.com');

    const anonymous = await api('/api/recipes');
    expect(Array.isArray(anonymous.data)).toBe(true);
    expect(anonymous.data.some((r) => r.title === 'Chef A Dish')).toBe(false);
  });

  it('logout invalidates the session and clears the cookie', async () => {
    const login = await api('/api/auth/login', { method: 'POST', body: { email: 'chef@test.com', password: STRONG } });
    const logout = await api('/api/auth/logout', { method: 'POST', cookie: login.cookie });
    expect(logout.setCookie).toMatch(/chefai_session=;/);
    const me = await api('/api/auth/me', { cookie: login.cookie });
    expect(me.status).toBe(401);
  });

  it('blocks cross-origin state-changing requests (CSRF defense)', async () => {
    const response = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: '{}',
    });
    expect(response.status).toBe(403);
  });

  it('deletes the account and every session via /account', async () => {
    const { cookie } = await api('/api/auth/login', { method: 'POST', body: { email: 'second@test.com', password: STRONG2 } });
    const del = await api('/api/auth/account', { method: 'DELETE', cookie });
    expect(del.status).toBe(200);
    const me = await api('/api/auth/me', { cookie });
    expect(me.status).toBe(401);
  });
});

describe('meal plan sync', () => {
  it('stores and returns a meal plan via /api/prefs', async () => {
    const { cookie } = await api('/api/auth/signup', {
      method: 'POST',
      body: { email: 'planner@test.com', password: STRONG2, ageConfirmed: true },
    });
    const plan = {
      '2026-10-05|dinner': { title: 'Miso Salmon', recipeId: 12 },
      '2026-10-06|lunch': { title: 'Chickpea Salad', recipeId: 13 },
    };
    const put = await api('/api/prefs', { method: 'PUT', cookie, body: { plan } });
    expect(put.status).toBe(200);
    const get = await api('/api/prefs', { cookie });
    expect(get.data.plan).toMatchObject(plan);
    // Over-size plans are rejected (cap), keeping the endpoint abuse-proof.
    const huge = { 'k': 'x'.repeat(25_000) };
    await api('/api/prefs', { method: 'PUT', cookie, body: { plan: huge } });
    const after = await api('/api/prefs', { cookie });
    expect(JSON.stringify(after.data.plan)).toBe(JSON.stringify(plan)); // unchanged
    await api('/api/auth/account', { method: 'DELETE', cookie });
  });
});
