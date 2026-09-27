// ─── Shared auth policy (pure Web Crypto — runs on Node 18+ and Workers) ─────
// Used by server/index.js (Express), functions/* (Cloudflare Pages) and the
// client (src/App.jsx password meter). No dependencies on purpose.

const encoder = new TextEncoder();

// ─── Password policy ─────────────────────────────────────────────────────────
export const MIN_PASSWORD_LENGTH = 12;

// Non-exhaustive worst-offender blocklist (the Have I Been Pwned range check
// covers the long tail). Deliberately includes the classics from the audit.
const COMMON_PASSWORDS = new Set([
  '123456', '12345678', '123456789', '1234567890', 'password', 'password1',
  'password123', 'password1234', 'passw0rd', 'p@ssword', 'qwerty', 'qwerty123',
  'qwertyuiop', 'abc123', 'abc123456', '111111', '11111111', '000000', '00000000',
  '123123', '121212', '123321', '1234', '12345', '1234567', '654321', '696969',
  'iloveyou', 'iloveyou1', 'iloveyou2', 'admin', 'admin123', 'administrator',
  'welcome', 'welcome1', 'welcome123', 'monkey', 'dragon', 'letmein', 'letmein123',
  'sunshine', 'princess', 'football', 'baseball', 'superman', 'batman', 'trustno1',
  'master', 'shadow', 'michael', 'jennifer', 'jordan', 'hunter', 'ranger',
  'summer', 'winter', 'spring', 'autumn', 'asdfgh', 'zxcvbnm', 'qwertyuiop123',
  '1q2w3e4r', '1q2w3e4r5t', 'qazwsx', 'starwars', 'chocolate', 'flower', 'hello',
  'hello123', 'freedom', 'whatever', 'test123', 'test1234', 'guest', 'guest123',
  'chefai', 'chefai123', 'cooking', 'kitchen', 'recipe', 'recipes', 'foodie',
  'zaq12wsx', 'asdf1234', 'a1b2c3d4', 'abcd1234', 'qwe123', 'pass123', 'root',
  'toor', 'changeme', 'default', 'sample', 'example', 'secret', 'love', 'sex',
  'god', 'money', 'ninja', 'azerty', 'solo', 'loveyou', 'lovely', 'anna', 'sunset',
]);

const CLASS_TESTS = [
  { label: 'upper letter', re: /[A-Z]/ },
  { label: 'lower letter', re: /[a-z]/ },
  { label: 'number', re: /[0-9]/ },
  { label: 'symbol', re: /[^A-Za-z0-9]/ },
];

export function passwordProblems(password, { email = '' } = {}) {
  const pw = String(password || '');
  const problems = [];
  if (pw.length < MIN_PASSWORD_LENGTH) problems.push(`Use at least ${MIN_PASSWORD_LENGTH} characters`);
  for (const { label, re } of CLASS_TESTS) {
    if (!re.test(pw)) problems.push(`Add at least one ${label}`);
  }
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) problems.push('That password is too common — pick something unique');
  const local = String(email || '').split('@')[0].toLowerCase();
  if (local.length >= 3 && pw.toLowerCase().includes(local)) {
    problems.push('Password must not contain your email name');
  }
  return problems;
}

// Client-side 0–4 strength score (no network, mirrors the server rules)
export function passwordStrength(password) {
  const pw = String(password || '');
  if (!pw) return { score: 0, label: '' };
  let score = 0;
  if (pw.length >= 12) score += 1;
  if (pw.length >= 16) score += 1;
  const classes = CLASS_TESTS.filter(({ re }) => re.test(pw)).length;
  score += classes >= 3 ? 1 : 0;
  score += classes === 4 && pw.length >= 14 ? 1 : 0;
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) score = 0;
  const labels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Excellent'];
  return { score: Math.min(score, 4), label: labels[Math.min(score, 4)] };
}

