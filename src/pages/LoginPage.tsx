import { useEffect, useState } from 'react';
import { apiLogin, apiRegister } from '../lib/auth';
import { navigate } from '../lib/router';
import { useApp } from '../lib/store';
import { BrandGlyph } from '../components/Icons';

/** 独立登录页：/login */
export function LoginPage() {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const auth = useApp((s) => s.auth);
  const ready = useApp((s) => s.ready);
  const signIn = useApp((s) => s.signIn);
  const notify = useApp((s) => s.notify);

  // 已登录就不该停在这里
  useEffect(() => {
    if (ready && auth) navigate('/', true);
  }, [ready, auth]);

  const submit = async () => {
    if (busy) return;
    setError('');
    if (username.trim().length < 2) {
      setError('用户名至少 2 个字符');
      return;
    }
    if (password.length < 6) {
      setError('密码至少 6 位');
      return;
    }
    setBusy(true);
    try {
      const result =
        tab === 'login'
          ? await apiLogin(username.trim(), password)
          : await apiRegister(username.trim(), password);
      await signIn(result);
      notify(tab === 'login' ? `欢迎回来，${result.user.username}` : `账号已创建：${result.user.username}`);
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page__card">
        <div className="page__brand">
          <div className="brand__mark">
            <BrandGlyph width={18} height={18} />
          </div>
          <div>
            <div className="brand__name">随手记</div>
            <div className="brand__sub">像发消息一样</div>
          </div>
        </div>

        <h1 className="page__title">{tab === 'login' ? '登录' : '注册'}</h1>
        <p className="page__desc">
          登录后记录会归到你的账号下，在每台设备之间同步，也可以和群里的人共享。
          不登录也能用，内容只留在本机。
        </p>

        <div className="auth-tabs">
          <button
            className="auth-tab"
            data-active={tab === 'login'}
            onClick={() => {
              setTab('login');
              setError('');
            }}
          >
            登录
          </button>
          <button
            className="auth-tab"
            data-active={tab === 'register'}
            onClick={() => {
              setTab('register');
              setError('');
            }}
          >
            注册
          </button>
        </div>

        <div className="field">
          <span className="field__label">用户名</span>
          <input
            className="field__input"
            autoFocus
            value={username}
            autoComplete="username"
            placeholder="2–24 位，中英文/数字/下划线"
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
          />
        </div>

        <div className="field">
          <span className="field__label">密码</span>
          <input
            className="field__input"
            type="password"
            value={password}
            autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
            placeholder="至少 6 位"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
          />
        </div>

        {error ? <div className="auth-error">{error}</div> : null}

        <button className="btn btn--primary btn--block" onClick={() => void submit()} disabled={busy}>
          {busy ? '处理中…' : tab === 'login' ? '登录' : '创建账号'}
        </button>

        <div className="page__foot">
          <button className="text-link" onClick={() => navigate('/')}>
            先不登录，直接用
          </button>
          <span className="page__hint">
            本机未登录时写的记录，会在登录后自动并入该账号
          </span>
        </div>
      </div>
    </div>
  );
}
