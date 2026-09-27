const defaultBase = import.meta.env?.VITE_API_BASE_URL || '/api';

export const AUTH_STORAGE_KEY = 'chefai-auth'; // legacy key, cleaned up on boot

export function getApiUrl(path = '') {
  const normalizedBase = defaultBase.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

// ─── Session: httpOnly cookie only — the token is never readable by JS ──────
// (XSS cannot steal what JS cannot see). Any pre-cookie localStorage token is
// wiped on load so no bearer tokens linger in storage.
let hasSession = false;
try {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem('chefai-auth-v2');
} catch { /* storage unavailable (private mode) */ }

export function readStoredAuth() {
  // Sessions are cookie-based now; this reports the optimistic in-memory flag.
  return hasSession ? { user: null } : null;
}

export function markSignedIn() { hasSession = true; }
export function markSignedOut() { hasSession = false; }

export async function apiRequest(path, { method = 'GET', body, headers = {}, ...options } = {}) {
  const response = await fetch(getApiUrl(path), {
    method,
    // Cookie rides along automatically (SameSite=Strict, httpOnly).
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) markSignedOut();
    throw Object.assign(new Error(data.error || 'Request failed'), { status: response.status, data });
  }
  return data;
}

// ─── Auth API ───────────────────────────────────────────────────────────────
// Error objects carry .data so the UI can react to 2FA challenges, captchas,
// and lockouts without string matching.
export async function authSignUp({ email, password, name, ageConfirmed, ageYears }) {
  const data = await apiRequest('/auth/signup', { method: 'POST', body: { email, password, name, ageConfirmed, ageYears } });
  markSignedIn();
  return data.user;
}

export async function authLogin({ email, password, totp, backupCode, challenge, captchaId, captchaAnswer }) {
  const data = await apiRequest('/auth/login', { method: 'POST', body: { email, password, totp, backupCode, challenge, captchaId, captchaAnswer } });
  markSignedIn();
  return data;
}

export async function authLogout() {
  try { await apiRequest('/auth/logout', { method: 'POST' }); } catch { /* best-effort */ }
  markSignedOut();
}

export async function authMe() {
  const data = await apiRequest('/auth/me');
  return data.user;
}

export async function auth2faSetup() {
  return apiRequest('/auth/2fa/setup', { method: 'POST' });
}

export async function auth2faEnable(code) {
  return apiRequest('/auth/2fa/enable', { method: 'POST', body: { totp: code } });
}

export async function auth2faDisable(password) {
  return apiRequest('/auth/2fa/disable', { method: 'POST', body: { password } });
}

export async function auth2faStatus() {
  return apiRequest('/auth/2fa/status');
}

// ─── Per-account preference sync (appearance/accessibility/consent) ────────
export async function fetchPrefs() {
  return apiRequest('/prefs');
}

export async function pushPrefs(prefs) {
  return apiRequest('/prefs', { method: 'PUT', body: prefs });
}

// ─── Vision API (photo → ingredients / photo → dish) ───────────────────────
export async function visionPantry(images) {
  return apiRequest('/vision/pantry', { method: 'POST', body: { images } });
}

export async function visionDish(images) {
  return apiRequest('/vision/dish', { method: 'POST', body: { images } });
}

// File → resized JPEG data URL (client-side, keeps uploads small and private)
export function fileToDataUrl(file, maxEdge = 1024, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) {
      reject(new Error('Please choose an image file'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not decode that image'));
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
