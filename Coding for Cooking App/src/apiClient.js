const defaultBase = import.meta.env?.VITE_API_BASE_URL || '/api';

export function getApiUrl(path = '') {
  const normalizedBase = defaultBase.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export async function apiRequest(path, { method = 'GET', body, headers = {}, ...options } = {}) {
  const response = await fetch(getApiUrl(path), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}
