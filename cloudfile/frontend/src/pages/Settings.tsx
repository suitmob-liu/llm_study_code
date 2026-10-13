import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  share, mcp_tokens,
  HttpError,
  type ShareSummary, type McpTokenSummary,
} from '../lib/api';

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

// ---------- 分享区块 ----------
function SharesSection() {
  const [items, setItems] = useState<ShareSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const r = await share.listMine();
      setItems(r.shares);
    } catch (e) {
      setError(e instanceof HttpError ? e.message : '加载失败');
    }
  };

  useEffect(() => { load(); }, []);

  const handleRevoke = async (id: number) => {
    if (!window.confirm('撤销后该分享链接立即失效。继续？')) return;
    try {
      await share.revoke(id);
      await load();
    } catch (e) {
      alert(e instanceof HttpError ? e.message : '撤销失败');
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-base font-medium">分享链接</h2>
      <p className="text-sm text-muted">
        你创建的所有公共分享。token 明文只在创建时返回一次，
        遗失只能撤销旧的、再创建新的。
      </p>
      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      {items === null && !error && <p className="text-sm text-muted">加载中…</p>}
      {items && items.length === 0 && (
        <p className="text-sm text-muted">还没有分享。打开任意文档点"分享"按钮创建。</p>
      )}
      {items && items.length > 0 && (
        <div className="border border-border rounded-lg bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted bg-bg/40">
              <tr>
                <th className="text-left px-3 py-2 font-normal">文档</th>
                <th className="text-left px-3 py-2 font-normal">状态</th>
                <th className="text-left px-3 py-2 font-normal">创建</th>
                <th className="text-left px-3 py-2 font-normal">过期</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-2">
                    <Link to={`/d/${s.path}`} className="font-mono text-xs
                                                        text-accent hover:underline">
                      {s.path}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span className={s.status === 'active'
                                       ? 'text-accent' : 'text-muted line-through'}>
                      {s.status === 'active' ? '生效' : '已撤销'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted text-xs">
                    {formatTime(s.created_at)}
                  </td>
                  <td className="px-3 py-2 text-muted text-xs">
                    {s.expires_at ? formatTime(s.expires_at) : '永不过期'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {s.status === 'active' && (
                      <button
                        onClick={() => handleRevoke(s.id)}
                        className="text-xs text-muted hover:text-red-700
                                   dark:hover:text-red-400 transition"
                      >
                        撤销
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------- MCP token 区块 ----------
function McpTokensSection() {
  const [items, setItems] = useState<McpTokenSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [justCreatedToken, setJustCreatedToken] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const r = await mcp_tokens.listMine();
      setItems(r.tokens);
    } catch (e) {
      setError(e instanceof HttpError ? e.message : '加载失败');
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const r = await mcp_tokens.create(newName.trim());
      setJustCreatedToken(r.token);
      setShowCreate(false);
      setNewName('');
      await load();
    } catch (e) {
      alert(e instanceof HttpError ? e.message : '创建失败');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (id: number) => {
    if (!window.confirm('撤销后该 token 立即失效。继续？')) return;
    try {
      await mcp_tokens.revoke(id);
      await load();
    } catch (e) {
      alert(e instanceof HttpError ? e.message : '撤销失败');
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium">MCP token</h2>
        <button
          onClick={() => { setShowCreate(true); setJustCreatedToken(null); }}
          className="text-sm px-3 py-1 bg-accent text-bg rounded hover:opacity-90 transition"
        >
          + 新建
        </button>
      </div>
      <p className="text-sm text-muted">
        给 cloudfile_mcp 进程认证用。一个 token 标识一台机器/客户端，
        revoke 即让该机器立即失效。
      </p>

      {justCreatedToken && (
        <div className="px-4 py-3 bg-accent/10 border border-accent/40
                        rounded text-sm space-y-2">
          <p className="text-fg">
            <strong>token 仅本次显示</strong>。复制走，丢了只能重发。
          </p>
          <code className="block bg-bg/60 px-2 py-1.5 rounded font-mono text-xs
                           break-all">{justCreatedToken}</code>
          <p className="text-xs text-muted">
            在 cloudfile_mcp 启动环境中：
            <code className="font-mono ml-1">export CLOUDFILE_MCP_TOKEN={'<token>'}</code>
          </p>
          <button
            onClick={() => setJustCreatedToken(null)}
            className="text-xs text-muted hover:text-fg transition"
          >
            我已记下，关闭
          </button>
        </div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="flex gap-2 items-center">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="名字（如 'macbook'）"
            autoFocus
            className="flex-1 max-w-xs bg-bg border border-border rounded px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={busy || !newName.trim()}
            className="px-3 py-1.5 text-sm bg-accent text-bg rounded
                       hover:opacity-90 disabled:opacity-50 transition"
          >
            创建
          </button>
          <button
            type="button"
            onClick={() => { setShowCreate(false); setNewName(''); }}
            className="px-3 py-1.5 text-sm text-muted hover:text-fg transition"
          >
            取消
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      {items === null && !error && <p className="text-sm text-muted">加载中…</p>}
      {items && items.length === 0 && !showCreate && (
        <p className="text-sm text-muted">还没有 token。点上方"+ 新建"创建一个。</p>
      )}
      {items && items.length > 0 && (
        <div className="border border-border rounded-lg bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted bg-bg/40">
              <tr>
                <th className="text-left px-3 py-2 font-normal">名字</th>
                <th className="text-left px-3 py-2 font-normal">状态</th>
                <th className="text-left px-3 py-2 font-normal">创建</th>
                <th className="text-left px-3 py-2 font-normal">最后使用</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((t) => (
                <tr key={t.id}>
                  <td className="px-3 py-2 font-mono text-xs">{t.name}</td>
                  <td className="px-3 py-2">
                    <span className={t.status === 'active'
                                       ? 'text-accent' : 'text-muted line-through'}>
                      {t.status === 'active' ? '生效' : '已撤销'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted text-xs">
                    {formatTime(t.created_at)}
                  </td>
                  <td className="px-3 py-2 text-muted text-xs">
                    {formatTime(t.last_used_at)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {t.status === 'active' && (
                      <button
                        onClick={() => handleRevoke(t.id)}
                        className="text-xs text-muted hover:text-red-700
                                   dark:hover:text-red-400 transition"
                      >
                        撤销
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function Settings() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-8 space-y-12">
      <div className="flex items-center gap-3 text-sm">
        <Link to="/" className="text-muted hover:text-fg transition">
          ← 文档列表
        </Link>
        <span className="text-fg font-medium ml-auto">设置</span>
      </div>

      <SharesSection />
      <McpTokensSection />
    </div>
  );
}
