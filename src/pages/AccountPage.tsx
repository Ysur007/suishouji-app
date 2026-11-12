/**
 * 「我的」：账号、共享、数据与本机状态。
 *
 * 结构按「一件事一行」排：
 *   身份头（我是谁 / 同步到哪 / 唯一的账号动作）
 *   共享空间 · 数据与备份 · AI 引擎 · 本机与服务 · 关于
 *
 * 为什么是行列表而不是一堆卡片：这页里有两类东西——「看一眼」的状态（设备、同步、版本）
 * 和「点一下」的动作（导出、导入、清缓存、管群）。卡片适合前者，行列表适合后者；
 * 早先全做成同款白卡，结果退出登录、清缓存、群列表看起来一样重要。
 *
 * 业务逻辑沿用原实现：登录/退出、clearCache、GroupSheet、AiSheet、服务器地址覆盖。
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { apiBase, defaultApiBase, setApiBase } from '../lib/endpoint';
import { dayLabel, relativeTime } from '../lib/format';
import { navigate } from '../lib/router';
import { liveMemos, useApp } from '../lib/store';
import { useAi } from '../lib/aiui';
import { useUI } from '../lib/ui';
import { IconChevron, IconPlus, IconUser, IconUsers } from '../components/Icons';
import { SyncBadge } from '../components/SyncBadge';
import { ConfirmBar } from '../components/ConfirmBar';

export function AccountPage() {
  const auth = useApp((s) => s.auth);
  const user = useApp((s) => s.user);
  const lastUser = useApp((s) => s.lastUser);
  const viewBucket = useApp((s) => s.viewBucket);
  const deviceName = useApp((s) => s.deviceName);
  const platform = useApp((s) => s.platform);
  const clientId = useApp((s) => s.clientId);
  const sync = useApp((s) => s.sync);
  const groups = useApp((s) => s.groups);
  const memos = useApp((s) => s.memos);
  const folders = useApp((s) => s.folders);
  const signOut = useApp((s) => s.signOut);
  const clearCache = useApp((s) => s.clearCache);
  const importData = useApp((s) => s.importData);
  const notify = useApp((s) => s.notify);
  const setActiveSpace = useApp((s) => s.setActiveSpace);
  const openSheet = useUI((s) => s.open);
  const aiStatus = useAi((s) => s.status);
  const refreshAi = useAi((s) => s.refreshStatus);

  // 这页要显示引擎状态，进页面时主动取一次（其他页面也是这么做的）
  useEffect(() => {
    void refreshAi();
  }, [refreshAi]);

  const [confirmOut, setConfirmOut] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [endpoint, setEndpoint] = useState(() => apiBase() || defaultApiBase());
  const shellMode = Boolean(defaultApiBase()) || Boolean(apiBase());
  const fileRef = useRef<HTMLInputElement>(null);

  const me = user ?? lastUser;
  const list = useMemo(
    () => Object.values(groups).sort((a, b) => a.createdAt - b.createdAt),
    [groups],
  );
  const memoCount = liveMemos(memos).length;
  const folderCount = Object.values(folders).filter((f) => !f.deleted).length;
  const countOf = (space: string) =>
    liveMemos(memos).filter((m) => (m.spaceId ?? viewBucket) === space).length;

  // 概览与「最近记录」都用本机这份 store，口径和记录页 / 整理页一致，不是另算一套
  const recent = useMemo(
    () =>
      liveMemos(memos)
        .filter((m) => m.text.trim())
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 3),
    [memos],
  );
  const deviceCount = Math.max(sync.peers.length, 1);

  /* ---------------- 数据动作（沿用原实现，只换了位置） ---------------- */

  const importFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as { records?: Array<Record<string, unknown>> };
      if (!parsed.records?.length) {
        notify('这个文件里没有可导入的记录', 'error');
        return;
      }
      notify(`已导入 ${importData(parsed.records)} 条记录`);
    } catch {
      notify('文件解析失败', 'error');
    }
  };

  /* ---------------- 渲染 ---------------- */

  return (
    <div className="aiPage">
      <header className="aiHead">
        <div className="aiHead__main">
          <h1 className="aiHead__title">我的</h1>
          <p className="aiHead__desc">账号、共享、备份与本机状态都在这一页。</p>
        </div>
      </header>

      <div className="acctScroll">
        <div className="acctCols">
          <div className="acctCol">
            <section className="idCard">
              <div className="idCard__top">
                <span className="idCard__avatar">
                  {me ? me.username.slice(0, 1).toUpperCase() : <IconUser width={20} height={20} />}
                </span>
                <div className="idCard__main">
                  <div className="idCard__name">
                    <span className="idCard__who">{me ? `@${me.username}` : '未登录'}</span>
                    <span className="idCard__state" data-tone={auth ? 'on' : 'off'}>
                      {auth ? '已登录' : lastUser ? '已退出' : '未登录'}
                    </span>
                  </div>
                  <div className="idCard__sub">
                    {auth
                      ? '记录绑定在此账号下，各设备自动同步'
                      : lastUser
                        ? '记录仍保留在本机，登录同一账号后自动补传'
                        : '当前只写在本机，不会上传'}
                  </div>
                  <div className="idCard__meta">
                    {memoCount} 条记录 · {list.length} 个群 · {platform}
                    <span className="idCard__sync">
                      <SyncBadge />
                    </span>
                  </div>
                </div>
              </div>

              <div className="idCard__actions acct-mobileOnly">
                {auth ? (
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
                    {confirmOut ? '确认退出？数据会留在本机' : '退出登录'}
                  </button>
                ) : (
                  <button className="btn btn--primary" onClick={() => navigate('/login?next=/account')}>
                    登录 / 注册
                  </button>
                )}
              </div>
              {confirmOut ? (
                <ConfirmBar
                  text="退出后记录仍在本机，重新登录同一账号会自动补传；换账号则互不可见。"
                  confirmLabel="退出登录"
                  onConfirm={() => {
                    setConfirmOut(false);
                    void signOut();
                  }}
                  onCancel={() => setConfirmOut(false)}
                />
              ) : null}
            </section>

            <section className="sec sec--stats">
              <div className="secHead">
                <span className="secHead__title">概览</span>
                <span className="secHead__meta">本机缓存</span>
              </div>
              <div className="orgStats acctStats">
                <div className="stat">
                  <div className="stat__n">{memoCount}</div>
                  <div className="stat__l">条记录</div>
                </div>
                <div className="stat">
                  <div className="stat__n">{folderCount}</div>
                  <div className="stat__l">个文件夹</div>
                </div>
                <div className="stat">
                  <div className="stat__n">{list.length}</div>
                  <div className="stat__l">个群</div>
                </div>
                <div className="stat">
                  <div className="stat__n">{deviceCount}</div>
                  <div className="stat__l">台在线</div>
                </div>
              </div>
            </section>

            <Section
              className="sec--recent"
              title="最近记录"
              head={
                recent.length ? (
                  <button className="secHead__link" onClick={() => navigate('/')}>
                    全部 {memoCount} 条 →
                  </button>
                ) : undefined
              }
            >
              {recent.length === 0 ? (
                <div className="row row--static">
                  <span className="row__main">
                    <span className="row__label">还没有文字记录</span>
                    <span className="row__sub">在记录页写一条，这里会显示最近三条。</span>
                  </span>
                </div>
              ) : (
                recent.map((m) => (
                  <button
                    key={m.id}
                    className="pick pick--row"
                    onClick={() => openSheet({ kind: 'editor', memoId: m.id })}
                  >
                    <span className="pick__date">{dayLabel(m.createdAt)}</span>
                    <span className="pick__text">
                      {m.text.replace(/\s+/g, ' ').slice(0, 40)}
                      {m.text.length > 40 ? '…' : ''}
                    </span>
                  </button>
                ))
              )}
            </Section>

            <Section className="sec--ai" title="AI 引擎">
              <Row
                label={auth ? aiLabel(aiStatus) : '登录后可用'}
                sub={
                  !auth
                    ? '登录后可用：整理与对话会读你自己的记录'
                    : aiStatus?.configured
                      ? '整理与对话会调用这个模型，密钥只存在服务端'
                      : '归类、摘句、抽待办都在本地完成，不调用模型'
                }
                right={auth ? '配置' : '登录'}
                onClick={() => (auth ? openSheet({ kind: 'ai' }) : navigate('/login?next=/account'))}
              />
            </Section>

            <Section className={aboutOpen ? 'sec--about is-open' : 'sec--about'} title="关于">
              <Row label="版本" sub="随手记 · 像发消息一样记笔记" right={`v${__APP_VERSION__}`} />
              <Row
                className="row--extra"
                label="数据存在哪"
                sub="服务器上一个 JSON 文件（data/db.json），随时可整包拷走"
              />
              <Row
                className="row--extra"
                label="安全说明"
                sub="凭证存本机；服务端可读，未做端到端加密；公网部署请用 HTTPS"
              />
              <Row
                className="aboutToggle"
                label={aboutOpen ? '收起' : '数据存在哪 / 安全说明'}
                right={aboutOpen ? '收起' : '展开'}
                nav={!aboutOpen}
                onClick={() => setAboutOpen((v) => !v)}
              />
            </Section>
          </div>

          <div className="acctCol">
            <Section
              className="sec--groups"
              title="共享空间"
              head={
                <button
                  className="secHead__link"
                  onClick={() => openSheet({ kind: 'new-group' })}
                  disabled={!auth}
                >
                  <IconPlus width={13} height={13} />
                  新建群
                </button>
              }
            >
              {list.length === 0 ? (
                <div className="row row--static">
                  <span className="row__main">
                    <span className="row__label">{auth ? '还没有群' : '登录后可用'}</span>
                    <span className="row__sub">
                      {auth ? '建一个群，把同事或家人拉进来一起记。' : '登录后可以建群，和成员共享记录。'}
                    </span>
                  </span>
                </div>
              ) : (
                list.map((g) => (
                  <div key={g.id} className="row row--split">
                    <button
                      className="row__main row__main--btn"
                      onClick={() => {
                        setActiveSpace(`g:${g.id}`);
                        navigate('/');
                      }}
                    >
                      <span className="row__label">
                        <IconUsers width={14} height={14} className="row__icon" />
                        {g.name}
                      </span>
                      <span className="row__sub">
                        {g.members.length} 人 · {countOf(`g:${g.id}`)} 条
                      </span>
                    </button>
                    <button
                      className="row__action"
                      onClick={() => openSheet({ kind: 'group', groupId: g.id })}
                    >
                      管理
                    </button>
                  </div>
                ))
              )}
            </Section>

            <Section className="sec--data" title="数据与备份">
              <Row
                label="导出备份"
                sub={`${memoCount} 条记录 · ${folderCount} 个文件夹 · 可选范围与来源`}
                right="导出"
                className="acct-mobileOnly"
                nav
                onClick={() => openSheet({ kind: 'export' })}
              />
              <Row
                label="从备份导入"
                sub="JSON 备份文件，重复记录按 HLC 合并"
                right="选择文件"
                onClick={() => fileRef.current?.click()}
              />
              <Row
                label="清除本机缓存"
                sub={
                  auth
                    ? '会先退出登录，再删这台设备上的副本；云端不动'
                    : '只删这台设备上的副本，云端记录不受影响'
                }
                right="清除"
                onClick={() => setConfirmClear(true)}
              />
              {confirmClear ? (
                <ConfirmBar
                  text={
                    auth
                      ? '退出登录并清除本机副本。云端记录不受影响，重新登录会重新拉取。'
                      : '删除这台设备上的副本。云端记录不受影响，下次登录会重新拉取。'
                  }
                  confirmLabel={auth ? '退出并清除' : '清除'}
                  onConfirm={async () => {
                    setConfirmClear(false);
                    if (auth) await signOut();
                    await clearCache();
                  }}
                  onCancel={() => setConfirmClear(false)}
                />
              ) : null}
            </Section>

            <Section className="sec--device" title="本机与服务">
              <Row
                label={deviceName}
                sub={`设备 ID · ${clientId.slice(0, 8)}… · ${platform}`}
                right="改名"
                nav
                onClick={() => openSheet({ kind: 'device' })}
              />
              <Row
                label="修改密码"
                sub={auth ? '改完其它设备上的登录会失效' : '登录后可修改'}
                right={auth ? '修改' : '登录'}
                nav
                className="acct-mobileOnly"
                onClick={() => (auth ? openSheet({ kind: 'password' }) : navigate('/login?next=/account'))}
              />
              <Row
                label="同步状态"
                sub={
                  sync.status === 'online'
                    ? `已连接，改动实时推送${sync.lastAt ? ` · 最后同步 ${relativeTime(sync.lastAt)}` : ''}`
                    : sync.status === 'connecting'
                      ? '正在连接…'
                      : sync.status === 'guest'
                        ? '未登录，只写在本机'
                        : '离线中，改动先存本机，恢复后补发'
                }
                right={<SyncBadge />}
              />
              <Row
                label="在线设备"
                sub={
                  auth
                    ? '点开可以看是哪几台，也能把不用的那台下线'
                    : '登录后可查看并管理已登录的设备'
                }
                right={`${Math.max(sync.peers.length, 1)} 台`}
                nav
                onClick={() => openSheet({ kind: 'devices' })}
              />
              {shellMode ? (
                <div className="row row--stack">
                  <span className="row__main">
                    <span className="row__label">服务器地址</span>
                    <span className="row__sub">打包在应用内时，接口需要一个可访问的地址</span>
                  </span>
                  <div className="row__form">
                    <input
                      className="field__input"
                      value={endpoint}
                      placeholder="https://your-server.example.com"
                      onChange={(e) => setEndpoint(e.target.value)}
                    />
                    <button className="btn btn--ghost" onClick={() => setApiBase(endpoint)}>
                      保存并重载
                    </button>
                    <button
                      className="text-link"
                      onClick={() => {
                        localStorage.removeItem('ssj:endpoint');
                        location.reload();
                      }}
                    >
                      恢复默认
                    </button>
                  </div>
                </div>
              ) : null}
            </Section>
          </div>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/* ---------------- 小组件 ---------------- */

function aiLabel(status: { configured: boolean; model: string } | null): string {
  if (!status) return '未就绪';
  return status.configured ? `模型 · ${status.model}` : '本地分析';
}

function Section({
  title,
  head,
  className,
  children,
}: {
  title: string;
  head?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={className ? `sec ${className}` : 'sec'}>
      <div className="secHead">
        <span className="secHead__title">{title}</span>
        {head}
      </div>
      <div className="secCard">{children}</div>
    </section>
  );
}

function Row({
  label,
  sub,
  right,
  onClick,
  nav,
  className,
}: {
  label: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  /** 会不会跳走 / 打开面板：动作类不给箭头，免得看着像能点进去看详情 */
  nav?: boolean;
  /** 用来标记「只有窄屏才出现」这类行 */
  className?: string;
}) {
  const body = (
    <>
      <span className="row__main">
        <span className="row__label">{label}</span>
        {sub ? <span className="row__sub">{sub}</span> : null}
      </span>
      {right ? (
        <span className="row__right">
          {right}
          {nav ? <IconChevron width={15} height={15} className="row__chev" /> : null}
        </span>
      ) : null}
    </>
  );

  const cls = className ? ` ${className}` : '';
  if (!onClick) return <div className={`row row--static${cls}`}>{body}</div>;
  return (
    <button className={`row row--btn${cls}`} onClick={onClick}>
      {body}
    </button>
  );
}
