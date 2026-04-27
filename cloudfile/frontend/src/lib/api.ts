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

// ---- Search ----
export const search_api = {
  query: (q: string, limit = 20) =>
    request<{
      query: string;
      hits: { path: string; title: string; snippet: string; rank: number }[];
    }>('GET', `/api/search?q=${encodeURIComponent(q)}&limit=${limit}`),
};

// ---- Backlinks ----
export const backlinks = {
  of: (path: string) =>
    request<{ path: string; backlinks: string[] }>(
      'GET', `/api/backlinks/${encodePath(path)}`,
    ),
};

// ---- Share ----
export interface ShareSummary {
  id: number;
  path: string;
  status: 'active' | 'revoked';
  created_at: string;
  expires_at: string | null;
}

export const share = {
  create: (path: string, lifetime_days?: number) =>
    request<{
      id: number; path: string; token: string;
      share_url: string; expires_at: string | null;
    }>(
      'POST', `/api/docs/${encodePath(path)}/share`,
      lifetime_days !== undefined ? { lifetime_days } : {},
    ),
  listMine: () => request<{ shares: ShareSummary[] }>('GET', '/api/me/shares'),
  revoke: (id: number) =>
    request<{ status: string }>('DELETE', `/api/shares/${id}`),
};

// ---- MCP tokens（自助管理）----
export interface McpTokenSummary {
  id: number;
  name: string;
  status: 'active' | 'revoked';
  created_at: string;
  last_used_at: string | null;
}

export const mcp_tokens = {
  listMine: () => request<{ tokens: McpTokenSummary[] }>('GET', '/api/me/mcp-tokens'),
  create: (name: string) =>
    request<{
      id: number; name: string; token: string;
      status: string; created_at: string;
    }>('POST', '/api/me/mcp-tokens', { name }),
  revoke: (id: number) =>
    request<{ status: string }>('DELETE', `/api/mcp-tokens/${id}`),
};

export { HttpError };
