import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, HttpError } from '../lib/api';
import type { User } from '../lib/types';

interface Props {
  onLoggedIn: (user: User) => void;
}

export default function Login({ onLoggedIn }: Props) {
  const navigate = useNavigate();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await auth.login(login, password);
      onLoggedIn(r.user);
      navigate('/', { replace: true });
    } catch (e) {
      if (e instanceof HttpError) setError(e.message);
      else setError('网络错误，稍后再试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center px-5">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-card border border-border rounded-lg
                   p-6 shadow-sm space-y-4"
      >
        <div>
          <h1 className="text-2xl font-semibold text-accent">cloudfile</h1>
          <p className="text-sm text-muted mt-1">登录到你的笔记空间</p>
        </div>

        <label className="block">
          <span className="text-sm text-muted">用户名 / 邮箱</span>
          <input
            type="text"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            required
            autoComplete="username"
            className="mt-1 block w-full bg-bg border border-border rounded
                       px-3 py-2 text-fg focus:border-accent transition"
          />
        </label>

        <label className="block">
          <span className="text-sm text-muted">密码</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="mt-1 block w-full bg-bg border border-border rounded
                       px-3 py-2 text-fg focus:border-accent transition"
          />
        </label>

        {error && (
          <div className="text-sm text-red-700 dark:text-red-400 bg-red-100/50
                          dark:bg-red-950/30 border border-red-200 dark:border-red-900
                          rounded px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-accent text-bg font-medium rounded
                     py-2 hover:opacity-90 disabled:opacity-50 transition"
        >
          {busy ? '登录中…' : '登录'}
        </button>

        <p className="text-xs text-muted text-center">
          没有账号？联系管理员发邀请链接
        </p>
      </form>
    </div>
  );
}
