import { useState } from 'react';
import { apiLogin, apiRegister } from '../lib/auth';
import { useApp } from '../lib/store';
import { IconCheck } from './Icons';

export function AuthBody({
  mode,
  onClose,
}: {
  mode: 'login' | 'register';
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'login' | 'register'>(mode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const signIn = useApp((s) => s.signIn);
  const notify = useApp((s) => s.notify);

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
      const auth =
        tab === 'login'
          ? await apiLogin(username.trim(), password)
          : await apiRegister(username.trim(), password);
      await signIn(auth);
      notify(tab === 'login' ? `欢迎回来，${auth.user.username}` : `账号已创建：${auth.user.username}`);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="sheet__title">{tab === 'login' ? '登录' : '注册'}</div>
      <div className="sheet__desc">
        登录后记录会归到你的账号下并在各设备之间同步；未登录时所有内容只保存在这台设备。
      </div>

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

      <div className="sheet__body">
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

        <div className="auth-note">
          <IconCheck width={13} height={13} />
          这台设备上未登录时写的记录，会在登录后自动并入该账号，不会丢。
        </div>
      </div>

      <div className="sheet__actions">
        <button className="btn btn--ghost" onClick={onClose} disabled={busy}>
          取消
        </button>
        <button className="btn btn--primary" onClick={() => void submit()} disabled={busy}>
          {busy ? '处理中…' : tab === 'login' ? '登录' : '创建账号'}
        </button>
      </div>
    </>
  );
}
