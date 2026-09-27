// ─── Shared backend library for Cloudflare Pages Functions ───────────────────
// Mirrors the Express server's behavior (server/index.js) using Workers
// primitives: KV for storage, Web Crypto for hashing, env bindings for keys.

const encoder = new TextEncoder();

// ─── Password hashing (PBKDF2-SHA256, 100k iters — scrypt isn't in Workers) ──
async function hashPassword(password, saltHex = null) {
  const salt = saltHex ? hexDecode(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 }, key, 256);
  return `${hexEncode(salt)}:${hexEncode(new Uint8Array(bits))}`;
}

export async function verifyPassword(password, stored) {
  const [saltHex, expectedHex] = String(stored || '').split(':');
  if (!saltHex || !expectedHex) return false;
  const actual = await hashPassword(password, saltHex);
  return safeEqual(actual, stored);
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function hexEncode(bytes) { return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(''); }
function hexDecode(hex) { const out = new Uint8Array(hex.length / 2); for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16); return out; }

// ─── Config from environment bindings ────────────────────────────────────────
export function config(env) {
  return {
    API_KEY: env.OPENAI_API_KEY || env.AI_API_KEY || '',
    AI_URL: env.AI_URL || 'https://openrouter.ai/api/v1/chat/completions',
    MODEL: env.AI_MODEL || 'cohere/north-mini-code:free',
    EMBED_API_KEY: env.EMBED_API_KEY || env.OPENAI_API_KEY || env.AI_API_KEY || '',
    EMBED_URL: env.EMBED_URL || 'https://ai.hackclub.com/proxy/v1/embeddings',
    EMBED_MODEL: env.EMBED_MODEL || 'liquid/lfm-2.5-embedding-350m:free',
    VISION_MODEL: env.VISION_MODEL || 'qwen/qwen2.5-vl-72b-instruct',
  };
}

// ─── KV-backed auth store (binding name: CHEFAI_KV) ─────────────────────────
const SESSION_TTL = 30 * 24 * 60 * 60; // seconds

function tokenHash(token) { return `session:${token.slice(0, 8)}:${shaHex(token)}`; }
async function shaHex(text) { return hexEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)))); }

export async function createSession(kv, email) {
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
  await kv.put(tokenHash(token), JSON.stringify({ email, createdAt: Date.now() }), { expirationTtl: SESSION_TTL });
  return token;
}

export async function userForToken(request, kv) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  const raw = await kv.get(tokenHash(token));
  if (!raw) return null;
  const session = JSON.parse(raw);
  const user = await getUser(kv, session.email);
  return user || null;
}

async function getUser(kv, email) {
  const raw = await kv.get(`user:${email}`);
  return raw ? JSON.parse(raw) : null;
}

async function putUser(kv, user) { await kv.put(`user:${user.email}`, JSON.stringify(user)); }

export async function signUpUser(kv, { email, password, name }) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw httpError(400, 'Please enter a valid email address');
  if (String(password || '').length < 8) throw httpError(400, 'Password must be at least 8 characters');
  if (await getUser(kv, normalized)) throw httpError(409, 'An account with that email already exists');

  // Seed the account with any recipes saved before sign-up (legacy local bucket)
  const legacy = await kv.get(`recipes:__anonymous__`);
  const seed = legacy ? JSON.parse(legacy) : [];

  const user = { email: normalized, name: String(name || '').trim() || normalized.split('@')[0], passwordHash: await hashPassword(String(password)), createdAt: Date.now() };
  await putUser(kv, user);
  if (seed.length) {
    await kv.put(`recipes:${normalized}`, JSON.stringify(seed));
    await kv.delete('recipes:__anonymous__');
  }
  return { email: user.email, name: user.name, createdAt: user.createdAt };
}

export async function loginUser(kv, { email, password }) {
  const normalized = String(email || '').trim().toLowerCase();
  const user = await getUser(kv, normalized);
  if (!user || !(await verifyPassword(String(password || ''), user.passwordHash))) {
    throw httpError(401, 'Incorrect email or password');
  }
  const token = await createSession(kv, normalized);
  return { token, user: { email: user.email, name: user.name, createdAt: user.createdAt } };
}

