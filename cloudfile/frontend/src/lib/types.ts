// 与 backend JSON 格式对齐
export interface User {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
  created_at: string;
}

export interface DocMeta {
  path: string;
  size_bytes: number;
  modified_at: string;
}

export interface DocContent {
  path: string;
  content: string;
}

export interface SearchHit {
  path: string;
  title: string;
  snippet: string;
  rank: number;
}

export interface ApiError extends Error {
  status: number;
}
