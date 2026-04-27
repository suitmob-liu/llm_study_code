import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { auth, docs, HttpError } from '../lib/api';
import type { DocMeta, User } from '../lib/types';
import NewDocDialog from '../components/NewDocDialog';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function DocList() {
  const [items, setItems] = useState<DocMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);

  useEffect(() => {
    docs.list()
      .then((r) => setItems(r.docs))
      .catch((e) => setError(e instanceof HttpError ? e.message : '加载失败'));
    auth.me()
      .then((r) => setUser(r.user))
      .catch(() => { /* layout 已经处理；这里仅用于新建对话框默认前缀 */ });
  }, []);

  if (error) {
    return (
      <div className="max-w-reading mx-auto px-5 py-12 text-red-700 dark:text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="max-w-reading mx-auto px-5 py-8">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-medium">最近编辑</h2>
        <div className="flex items-center gap-3">
          {items && (
            <span className="text-xs text-muted">{items.length} 篇</span>
          )}
          <button
            onClick={() => setShowNewDialog(true)}
            disabled={!user}
            className="text-sm px-3 py-1 bg-accent text-bg rounded
                       hover:opacity-90 disabled:opacity-50 transition"
          >
            + 新建
          </button>
        </div>
      </div>

      {items === null ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-card border border-border rounded" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center">
          <h3 className="text-base font-medium">还没有文档</h3>
          <p className="text-muted mt-2 text-sm">
            点右上 <span className="text-accent">+ 新建</span> 写第一篇，
            支持 <code className="font-mono text-xs">[[wiki link]]</code> 跨文档跳转。
          </p>
        </div>
      ) : (
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
      )}

      {showNewDialog && user && (
        <NewDocDialog
          username={user.username}
          onClose={() => setShowNewDialog(false)}
        />
      )}
    </div>
  );
}
