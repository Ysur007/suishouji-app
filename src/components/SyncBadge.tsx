import { motion } from 'framer-motion';
import { useApp } from '../lib/store';

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

/** 侧栏底部那块同步状态：面板收窄后仍然保留，是「这份数据现在什么状态」的唯一出口 */
export function SyncCard() {
  const deviceName = useApp((s) => s.deviceName);
  const sync = useApp((s) => s.sync);
  const user = useApp((s) => s.user);
  const lastUser = useApp((s) => s.lastUser);

  return (
    <div className="sync-card">
      <div className="sync-card__row">
        <SyncBadge />
        <PeerDots />
      </div>
      <div className="sync-card__row" style={{ fontSize: 11 }}>
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'var(--ink-4)',
          }}
        >
          {deviceName}
        </span>
      </div>
      <div className="account-row">
        <span className="account-name">
          {user
            ? `@${user.username}`
            : lastUser
              ? `@${lastUser.username} · 已退出`
              : '未登录 · 仅本机'}
        </span>
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
          animate={{
            width:
              sync.status === 'online' ? '100%' : sync.status === 'connecting' ? '46%' : '12%',
          }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </motion.div>
    </div>
  );
}
