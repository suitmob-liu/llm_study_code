import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { search_api, HttpError } from '../lib/api';

interface Hit {
  path: string;
  title: string;
  snippet: string;
  rank: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SearchModal({ open, onClose }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // 打开时清状态 + 聚焦
  useEffect(() => {
    if (open) {
      setQuery('');
      setHits([]);
      setError(null);
      setActiveIdx(0);
      // 让 modal 渲染完成再聚焦
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  // debounce 查询
  useEffect(() => {
    if (!open) return;
    if (query.trim().length === 0) {
      setHits([]);
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const r = await search_api.query(query.trim(), 20);
        if (ctrl.signal.aborted) return;
        setHits(r.hits);
        setActiveIdx(0);
        setError(null);
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setError(e instanceof HttpError ? e.message : '搜索失败');
        setHits([]);
      } finally {
        if (!ctrl.signal.aborted) setBusy(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, open]);

  // 键盘：esc 关，↑↓ 选，Enter 跳
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, hits.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && hits[activeIdx]) {
        e.preventDefault();
        navigate(`/d/${hits[activeIdx].path}`);
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, hits, activeIdx, navigate, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-fg/30 flex items-start justify-center
                 px-4 pt-[15vh] z-50"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-card border border-border rounded-lg
                   shadow-2xl overflow-hidden"
      >
        <div className="border-b border-border p-3 flex items-center gap-2">
          <span className="text-muted text-sm">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索文档（中英文都吃 trigram 分词）…"
            className="flex-1 bg-transparent outline-none text-fg placeholder:text-muted"
          />
          <kbd className="text-xs text-muted bg-bg border border-border
                          rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {error && (
            <p className="px-4 py-3 text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          )}
          {!error && busy && hits.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted">搜索中…</p>
          )}
          {!error && !busy && query.trim() && hits.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted">
              没有找到 <code className="font-mono">{query}</code> 的结果
            </p>
          )}
          {!error && hits.length > 0 && (
            <ul>
              {hits.map((h, i) => (
                <li key={h.path}>
                  <button
                    onClick={() => {
                      navigate(`/d/${h.path}`);
                      onClose();
                    }}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={`w-full text-left px-4 py-3 transition border-l-2 ${
                      i === activeIdx
                        ? 'bg-accent/10 border-accent'
                        : 'border-transparent hover:bg-accent/5'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium truncate">{h.title}</span>
                      <code className="text-xs text-muted font-mono shrink-0">
                        {h.path}
                      </code>
                    </div>
                    {/* snippet 含 backend 给的 <mark> 标签，dangerouslySetInnerHTML */}
                    <div
                      className="text-sm text-muted mt-1
                                 [&_mark]:bg-accent/20 [&_mark]:text-fg
                                 [&_mark]:px-0.5 [&_mark]:rounded"
                      dangerouslySetInnerHTML={{ __html: h.snippet }}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border px-3 py-2 text-xs text-muted
                        flex items-center gap-3">
          <span><kbd className="font-mono">↑↓</kbd> 选</span>
          <span><kbd className="font-mono">↵</kbd> 打开</span>
          <span><kbd className="font-mono">Esc</kbd> 关闭</span>
        </div>
      </div>
    </div>
  );
}
