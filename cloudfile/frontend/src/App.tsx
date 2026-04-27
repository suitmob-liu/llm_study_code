import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { auth, HttpError } from './lib/api';
import type { User } from './lib/types';
import Login from './pages/Login';
import DocList from './pages/DocList';
import DocView from './pages/DocView';
import Settings from './pages/Settings';
import Layout from './components/Layout';

type AuthState =
  | { kind: 'loading' }
  | { kind: 'guest' }
  | { kind: 'logged_in'; user: User };

export default function App() {
  const [state, setState] = useState<AuthState>({ kind: 'loading' });

  useEffect(() => {
    auth.me()
      .then((r) => setState({ kind: 'logged_in', user: r.user }))
      .catch((e) => {
        if (e instanceof HttpError && e.status === 401) {
          setState({ kind: 'guest' });
        } else {
          // 网络错或服务异常——按未登录处理，让用户先看 login 页
          console.error('me() failed', e);
          setState({ kind: 'guest' });
        }
      });
  }, []);

  if (state.kind === 'loading') {
    return (
      <div className="min-h-screen grid place-items-center text-muted">
        <span className="text-sm">加载中…</span>
      </div>
    );
  }

  const handleLoggedIn = (user: User) => setState({ kind: 'logged_in', user });
  const handleLogout = () => setState({ kind: 'guest' });

  if (state.kind === 'guest') {
    return (
      <Routes>
        <Route path="/login" element={<Login onLoggedIn={handleLoggedIn} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // logged_in
  return (
    <Layout user={state.user} onLogout={handleLogout}>
      <Routes>
        <Route path="/" element={<DocList />} />
        <Route path="/d/*" element={<DocView />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
