import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { docs, share, HttpError } from '../lib/api';
import { preprocessWikiLinks } from '../lib/wikilinks';
import Editor from '../components/Editor';
import BacklinksPanel from '../components/BacklinksPanel';

type Mode = 'read' | 'edit';

export default function DocView() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const path = decodeURIComponent(location.pathname.replace(/^\/d\//, ''));

  const [content, setContent] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(searchParams.get('edit') === '1' ? 'edit' : 'read');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [refreshKey, setRefreshKey] = useState(0);

  // path 变化或首次加载：拉内容
  useEffect(() => {
    setContent(null);
    setError(null);
    setShareUrl(null);
    setSavingState('idle');
    docs.read(path)
      .then((r) => {
        setContent(r.content);
        setDraft(r.content);
      })
      .catch((e) => setError(e instanceof HttpError ? e.message : '加载失败'));
  }, [path]);

  // 进入 edit 模式时清掉 ?edit 参数（避免刷新时一直处于 edit）
  useEffect(() => {
    if (mode === 'edit' && searchParams.get('edit') === '1') {
      const next = new URLSearchParams(searchParams);
      next.delete('edit');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const dirty = mode === 'edit' && draft !== content;

  // 切换路由前提醒未保存
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const renderedMarkdown = useMemo(
    () => preprocessWikiLinks(content ?? '', path),
    [content, path],
  );

  const handleShare = async () => {
    setShareBusy(true);
    try {
      const r = await share.create(path);
      setShareUrl(r.share_url);
      try { await navigator.clipboard.writeText(r.share_url); } catch { /* ok */ }
    } catch (e) {
      setError(e instanceof HttpError ? e.message : '创建分享失败');
    } finally {
      setShareBusy(false);
    }
  };

  const handleSave = async () => {
    if (!dirty) return;
    setSavingState('saving');
    try {
      await docs.write(path, draft);
      setContent(draft);
      setSavingState('saved');
      setRefreshKey((k) => k + 1);   // 触发 backlinks 重查
      setTimeout(() => setSavingState('idle'), 1500);
    } catch (e) {
      setError(e instanceof HttpError ? e.message : '保存失败');
      setSavingState('idle');
    }
  };

  const handleCancelEdit = () => {
    if (dirty && !window.confirm('改动未保存，确认丢弃？')) return;
    setDraft(content ?? '');
    setMode('read');
  };

  if (error && content === null) {
    return (
      <div className="max-w-reading mx-auto px-5 py-12">
        <button onClick={() => navigate(-1)} className="text-sm text-muted">
          ← 返回
        </button>
        <div className="mt-4 text-red-700 dark:text-red-400">{error}</div>
      </div>
    );
  }

  return (
    <div className="max-w-reading mx-auto px-5 py-8">
      {/* 顶部工具条 */}
      <div className="flex items-center justify-between mb-6 text-sm gap-3 flex-wrap">
        <Link to="/" className="text-muted hover:text-fg transition">
          ← 文档列表
        </Link>

        <code className="text-xs text-muted font-mono truncate flex-1
                         text-center min-w-0">
          {path}
        </code>

        <div className="flex items-center gap-2">
          {/* mode toggle */}
          <div className="inline-flex rounded border border-border overflow-hidden text-xs">
            <button
              onClick={() => setMode('read')}
              className={`px-2 py-1 transition ${
                mode === 'read'
                  ? 'bg-accent text-bg'
                  : 'bg-card hover:bg-accent/10'
              }`}
            >
              阅读
            </button>
            <button
              onClick={() => setMode('edit')}
              className={`px-2 py-1 transition ${
                mode === 'edit'
                  ? 'bg-accent text-bg'
                  : 'bg-card hover:bg-accent/10'
              }`}
            >
              编辑
            </button>
          </div>

          <button
            onClick={handleShare}
            disabled={shareBusy}
            className="text-xs px-2 py-1 border border-border rounded
                       hover:bg-accent/5 disabled:opacity-50 transition"
          >
            {shareBusy ? '创建中…' : '分享'}
          </button>
        </div>
      </div>

      {shareUrl && (
        <div className="mb-6 px-4 py-3 bg-accent/10 border border-accent/30
                        rounded text-sm break-all">
          <span className="text-muted mr-2">链接已复制到剪贴板：</span>
          <a href={shareUrl} target="_blank" rel="noreferrer"
             className="text-accent hover:underline">
            {shareUrl}
          </a>
        </div>
      )}

      {error && content !== null && (
        <div className="mb-4 text-sm text-red-700 dark:text-red-400">{error}</div>
      )}

      {/* 主体 */}
      {content === null ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-8 bg-card border border-border rounded w-2/3" />
          <div className="h-4 bg-card border border-border rounded w-full" />
          <div className="h-4 bg-card border border-border rounded w-5/6" />
        </div>
      ) : mode === 'read' ? (
        <article className="prose prose-stone dark:prose-invert max-w-none
                            prose-headings:font-sans prose-a:text-accent
                            prose-code:font-mono prose-code:text-accent
                            prose-code:before:content-none prose-code:after:content-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{renderedMarkdown}</ReactMarkdown>
        </article>
      ) : (
        <>
          {/* key={path} 切文档时强制重建编辑器，避免遗留状态 */}
          <Editor key={path} initialContent={content} onChange={setDraft} />
          <div className="flex items-center justify-end gap-2 mt-4 text-sm">
            <span className="text-muted text-xs mr-auto">
              {savingState === 'saving' && '保存中…'}
              {savingState === 'saved' && '已保存 ✓'}
              {savingState === 'idle' && dirty && '未保存改动'}
            </span>
            <button
              onClick={handleCancelEdit}
              className="px-3 py-1.5 text-muted hover:text-fg transition"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={!dirty || savingState === 'saving'}
              className="px-3 py-1.5 bg-accent text-bg rounded
                         hover:opacity-90 disabled:opacity-50 transition"
            >
              保存（git commit）
            </button>
          </div>
        </>
      )}

      {content !== null && mode === 'read' && (
        <BacklinksPanel path={path} refreshKey={refreshKey} />
      )}
    </div>
  );
}