// ─── Have I Been Pwned (k-anonymity: only a 5-char prefix is ever sent) ───────
export async function sha1Hex(text) {
  const buf = await crypto.subtle.digest('SHA-1', encoder.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Returns true if the password appears in known breaches. On network failure
// this returns false (fail-open) so signups never break — HIBP is defense in
// depth on top of the local rules, not a hard dependency.
export async function isBreachedPassword(password) {
  try {
    const hash = (await sha1Hex(password)).toUpperCase();
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
      signal: AbortSignal.timeout(5000),
      headers: { 'Add-Padding': 'true' },
    });
    if (!res.ok) return false;
    const body = await res.text();
    const suffix = hash.slice(5);
    for (const line of body.split('\n')) {
      const [hashSuffix, count] = line.trim().split(':');
      if (hashSuffix === suffix && Number(count) > 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ─── TOTP (RFC 6238, SHA-1, 6 digits, 30s step — authenticator-app standard) ──
const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes) {
  let bits = 0, value = 0, out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const char of clean) {
    const idx = B32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

async function hmacSha1(keyBytes, messageBytes) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, messageBytes));
}

export function generateTotpSecret() {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

export async function totpCode(secretBase32, { timeStep = 30, offsetSteps = 0, nowMs = Date.now(), digits = 6 } = {}) {
  const key = base32Decode(secretBase32);
  const msg = new Uint8Array(8);
  // JS bit ops are 32-bit, so rebuild the 64-bit counter via BigInt.
  const counterBig = BigInt(Math.floor(nowMs / 1000 / timeStep) + offsetSteps);
  for (let i = 7; i >= 0; i -= 1) msg[i] = Number((counterBig >> BigInt(8 * (7 - i))) & 255n);
  const digest = await hmacSha1(key, msg);
  const trunc = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[trunc] & 0x7f) << 24) | (digest[trunc + 1] << 16) | (digest[trunc + 2] << 8) | digest[trunc + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

// Verify accepting the previous/current/next step (clock drift tolerance).
export async function verifyTotp(secretBase32, code, { nowMs = Date.now() } = {}) {
  const normalized = String(code || '').replace(/\D/g, '');
  if (normalized.length !== 6) return false;
  for (const offsetSteps of [-1, 0, 1]) {
    const expected = await totpCode(secretBase32, { offsetSteps, nowMs });
    if (timingSafeEqual(normalized, expected)) return true;
  }
  return false;
}

export function otpauthUri({ secret, email, issuer = 'ChefAI' }) {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email || 'user')}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// ─── Backup codes (10 single-use codes, stored as SHA-256 hashes) ────────────
export function generateBackupCodes(count = 10) {
  const codes = [];
  for (let i = 0; i < count; i += 1) {
    const bytes = crypto.getRandomValues(new Uint8Array(5));
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    codes.push(`${hex.slice(0, 4)}-${hex.slice(4, 10)}`.toUpperCase());
  }
  return codes;
}

export async function hashBackupCode(code) {
  return sha256Hex(String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''));
}

export function normalizeBackupCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// ─── Hashing + timing-safe compare ───────────────────────────────────────────
export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(a, b) {
  const sa = String(a), sb = String(b);
  if (sa.length !== sb.length) return false;
  let diff = 0;
  for (let i = 0; i < sa.length; i += 1) diff |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
  return diff === 0;
}

// ─── Signed login challenge (2FA step 2) ─────────────────────────────────────
// The challenge token is <email>|<expiryMs>|<hmac> where the HMAC key is
// derived from the user's stored password hash. Nothing new to configure, it
// is bound to the exact account, and it expires in 2 minutes.
const CHALLENGE_TTL_MS = 2 * 60 * 1000;

