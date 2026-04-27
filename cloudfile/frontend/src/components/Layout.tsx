import { Link, useNavigate } from 'react-router-dom';
import { auth } from '../lib/api';
import type { User } from '../lib/types';

interface Props {
  user: User;
  onLogout: () => void;
  children: React.ReactNode;
}

export default function Layout({ user, onLogout, children }: Props) {
  const navigate = useNavigate();
  const handleLogout = async () => {
    try { await auth.logout(); } catch { /* 幂等，忽略 */ }
    onLogout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center gap-4">
          <Link to="/" className="font-semibold text-accent text-lg">
            cloudfile
          </Link>
          <span className="text-muted text-sm hidden sm:inline">
            自托管 AI-first 文档系统
          </span>
          <div className="flex-1" />
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
    </div>
  );
}
