import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Boots the real Express app in-process on an ephemeral port with an
// isolated data file, then exercises the auth API end-to-end over HTTP.
process.env.CHEFAI_DATA_FILE = path.join(os.tmpdir(), `chefai-auth-test-${Date.now()}.json`);
process.env.OPENAI_API_KEY = '';

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

async function api(pathname, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

describe('auth API', () => {
  it('rejects signup with an invalid email or short password', async () => {
    expect((await api('/api/auth/signup', { method: 'POST', body: { email: 'nope', password: 'longenough1' } })).status).toBe(400);
    expect((await api('/api/auth/signup', { method: 'POST', body: { email: 'a@b.co', password: 'short' } })).status).toBe(400);
  });

  it('signs up, returns the user, and issues a session token', async () => {
    const { status, data } = await api('/api/auth/signup', {
      method: 'POST',
      body: { email: 'Chef@Test.com', password: 'longenough1', name: 'Test Chef' },
    });
    expect(status).toBe(201);
    expect(data.user).toMatchObject({ email: 'chef@test.com', name: 'Test Chef' });
    expect(data.token).toBeTruthy();
  });

  it('blocks duplicate signups with 409', async () => {
    const { status } = await api('/api/auth/signup', {
      method: 'POST',
      body: { email: 'chef@test.com', password: 'longenough1' },
    });
    expect(status).toBe(409);
  });

  it('logs in with the right password and rejects the wrong one', async () => {
    const ok = await api('/api/auth/login', { method: 'POST', body: { email: 'chef@test.com', password: 'longenough1' } });
    expect(ok.status).toBe(200);
    expect(ok.data.token).toBeTruthy();

    const bad = await api('/api/auth/login', { method: 'POST', body: { email: 'chef@test.com', password: 'wrong-password' } });
    expect(bad.status).toBe(401);
  });

  it('scopes recipe collections per account and validates sessions via /me', async () => {
    const a = await api('/api/auth/login', { method: 'POST', body: { email: 'chef@test.com', password: 'longenough1' } });
    const b = await api('/api/auth/signup', { method: 'POST', body: { email: 'second@test.com', password: 'longenough2' } });

    await api('/api/recipes', { method: 'POST', token: a.data.token, body: { title: 'Chef A Dish' } });
    await api('/api/recipes', { method: 'POST', token: b.data.token, body: { title: 'Chef B Dish' } });

    const listA = await api('/api/recipes', { token: a.data.token });
    const listB = await api('/api/recipes', { token: b.data.token });
    expect(listA.data.map((r) => r.title)).toEqual(['Chef A Dish']);
    expect(listB.data.map((r) => r.title)).toEqual(['Chef B Dish']);

    const me = await api('/api/auth/me', { token: a.data.token });
    expect(me.status).toBe(200);
    expect(me.data.user.email).toBe('chef@test.com');

    const anonymous = await api('/api/recipes');
    expect(Array.isArray(anonymous.data)).toBe(true);
    expect(anonymous.data.some((r) => r.title === 'Chef A Dish')).toBe(false);
  });

  it('logout invalidates the session token', async () => {
    const login = await api('/api/auth/login', { method: 'POST', body: { email: 'chef@test.com', password: 'longenough1' } });
    await api('/api/auth/logout', { method: 'POST', token: login.data.token });
    const me = await api('/api/auth/me', { token: login.data.token });
    expect(me.status).toBe(401);
  });
});
