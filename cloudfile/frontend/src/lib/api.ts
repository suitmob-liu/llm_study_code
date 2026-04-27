import type { ApiError, DocContent, DocMeta, User } from './types';

class HttpError extends Error implements ApiError {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'HttpError';
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  const resp = await fetch(path, init);

  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try {
      const j = await resp.json();
      if (j && typeof j.error === 'string') msg = j.error;
    } catch { /* not JSON */ }
    throw new HttpError(resp.status, msg);
  }

  // 204 / empty
  const ct = resp.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return undefined as T;
  return (await resp.json()) as T;
}

// path 必须 URL-encode 每段（保留 /）
function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

// ---- Auth ----
export const auth = {
  me: () => request<{ user: User }>('GET', '/api/me'),
  login: (login: string, password: string) =>
    request<{ user: User }>('POST', '/api/login', { login, password }),
  logout: () => request<{ status: string }>('POST', '/api/logout'),
};

// ---- Docs ----
export const docs = {
  list: () => request<{ docs: DocMeta[] }>('GET', '/api/docs'),
  read: (path: string) =>
    request<DocContent>('GET', `/api/docs/${encodePath(path)}`),
  write: (path: string, content: string) =>
    request<{ path: string; created: boolean }>(
      'PUT', `/api/docs/${encodePath(path)}`, { content },
    ),
  remove: (path: string) =>
    request<{ status: string }>('DELETE', `/api/docs/${encodePath(path)}`),
};

// ---- Share ----
export const share = {
  create: (path: string, lifetime_days?: number) =>
    request<{
      id: number; path: string; token: string;
      share_url: string; expires_at: string | null;
    }>(
      'POST', `/api/docs/${encodePath(path)}/share`,
      lifetime_days !== undefined ? { lifetime_days } : {},
    ),
};

export { HttpError };
