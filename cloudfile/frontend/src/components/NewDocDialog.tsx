import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { docs, HttpError } from '../lib/api';

interface Props {
  username: string;
  onClose: () => void;
}

export default function NewDocDialog({ username, onClose }: Props) {
  const navigate = useNavigate();
  const [path, setPath] = useState(`${username}/`);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    // 把光标放到末尾，跳过 username/ 前缀
    inputRef.current?.setSelectionRange(path.length, path.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    let p = path.trim();
    if (!p.endsWith('.md')) p += '.md';

    try {
      // 先检查是否已存在——如果在直接打开就好，不覆盖
      try {
        await docs.read(p);
        navigate(`/d/${p}?edit=1`);
        return;
      } catch (e) {
        if (!(e instanceof HttpError && e.status === 404)) throw e;
        // 404 → 真不存在，正常往下走 PUT
      }

      // 用 frontmatter-less 模板：标题取 path 的 basename
      const base = p.split('/').pop()!.replace(/\.md$/, '');
      const initial = `# ${base}\n\n`;
      await docs.write(p, initial);
      navigate(`/d/${p}?edit=1`);
    } catch (e) {
      if (e instanceof HttpError) setError(e.message);
      else setError('创建失败，稍后再试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-fg/30 flex items-center justify-center
                 px-4 z-50"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-card border border-border rounded-lg
                   p-5 shadow-lg space-y-4"
      >
        <h3 className="font-semibold">新建文档</h3>
        <label className="block">
          <span className="text-sm text-muted">路径（含 .md 可选，自动补）</span>
          <input
            ref={inputRef}
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder={`${username}/notes.md`}
            className="mt-1 block w-full bg-bg border border-border rounded
                       px-3 py-2 text-fg focus:border-accent transition font-mono text-sm"
          />
          <span className="text-xs text-muted mt-1 block">
            限你自己目录（<code>{username}/</code>）或 <code>shared/</code>
          </span>
        </label>

        {error && (
          <div className="text-sm text-red-700 dark:text-red-400">{error}</div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-muted hover:text-fg transition"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={busy || path.trim().length === 0}
            className="px-3 py-1.5 text-sm bg-accent text-bg rounded
                       hover:opacity-90 disabled:opacity-50 transition"
          >
            {busy ? '创建中…' : '创建并编辑'}
          </button>
        </div>
      </form>
    </div>
  );
}