async function challengeKey(passwordHash) {
  return hexToBytes(await sha256Hex(`${passwordHash}|totp-challenge`));
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function hmacSha256(keyBytes, message) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createChallenge(email, passwordHash) {
  const expiry = Date.now() + CHALLENGE_TTL_MS;
  const payload = `${String(email).toLowerCase()}|${expiry}`;
  const sig = await hmacSha256(await challengeKey(passwordHash), payload);
  return `${payload}|${sig}`;
}

export async function verifyChallenge(challenge, passwordHash, email) {
  const parts = String(challenge || '').split('|');
  if (parts.length !== 3) return false;
  const [challengeEmail, expiry, sig] = parts;
  if (Number(expiry) < Date.now()) return false;
  if (email && challengeEmail.toLowerCase() !== String(email).toLowerCase()) return false;
  const expected = await hmacSha256(await challengeKey(passwordHash), `${challengeEmail}|${expiry}`);
  return timingSafeEqual(sig, expected);
}

// ─── Stateless math captcha (for repeated login failures) ────────────────────
// id = <expiryMs base36>.<nonce base36>; the answer is derived deterministically
// from HMAC(key, id) so any server instance can verify without shared storage.
const CAPTCHA_TTL_MS = 5 * 60 * 1000;

let memoCaptchaKey = null;
export function setCaptchaKey(keyHex) { memoCaptchaKey = keyHex; }

export async function ensureCaptchaKey(pepper) {
  if (!memoCaptchaKey) memoCaptchaKey = await sha256Hex(`chefai-captcha|${pepper}`);
  return memoCaptchaKey;
}

export async function makeCaptcha() {
  if (!memoCaptchaKey) throw new Error('captcha key not initialized');
  const expiry = (Date.now() + CAPTCHA_TTL_MS).toString(36);
  const nonce = [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const id = `${expiry}.${nonce}`;
  const sig = await hmacSha256(hexToBytes(memoCaptchaKey), id);
  const a = 2 + (parseInt(sig.slice(0, 2), 16) % 8);
  const b = 1 + (parseInt(sig.slice(2, 4), 16) % 8);
  return { id, question: `What is ${a} + ${b}?`, answer: a + b };
}

export async function verifyCaptcha(id, answer) {
  if (!memoCaptchaKey || !id) return false;
  const [expiry36] = String(id).split('.');
  if (parseInt(expiry36, 36) < Date.now()) return false;
  const sig = await hmacSha256(hexToBytes(memoCaptchaKey), String(id));
  const a = 2 + (parseInt(sig.slice(0, 2), 16) % 8);
  const b = 1 + (parseInt(sig.slice(2, 4), 16) % 8);
  return timingSafeEqual(String(parseInt(answer, 10)), String(a + b));
}

// ─── Brute-force guard: per-account lockout with exponential backoff ─────────
// Memory-backed (per process / isolate). The KV layer layers a persistent
// counter on top for cross-isolate lockout (see functions/lib/backend.js).
const LOCK_THRESHOLD = 5;      // failed attempts before lockout kicks in
const CAPTCHA_AFTER = 3;       // failed attempts before a captcha is required
const MAX_LOCK_MS = 15 * 60 * 1000;
const guards = new Map();      // key → { count, lastAt, lockUntil }
let lastSweep = 0;

function sweepGuards(now) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, entry] of guards) {
    if (now - entry.lastAt > 30 * 60_000) guards.delete(key);
  }
  if (guards.size > 10_000) guards.clear();
}

export function loginGuardState(key) {
  sweepGuards(Date.now());
  return guards.get(key) || { count: 0, lockUntil: 0 };
}

// Returns { allowed, captchaRequired, retryAfter } — call BEFORE verifying.
export function loginGuardCheck(key) {
  const state = loginGuardState(key);
  const now = Date.now();
  if (state.lockUntil > now) {
    return { allowed: false, captchaRequired: true, retryAfter: Math.ceil((state.lockUntil - now) / 1000) };
  }
  return { allowed: true, captchaRequired: state.count >= CAPTCHA_AFTER, retryAfter: 0 };
}

// Records a failure; returns the lock duration applied (0 if none).
export function loginGuardFail(key, now = Date.now()) {
  const state = loginGuardState(key);
  const count = state.count + 1;
  let lockUntil = 0;
  if (count >= LOCK_THRESHOLD) {
    // Exponential backoff: 15s, 30s, 60s, 120s … capped at 15 minutes.
    lockUntil = Math.min(15_000 * 2 ** (count - LOCK_THRESHOLD), MAX_LOCK_MS) + now;
  }
  guards.set(key, { count, lastAt: now, lockUntil });
  return { count, lockedForMs: lockUntil ? lockUntil - now : 0 };
}

export function loginGuardSuccess(key) {
  guards.delete(key);
}

export function redactEmail(email) {
  const [local, domain] = String(email || '').split('@');
  if (!domain) return '<invalid>';
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(local.length - 1, 2))}@${domain}`;
}
