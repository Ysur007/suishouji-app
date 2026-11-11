import { useRef, useState } from 'react';
import { downloadJson } from '../lib/format';
import { liveFolders, liveMemos, useApp } from '../lib/store';
import { IconDownload, IconUpload } from './Icons';
import { SyncBadge } from './Sidebar';
import { useUI } from '../lib/ui';

export function SettingsBody({ onClose }: { onClose: () => void }) {
  const deviceName = useApp((s) => s.deviceName);
  const clientId = useApp((s) => s.clientId);
  const platform = useApp((s) => s.platform);
  const sync = useApp((s) => s.sync);
  const memos = useApp((s) => s.memos);
  const folders = useApp((s) => s.folders);
  const importData = useApp((s) => s.importData);
  const auth = useApp((s) => s.auth);
  const signOut = useApp((s) => s.signOut);
  const lastUser = useApp((s) => s.lastUser);
  const clearCache = useApp((s) => s.clearCache);
  const openSheet = useUI((s) => s.open);
  const [confirmClear, setConfirmClear] = useState(false);
  const notify = useApp((s) => s.notify);
  const fileRef = useRef<HTMLInputElement>(null);

  const memoCount = liveMemos(memos).length;
  const folderCount = liveFolders(folders).length;

  const exportLocal = () => {
    const records = [...Object.values(memos), ...Object.values(folders)].map((r) => ({
      ...r,
      entity: 'text' in r ? 'memo' : 'folder',
    }));
    downloadJson(`suishouji-${new Date().toISOString().slice(0, 10)}.json`, {
      version: 1,
      exportedAt: new Date().toISOString(),
      records,
    });
    notify('备份已导出');
  };

  const importFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { records?: Array<Record<string, unknown>> };
      if (!parsed.records?.length) {
        notify('这个文件里没有可导入的记录', 'error');
        return;
      }
      const n = importData(parsed.records);
      notify(`已导入 ${n} 条记录`);
      onClose();
    } catch {
      notify('文件解析失败', 'error');
    }
  };

  const clearLocal = async () => {
    try {
      indexedDB.deleteDatabase('suishouji');
      localStorage.clear();
      notify('本地缓存已清空，正在重新载入');
      setTimeout(() => location.reload(), 400);
    } catch {
      notify('清空失败', 'error');
    }
  };

  return (
    <>
      <div className="sheet__title">设置</div>
      <div className="sheet__desc">这页只做三件事：看同步、备份数据、换设备。</div>

      <div className="sheet__body">
        <div>
          <div className="section-label">账号</div>
          {auth ? (
            <div className="settings-row">
              <div className="settings-row__main">
                <div className="settings-row__label">@{auth.user.username}</div>
                <div className="settings-row__desc">记录绑定在此账号下，各设备自动同步</div>
              </div>
              <div className="settings-row__right">
                <button
                  className="account-link"
                  onClick={() => {
                    void signOut();
                    onClose();
                  }}
                >
                  退出登录
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="settings-row">
                <div className="settings-row__main">
                  <div className="settings-row__label">
                    {lastUser ? `@${lastUser.username} · 已退出` : '未登录'}
                  </div>
                  <div className="settings-row__desc">
                    {lastUser
                      ? '记录仍保留在本机，可以继续写；登录同一账号后会自动补传'
                      : '当前只写在本机、不上传；登录后会并入该账号'}
                  </div>
                </div>
              </div>
              <div className="row-options" style={{ margin: '4px 0 10px' }}>
                <button className="option" onClick={() => openSheet({ kind: 'auth', mode: 'login' })}>
                  登录
                </button>
                <button
                  className="option"
                  onClick={() => openSheet({ kind: 'auth', mode: 'register' })}
                >
                  注册新账号
                </button>
              </div>
              {lastUser ? (
                <div className="settings-row settings-row--minor">
                  <div className="settings-row__main">
                    <div className="settings-row__desc">
                      清除后本机不再保留这份缓存，云端记录不受影响
                    </div>
                  </div>
                  <div className="settings-row__right">
                    <button
                      className="account-link"
                      data-confirm={confirmClear}
                      onClick={() => {
                        if (!confirmClear) {
                          setConfirmClear(true);
                          window.setTimeout(() => setConfirmClear(false), 4000);
                          return;
                        }
                        setConfirmClear(false);
                        void clearCache();
                        onClose();
                      }}
                    >
                      {confirmClear ? '确认清除' : '清除本机缓存'}
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div>
          <div className="section-label">本机</div>
          <div className="settings-row">
            <div className="settings-row__main">
              <div className="settings-row__label">{deviceName}</div>
              <div className="settings-row__desc">设备 ID · {clientId}</div>
            </div>
            <div className="settings-row__right">{platform}</div>
          </div>
          <div className="settings-row">
            <div className="settings-row__main">
              <div className="settings-row__label">同步状态</div>
              <div className="settings-row__desc">
                {sync.status === 'online'
                  ? '已连接到同步服务，改动实时推送'
                  : sync.status === 'connecting'
                    ? '正在连接同步服务…'
                    : '离线中，改动会先存在本机，恢复网络后自动补发'}
              </div>
            </div>
            <div className="settings-row__right">
              <SyncBadge />
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row__main">
              <div className="settings-row__label">在线设备</div>
              <div className="settings-row__desc">
                {sync.peers.length > 1
                  ? sync.peers.map((p) => p.name).join(' · ')
                  : '只有这一台，用另一台设备打开同一地址即可'}
              </div>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row__main">
              <div className="settings-row__label">本地内容</div>
              <div className="settings-row__desc">
                {memoCount} 条记录 · {folderCount} 个文件夹
                {sync.pending > 0 ? ` · ${sync.pending} 条待发送` : ''}
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="section-label">数据</div>
          <div className="row-options">
            <button className="option" onClick={exportLocal}>
              <IconDownload width={14} height={14} />
              导出 JSON 备份
            </button>
            <button className="option" onClick={() => fileRef.current?.click()}>
              <IconUpload width={14} height={14} />
              从备份导入
            </button>
            <a className="option" href="/api/export" download style={{ textDecoration: 'none' }}>
              服务端完整导出
            </a>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-4)', lineHeight: 1.6, marginTop: 8 }}>
            数据保存在服务器的一个 JSON 文件里（data/db.json），随时可以整包拷走。
          </div>
        </div>

        <div>
          <div className="section-label">维护</div>
          <div className="row-options">
            <button className="option" onClick={() => void clearLocal()} style={{ color: 'var(--accent)' }}>
              清空本地缓存
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-4)', lineHeight: 1.6, marginTop: 8 }}>
            清空后会用服务端数据重建本地缓存，不会丢内容。
          </div>
        </div>

        <div>
          <div className="section-label">关于</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.7 }}>
            随手记 v1.0.0 · 像发消息一样记笔记
            <br />
            React + TypeScript + WebSocket 实时同步 · 单文件数据存储
          </div>
        </div>
      </div>

      <div className="sheet__actions">
        <button className="btn btn--primary" onClick={onClose}>
          完成
        </button>
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
    </>
  );
}
