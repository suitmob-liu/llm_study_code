import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { docs, HttpError } from '../lib/api';
import type { DocMeta } from '../lib/types';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  // backend 返回 ISO 8601 UTC，例如 2026-04-27T03:12:25Z
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function DocList() {
  const [items, setItems] = useState<DocMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    docs.list()
      .then((r) => setItems(r.docs))
      .catch((e) => setError(e instanceof HttpError ? e.message : '加载失败'));
  }, []);

  if (error) {
    return (
      <div className="max-w-reading mx-auto px-5 py-12 text-red-700 dark:text-red-400">
        {error}
      </div>
    );
  }

  if (items === null) {
    return (
      <div className="max-w-reading mx-auto px-5 py-12">
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-card border border-border rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-reading mx-auto px-5 py-16 text-center">
        <h2 className="text-xl font-medium">还没有文档</h2>
        <p className="text-muted mt-2 text-sm">
          编辑器在 Phase 2d-3 上线。当前版本可通过 API 或 MCP 写入。
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-reading mx-auto px-5 py-8">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-medium">最近编辑</h2>
        <span className="text-xs text-muted">{items.length} 篇</span>
      </div>
      <ul className="divide-y divide-border border border-border rounded-lg
                     bg-card overflow-hidden">
        {items.map((d) => (
          <li key={d.path}>
            <Link
              to={`/d/${d.path}`}
              className="flex items-center px-4 py-3 hover:bg-accent/5 transition"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{d.path}</div>
                <div className="text-xs text-muted mt-0.5">
                  {formatTime(d.modified_at)} · {formatBytes(d.size_bytes)}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
