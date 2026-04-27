import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { backlinks, HttpError } from '../lib/api';

interface Props {
  // 当前 doc path（已规范化）
  path: string;
  // 父组件 doc 内容变化后递增 refreshKey 触发重查
  refreshKey?: number;
}

export default function BacklinksPanel({ path, refreshKey = 0 }: Props) {
  const [items, setItems] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setItems(null);
    setError(null);
    backlinks.of(path)
      .then((r) => setItems(r.backlinks))
      .catch((e) => setError(e instanceof HttpError ? e.message : '加载失败'));
  }, [path, refreshKey]);

  return (
    <section className="mt-12 border-t border-border pt-6 text-sm">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-muted hover:text-fg transition"
      >
        <span className={`transition ${open ? 'rotate-90' : ''}`}>›</span>
        反向链接
        {items && items.length > 0 && (
          <span className="text-xs text-accent">· {items.length}</span>
        )}
      </button>

      {open && (
        <div className="mt-3 pl-5">
          {error && (
            <p className="text-red-700 dark:text-red-400 text-xs">{error}</p>
          )}
          {!error && items === null && (
            <p className="text-muted text-xs">加载中…</p>
          )}
          {items && items.length === 0 && (
            <p className="text-muted text-xs">还没有文档引用此页。</p>
          )}
          {items && items.length > 0 && (
            <ul className="space-y-1">
              {items.map((src) => (
                <li key={src}>
                  <Link
                    to={`/d/${src}`}
                    className="text-accent hover:underline font-mono text-xs"
                  >
                    {src}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
