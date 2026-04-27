import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { docs, share, HttpError } from '../lib/api';

export default function DocView() {
  const location = useLocation();
  const navigate = useNavigate();

  // /d/<path...>，path 可能包含多段
  // location.pathname 形如 "/d/bob/notes.md"，去掉 "/d/" 前缀即为 doc path
  const path = decodeURIComponent(location.pathname.replace(/^\/d\//, ''));

  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);

  useEffect(() => {
    setContent(null);
    setError(null);
    setShareUrl(null);
    docs.read(path)
      .then((r) => setContent(r.content))
      .catch((e) => {
        if (e instanceof HttpError) setError(e.message);
        else setError('加载失败');
      });
  }, [path]);

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

  if (error) {
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
      <div className="flex items-center justify-between mb-6 text-sm">
        <Link to="/" className="text-muted hover:text-fg transition">
          ← 文档列表
        </Link>
        <div className="flex items-center gap-3">
          <code className="text-xs text-muted font-mono">{path}</code>
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
          <span className="text-muted mr-2">分享链接已复制到剪贴板：</span>
          <a href={shareUrl} target="_blank" rel="noreferrer"
             className="text-accent hover:underline">
            {shareUrl}
          </a>
        </div>
      )}

      {content === null ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-8 bg-card border border-border rounded w-2/3" />
          <div className="h-4 bg-card border border-border rounded w-full" />
          <div className="h-4 bg-card border border-border rounded w-5/6" />
          <div className="h-4 bg-card border border-border rounded w-full" />
        </div>
      ) : (
        <article className="prose prose-stone dark:prose-invert max-w-none
                            prose-headings:font-sans prose-a:text-accent
                            prose-code:font-mono prose-code:text-accent
                            prose-code:before:content-none prose-code:after:content-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </article>
      )}
    </div>
  );
}
