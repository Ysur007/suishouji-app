import { useMemo, useState } from 'react';
import { navigate } from '../lib/router';
import { apiBase, defaultApiBase, setApiBase } from '../lib/endpoint';
import { liveMemos, useApp } from '../lib/store';
import { IconChevron, IconDevice, IconUser, IconUsers } from '../components/Icons';
import { SyncBadge } from '../components/SyncBadge';

/** 账号页：/account */
export function AccountPage() {
  const auth = useApp((s) => s.auth);
  const user = useApp((s) => s.user);
  const lastUser = useApp((s) => s.lastUser);
  const viewBucket = useApp((s) => s.viewBucket);
  const deviceName = useApp((s) => s.deviceName);
  const groups = useApp((s) => s.groups);
  const memos = useApp((s) => s.memos);
  const signOut = useApp((s) => s.signOut);
  const clearCache = useApp((s) => s.clearCache);
  const setActiveSpace = useApp((s) => s.setActiveSpace);

  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [endpoint, setEndpoint] = useState(() => apiBase() || defaultApiBase());
  const shellMode = Boolean(defaultApiBase()) || Boolean(apiBase());

  const list = useMemo(
    () => Object.values(groups).sort((a, b) => a.createdAt - b.createdAt),
    [groups],
  );
  const countOf = (space: string) =>
    liveMemos(memos).filter((m) => (m.spaceId ?? viewBucket) === space).length;

  return (
    <div className="page page--account">
      <header className="page__bar">
        <button className="text-link" onClick={() => navigate('/')}>
          ← 返回随手记
        </button>
      </header>

      <div className="page__body">
        {!auth ? (
          <section className="card card--loginCta">
            <div className="card__label">
              <IconUser width={14} height={14} />
              未登录
            </div>
            <p className="card__note">
              现在写的记录只在这台设备上。登录后自动并进账号，还能多设备同步、建群共享、用 AI 整理和对话。
            </p>
            <div className="card__actions">
              <button className="btn btn--primary" onClick={() => navigate('/login?next=/account')}>
                登录 / 注册
              </button>
            </div>
          </section>
        ) : null}

        <section className="card">
          <div className="account-head">
            <span className="account-head__avatar">
              {user ? user.username.slice(0, 1).toUpperCase() : <IconUser width={18} height={18} />}
            </span>
            <div className="account-head__main">
              <div className="account-head__name">{user ? `@${user.username}` : lastUser ? `@${lastUser.username} · 已退出` : '未登录'}</div>
              <div className="account-head__sub">
                {user ? '记录绑定在此账号下，各设备自动同步' : lastUser ? '记录仍保留在本机，登录同一账号后自动补传' : '当前只写在本机，不会上传'}
              </div>
            </div>
            <SyncBadge />
          </div>

          <div className="kv">
            <div className="kv__row">
              <span className="kv__k">本机设备</span>
              <span className="kv__v">
                <IconDevice width={13} height={13} style={{ opacity: 0.5, marginRight: 5 }} />
                {deviceName}
              </span>
            </div>
            <div className="kv__row">
              <span className="kv__k">我的记录</span>
              <span className="kv__v">{countOf(viewBucket)} 条</span>
            </div>
            <div className="kv__row">
              <span className="kv__k">所在群</span>
              <span className="kv__v">{list.length} 个</span>
            </div>
          </div>

          <div className="card__actions">
            {auth ? (
              <>
                <button
                  className="btn btn--ghost"
                  data-confirm={confirmOut}
                  onClick={() => {
                    if (!confirmOut) {
                      setConfirmOut(true);
                      window.setTimeout(() => setConfirmOut(false), 4000);
                      return;
                    }
                    setConfirmOut(false);
                    void signOut();
                  }}
                >
                  {confirmOut ? '确认退出' : '退出登录'}
                </button>
                <button className="btn btn--primary" onClick={() => navigate('/')}>
                  回到记录
                </button>
              </>
            ) : (
              <>
                <button className="btn btn--ghost" onClick={() => navigate('/login')}>
                  登录 / 注册
                </button>
                <button className="btn btn--primary" onClick={() => navigate('/')}>
                  回到记录
                </button>
              </>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card__label">
            <IconUsers width={14} height={14} />
            共享空间
          </div>
          {list.length === 0 ? (
            <p className="card__empty">
              {auth ? '还没有群。建一个群，把同事或家人拉进来一起记。' : '登录后可以建群，和成员共享记录。'}
            </p>
          ) : (
            <div className="group-rows">
              {list.map((g) => (
                <button
                  key={g.id}
                  className="group-row"
                  onClick={() => {
                    setActiveSpace(`g:${g.id}`);
                    navigate('/');
                  }}
                >
                  <span className="group-row__name">{g.name}</span>
                  <span className="group-row__meta">
                    {g.members.length} 人 · {countOf(`g:${g.id}`)} 条
                  </span>
                  <IconChevron width={16} height={16} style={{ opacity: 0.3, transform: 'rotate(-90deg)' }} />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="card__label">数据</div>
          <p className="card__note">
            记录同时存在本机与服务器。清除本机缓存只会删掉这台设备上的副本，云端内容不受影响；
            重新登录会重新拉取。
          </p>
          <div className="card__actions">
            <button
              className="text-link"
              data-confirm={confirmClear}
              disabled={Boolean(auth)}
              onClick={() => {
                if (auth) return;
                if (!confirmClear) {
                  setConfirmClear(true);
                  window.setTimeout(() => setConfirmClear(false), 4000);
                  return;
                }
                setConfirmClear(false);
                void clearCache();
                navigate('/');
              }}
            >
              {confirmClear ? '确认清除本机缓存' : '清除本机缓存'}
            </button>
            {auth ? <span className="page__hint">退出登录后可清除本机缓存</span> : null}
          </div>
        </section>

        {shellMode ? (
          <section className="card">
            <div className="card__label">服务器</div>
            <p className="card__note">
              移动端页面打包在应用内，接口需要一个可访问的服务器地址。填你自己的部署地址，保存后会重新加载。
            </p>
            <div className="field" style={{ marginTop: 12 }}>
              <input
                className="field__input"
                value={endpoint}
                placeholder="https://your-server.example.com"
                onChange={(e) => setEndpoint(e.target.value)}
              />
            </div>
            <div className="card__actions">
              <button className="text-link" onClick={() => setApiBase(endpoint)}>
                保存并重新加载
              </button>
              <button
                className="text-link"
                onClick={() => {
                  localStorage.removeItem('ssj:endpoint');
                  location.reload();
                }}
              >
                恢复构建时的地址
              </button>
            </div>
          </section>
        ) : null}

        <p className="page__fineprint">
          登录凭证保存在本机浏览器里；记录在服务端是可读的，没有做端到端加密。公网部署请使用 HTTPS。
        </p>
      </div>
    </div>
  );
}
