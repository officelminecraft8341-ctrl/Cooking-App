const defaultBase = import.meta.env?.VITE_API_BASE_URL || '/api';

export const AUTH_STORAGE_KEY = 'chefai-auth';

export function getApiUrl(path = '') {
  const normalizedBase = defaultBase.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export function readStoredAuth() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY));
    return parsed?.token && parsed?.user ? parsed : null;
  } catch {
    return null;
  }
}

function storeAuth(auth) {
  if (auth?.token && auth?.user) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

export async function apiRequest(path, { method = 'GET', body, headers = {}, ...options } = {}) {
  const stored = readStoredAuth();
  const response = await fetch(getApiUrl(path), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(stored?.token ? { Authorization: `Bearer ${stored.token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    // A rejected token means the session is gone — drop it so the UI resets.
    if (response.status === 401 && stored?.token && !path.startsWith('/auth/')) {
      storeAuth(null);
    }
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

// ─── Auth API ───────────────────────────────────────────────────────────────
export async function authSignUp({ email, password, name }) {
  const data = await apiRequest('/auth/signup', { method: 'POST', body: { email, password, name } });
  storeAuth({ token: data.token, user: data.user });
  return data.user;
}

export async function authLogin({ email, password }) {
  const data = await apiRequest('/auth/login', { method: 'POST', body: { email, password } });
  storeAuth({ token: data.token, user: data.user });
  return data.user;
}

export async function authLogout() {
  try { await apiRequest('/auth/logout', { method: 'POST' }); } catch { /* best-effort */ }
  storeAuth(null);
}

export async function authMe() {
  const data = await apiRequest('/auth/me');
  return data.user;
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