export async function deleteAccount(kv, user) {
  await kv.delete(`user:${user.email}`);
  await kv.delete(`recipes:${user.email}`);
  // delete every session for this user by listing session keys
  const sessions = await kv.list({ prefix: 'session:' });
  await Promise.all(sessions.keys.map(async (key) => {
    const raw = await kv.get(key.name);
    if (!raw) return;
    try { if (JSON.parse(raw).email === user.email) await kv.delete(key.name); } catch { /* ignore */ }
  }));
}

// ─── Per-user recipe buckets (KV) ────────────────────────────────────────────
export async function bucketFor(request, kv) {
  const user = await userForToken(request, kv);
  if (!user) return { bucket: [], email: null };
  const raw = await kv.get(`recipes:${user.email}`);
  return { bucket: raw ? JSON.parse(raw) : [], email: user.email };
}

export async function saveBucket(kv, email, bucket) {
  await kv.put(`recipes:${email}`, JSON.stringify(bucket));
}

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// ─── JSON response helpers + CORS + security headers ─────────────────────────
const ALLOWED_ORIGIN_SUFFIXES = ['.pages.dev'];

export function jsonResponse(data, { status = 200, request, env } = {}) {
  const headers = {
    'content-type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
  };
  const origin = request?.headers.get('origin');
  if (origin) {
    const hostname = new URL(origin).hostname;
    const allowed = hostname === 'localhost' || hostname === '127.0.0.1' || ALLOWED_ORIGIN_SUFFIXES.some((s) => hostname.endsWith(s))
      || String(env?.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean).includes(origin);
    if (allowed) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Vary'] = 'Origin';
      headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
      headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
      headers['Access-Control-Max-Age'] = '86400';
    }
  }
  return new Response(JSON.stringify(data), { status, headers });
}

export function preflightResponse(request, env) {
  return jsonResponse({}, { status: 204, request, env });
}

// ─── In-memory sliding-window rate limiter (per isolate) ─────────────────────
const buckets = new Map();

export function rateLimit(request, { windowMs = 60_000, max = 30 } = {}) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const now = Date.now();
  const entry = buckets.get(ip) || [];
  const recent = entry.filter((ts) => now - ts < windowMs);
  if (recent.length >= max) return false;
  recent.push(now);
  buckets.set(ip, recent);
  if (buckets.size > 5000) buckets.clear(); // isolate memory guard
  return true;
}

// ─── AI helpers ──────────────────────────────────────────────────────────────
export async function callAI(env, messages, model) {
  const cfg = config(env);
  if (!cfg.API_KEY) throw httpError(500, 'AI API key is not configured');
  const response = await fetch(cfg.AI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.API_KEY}` },
    body: JSON.stringify({ model: model || cfg.MODEL, messages }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw httpError(502, `AI API error ${response.status}`);
  }
  const data = await response.json();
  return data?.choices?.[0]?.message?.content || '';
}

export async function callEmbeddings(env, input) {
  const cfg = config(env);
  if (!cfg.EMBED_API_KEY) throw httpError(500, 'Embeddings API key is not configured');
  const response = await fetch(cfg.EMBED_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.EMBED_API_KEY}` },
    body: JSON.stringify({ model: cfg.EMBED_MODEL, input }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw httpError(502, `Embeddings API error ${response.status}`);
  const data = await response.json();
  const embedding = data?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) throw httpError(502, 'Embeddings API returned no embedding vector');
  return embedding;
}

// ─── Shared request parsing ──────────────────────────────────────────────────
export async function readJson(request, { maxBytes = 6 * 1024 * 1024 } = {}) {
  const raw = await request.text();
  if (raw.length > maxBytes) throw httpError(413, 'Request body too large');
  try { return JSON.parse(raw || '{}'); } catch { throw httpError(400, 'Invalid JSON body'); }
}

const MAX_IMAGE_CHARS = 4_000_000;
export function parseDataImages(rawImages) {
  const images = Array.isArray(rawImages) ? rawImages : [];
  if (images.length > 3) throw httpError(400, 'Too many images (max 3)');
  return images.map((url) => {
    if (typeof url !== 'string' || !/^data:image\/(jpeg|png|webp|gif);base64,/.test(url)) {
      throw httpError(400, 'Images must be image data URLs');
    }
    if (url.length > MAX_IMAGE_CHARS) throw httpError(400, 'Image is too large (max ~3MB)');
    return url;
  });
}

export function visionContent(text, images) {
  const parts = [{ type: 'text', text }];
  (images || []).forEach((url) => parts.push({ type: 'image_url', image_url: { url } }));
  return parts;
}
