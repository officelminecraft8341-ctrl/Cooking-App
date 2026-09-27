// ─── OAuth helpers: Google + Apple sign-in, shared by both backends ──────────
// Uses only Web Crypto + fetch, so the same code runs on Node 18+ and Workers.
// Flow: /start creates a signed state, the provider redirects back to
// /callback, the code is exchanged for tokens, the id_token is verified
// (RS256 via JWKS), and the provider identity is linked onto a ChefAI account.

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

const APPLE_AUTH_URL = 'https://appleid.apple.com/auth/authorize';
const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

const STATE_TTL_MS = 10 * 60 * 1000;

export function oauthConfig(env = {}) {
  const base = String(env.OAUTH_REDIRECT_BASE || '').replace(/\/+$/, '');
  return {
    google: {
      clientId: env.GOOGLE_CLIENT_ID || '',
      clientSecret: env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: base ? `${base}/api/auth/oauth/google/callback` : '',
    },
    apple: {
      clientId: env.APPLE_CLIENT_ID || '', // Services ID
      clientSecret: env.APPLE_CLIENT_SECRET || '', // signed JWT (ES256, Apple-specific)
      redirectUri: base ? `${base}/api/auth/oauth/apple/callback` : '',
    },
  };
}

export function providerConfigured(cfg, provider) {
  return Boolean(cfg[provider]?.clientId && cfg[provider]?.clientSecret && cfg[provider]?.redirectUri);
}

// ─── Signed state: <provider>|<expiryMs>|<hmac> — HMAC over a server pepper ──
export async function stateKey(pepper) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`chefai-oauth-state|${pepper}`));
  return new Uint8Array(buf);
}

async function hmacHex(keyBytes, message) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

// mode: 'signin' (create-or-link) | 'link' (attach to existing userId email)
export async function createState(pepper, provider, mode, linkingEmail = '') {
  const key = await stateKey(pepper);
  const nonce = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const expiry = Date.now() + STATE_TTL_MS;
  const payload = `${provider}|${mode}|${linkingEmail}|${expiry}|${nonce}`;
  const sig = await hmacHex(key, payload);
  return `${payload}|${sig}`;
}

export async function verifyState(pepper, state, provider) {
  const parts = String(state || '').split('|');
  if (parts.length !== 6) return null;
  const [stateProvider, mode, linkingEmail, expiry, nonce, sig] = parts;
  if (stateProvider !== provider) return null;
  if (Number(expiry) < Date.now()) return null;
  const key = await stateKey(pepper);
  const expected = await hmacHex(key, `${stateProvider}|${mode}|${linkingEmail}|${expiry}|${nonce}`);
  // length check + constant-time-ish compare
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i += 1) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  return { mode, linkingEmail };
}

// ─── Authorization URL builders ──────────────────────────────────────────────
export function googleAuthUrl(cfg, state) {
  const params = new URLSearchParams({
    client_id: cfg.google.clientId,
    redirect_uri: cfg.google.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

// Apple requires response_mode=form_post for the email/name scope; we use the
// default code flow (name/email arrive in the id_token's first sign-in).
export function appleAuthUrl(cfg, state) {
  const params = new URLSearchParams({
    client_id: cfg.apple.clientId,
    redirect_uri: cfg.apple.redirectUri,
    response_type: 'code',
    scope: 'name email',
    state,
    response_mode: 'form_post',
  });
  return `${APPLE_AUTH_URL}?${params}`;
}

// ─── Code exchange + id_token verification (RS256 via JWKS) ──────────────────
const jwksCache = new Map(); // url → { keys, fetchedAt }

async function getJwks(url) {
  const cached = jwksCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < 60 * 60 * 1000) return cached.keys;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const { keys } = await res.json();
  jwksCache.set(url, { keys, fetchedAt: Date.now() });
  return keys;
}

function base64UrlDecodeToBytes(str) {
  const b64 = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const binary = atob(b64 + pad);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function jsonB64(str) {
  return JSON.parse(new TextDecoder().decode(base64UrlDecodeToBytes(str)));
}

async function verifyIdToken(idToken, { jwksUrl, audience, issuer }) {
  const [headerB64, payloadB64, sigB64] = String(idToken || '').split('.');
  if (!headerB64 || !payloadB64 || !sigB64) throw new Error('Malformed id_token');
  const header = jsonB64(headerB64);
  const payload = jsonB64(payloadB64);
  if (header.alg !== 'RS256') throw new Error(`Unsupported token alg: ${header.alg}`);
  if (payload.aud !== audience) throw new Error('Token audience mismatch');
  if (!String(payload.iss || '').startsWith(issuer)) throw new Error('Token issuer mismatch');
  if (payload.exp * 1000 < Date.now()) throw new Error('Token expired');

  const keys = await getJwks(jwksUrl);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('No matching signing key');

  const pubKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecodeToBytes(sigB64);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pubKey, signature, data);
  if (!ok) throw new Error('Token signature invalid');

  return {
    providerSubject: payload.sub,
    email: String(payload.email || '').toLowerCase(),
    emailVerified: payload.email_verified !== false,
    name: payload.name || '',
  };
}

export async function exchangeGoogle(cfg, code) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cfg.google.clientId,
      client_secret: cfg.google.clientSecret,
      redirect_uri: cfg.google.redirectUri,
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`);
  const tokens = await res.json();
  return verifyIdToken(tokens.id_token, {
    jwksUrl: GOOGLE_JWKS_URL,
    audience: cfg.google.clientId,
    issuer: 'https://accounts.google.com',
  });
}

// Apple's client secret is a signed JWT (ES256) minted from the team key.
export async function appleClientSecret(cfg, envKeyPem) {
  const pem = envKeyPem || cfg.apple.clientSecret;
  if (!pem || !pem.includes('PRIVATE KEY')) {
    // Already a minted JWT? Pass through (advanced config), else error clearly.
    if (pem && pem.split('.').length === 3) return pem;
    throw new Error('Apple client secret must be the .p8 private key (or a pre-signed JWT)');
  }
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(pem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const header = { alg: 'ES256', kid: envKeyPem ? envKeyPem : undefined, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: cfg.apple.teamId || '',
    iat: now,
    exp: now + 30 * 60,
    aud: 'https://appleid.apple.com',
    sub: cfg.apple.clientId,
  };
  const signingInput = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(claims))}`;
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${b64uBytes(new Uint8Array(sig))}`;
}

function b64u(str) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64uBytes(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function pemToPkcs8(pem) {
  const body = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const binary = atob(body);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export async function exchangeApple(cfg, code, envKeyPem) {
  const clientSecret = await appleClientSecret(cfg, envKeyPem);
  const res = await fetch(APPLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cfg.apple.clientId,
      client_secret: clientSecret,
      redirect_uri: cfg.apple.redirectUri,
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Apple token exchange failed: ${res.status}`);
  const tokens = await res.json();
  return verifyIdToken(tokens.id_token, {
    jwksUrl: APPLE_JWKS_URL,
    audience: cfg.apple.clientId,
    issuer: 'https://appleid.apple.com',
  });
}
