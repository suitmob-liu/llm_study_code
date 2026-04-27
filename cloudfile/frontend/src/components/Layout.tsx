import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth } from '../lib/api';
import type { User } from '../lib/types';
import SearchModal from './SearchModal';

interface Props {
  user: User;
  onLogout: () => void;
  children: React.ReactNode;
}

export default function Layout({ user, onLogout, children }: Props) {
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);

  // 全局 Cmd/Ctrl+K 打开搜索
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleLogout = async () => {
    try { await auth.logout(); } catch { /* 幂等，忽略 */ }
    onLogout();
    navigate('/login', { replace: true });
  };

  // 检测平台决定提示 ⌘ vs Ctrl
  const isMac = typeof navigator !== 'undefined'
    && /(Mac|iPad|iPhone)/.test(navigator.platform);
  const cmdLabel = isMac ? '⌘' : 'Ctrl';

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center gap-4">
          <Link to="/" className="font-semibold text-accent text-lg">
            cloudfile
          </Link>

          {/* 搜索按钮 */}
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden sm:flex items-center gap-2 text-sm text-muted
                       bg-bg/60 border border-border rounded px-3 py-1
                       hover:border-accent/50 transition w-64"
          >
            <span>🔍</span>
            <span className="flex-1 text-left">搜索文档…</span>
            <kbd className="text-xs bg-card border border-border rounded
                            px-1.5 py-0.5 font-mono">{cmdLabel}K</kbd>
          </button>

          <div className="flex-1" />

          <Link
            to="/settings"
            className="text-sm text-muted hover:text-fg transition"
            title="设置"
          >
            ⚙
          </Link>
          <span className="text-sm text-muted">
            <span className="text-fg">{user.username}</span>
            {user.is_admin && (
              <span className="ml-2 text-xs bg-accent/15 text-accent
                              px-1.5 py-0.5 rounded">admin</span>
            )}
          </span>
          <button
            onClick={handleLogout}
            className="text-sm text-muted hover:text-fg transition"
          >
            退出
          </button>
        </div>
      </header>
      <main className="flex-1">{children}</main>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
