import { motion } from 'framer-motion';
import { BrandGlyph, IconDevice, IconFolder, IconRecord, IconSpace, IconTimeline } from './Icons';
import { liveFolders, liveMemos, useApp } from '../lib/store';
import { useUI } from '../lib/ui';

const PEER_COLORS = ['#0A0A0A', '#333333', '#555555', '#777777'];

export function SyncBadge({ compact = false }: { compact?: boolean }) {
  const sync = useApp((s) => s.sync);
  const label =
    sync.status === 'online'
      ? '已同步'
      : sync.status === 'connecting'
        ? '连接中'
        : sync.status === 'guest'
          ? '本地模式'
          : '离线';
  const pending = sync.pending;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span className="sync-dot" data-status={sync.status} />
      {!compact && (
        <span style={{ whiteSpace: 'nowrap' }}>
          {pending > 0 ? `同步中 · ${pending}` : label}
        </span>
      )}
    </span>
  );
}

export function PeerDots() {
  const peers = useApp((s) => s.sync.peers);
  const clientId = useApp((s) => s.clientId);
  const others = peers.filter((p) => p.clientId !== clientId);
  if (!others.length) return null;
  return (
    <span className="sync-card__peers" title={others.map((p) => p.name).join('、')}>
      {others.slice(0, 3).map((p, i) => (
        <span
          key={p.clientId}
          className="peer-chip"
          style={{ background: PEER_COLORS[i % PEER_COLORS.length], marginLeft: i === 0 ? 0 : -5 }}
        >
          {p.name.slice(0, 1)}
        </span>
      ))}
    </span>
  );
}

export function Sidebar() {
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  const memos = useApp((s) => s.memos);
  const folders = useApp((s) => s.folders);
  const setFolderFilter = useApp((s) => s.setFolderFilter);
  const deviceName = useApp((s) => s.deviceName);
  const sync = useApp((s) => s.sync);
  const user = useApp((s) => s.user);
  const signOut = useApp((s) => s.signOut);
  const openSheet = useUI((s) => s.open);

  const memoCount = liveMemos(memos).length;
  const folderList = liveFolders(folders);
  const recent = folderList.slice(0, 4);

  const items = [
    { key: 'record' as const, label: '记录', icon: <IconRecord />, count: memoCount },
    { key: 'timeline' as const, label: '时间线', icon: <IconTimeline />, count: memoCount },
    { key: 'space' as const, label: '空间', icon: <IconSpace />, count: memoCount },
    { key: 'folders' as const, label: '文件夹', icon: <IconFolder />, count: folderList.length },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand__mark">
          <BrandGlyph width={16} height={16} />
        </div>
        <div>
          <div className="brand__name">随手记</div>
          <div className="brand__sub">像发消息一样</div>
        </div>
      </div>

      <nav className="nav">
        <div className="nav__label">工作区</div>
        {items.map((item) => (
          <button
            key={item.key}
            className="nav__item"
            data-active={tab === item.key}
            onClick={() => setTab(item.key)}
          >
            {item.icon}
            <span>{item.label}</span>
            <span className="nav__count">{item.count}</span>
          </button>
        ))}
      </nav>

      {recent.length > 0 && (
        <nav className="nav">
          <div className="nav__label">文件夹</div>
          {recent.map((f) => {
            const n = liveMemos(memos).filter((m) => m.folderId === f.id).length;
            return (
              <button
                key={f.id}
                className="nav__item"
                onClick={() => {
                  setFolderFilter(f.id);
                  setTab('space');
                }}
                style={{ fontSize: 13 }}
              >
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 3,
                    background: `var(--tone-${f.tone})`,
                    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.16)',
                    flex: 'none',
                  }}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.name}
                </span>
                <span className="nav__count">{n}</span>
              </button>
            );
          })}
        </nav>
      )}

      <div className="sidebar__foot">
        <div className="sync-card">
          <div className="sync-card__row">
            <SyncBadge />
            <PeerDots />
          </div>
          <div className="sync-card__row" style={{ fontSize: 11 }}>
            <IconDevice width={13} height={13} style={{ opacity: 0.6 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {deviceName}
            </span>
          </div>
          <div className="account-row">
            <span className="account-name">
              {user ? `@${user.username}` : '未登录 · 仅本机'}
            </span>
            <button
              className="account-link"
              onClick={() => {
                if (user) void signOut();
                else openSheet({ kind: 'auth', mode: 'login' });
              }}
            >
              {user ? '退出' : '登录'}
            </button>
          </div>
          <motion.div
            style={{ height: 2, borderRadius: 2, background: 'var(--line)', overflow: 'hidden' }}
            initial={false}
          >
            <motion.div
              style={{
                height: '100%',
                background: sync.status === 'online' ? 'var(--ok)' : 'var(--accent-2)',
                borderRadius: 2,
              }}
              animate={{ width: sync.status === 'online' ? '100%' : sync.status === 'connecting' ? '46%' : '12%' }}
              transition={{ type: 'spring', stiffness: 120, damping: 20 }}
            />
          </motion.div>
        </div>
      </div>
    </aside>
  );
}
