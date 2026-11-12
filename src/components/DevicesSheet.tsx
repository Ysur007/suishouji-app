/**
 * 在线设备：账号下所有登录凭证，可单独下线。
 *
 * 为什么需要它：手机丢了、在别人电脑上登过，过去唯一手段是改密码——但那会把自己也踢掉。
 * 现在每台设备一条，除了当前这台，其余都能「下线」；下线会同时断开它正在跑的连接。
 */

import { useEffect, useState } from 'react';
import { fetchDevices, revokeDevice, type DeviceRow } from '../lib/api';
import { relativeTime } from '../lib/format';
import { useApp } from '../lib/store';

export function DevicesBody({ onClose }: { onClose: () => void }) {
  const notify = useApp((s) => s.notify);
  const [list, setList] = useState<DeviceRow[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetchDevices();
      setList(res.devices);
      setCurrent(res.current);
    } catch (err) {
      setList([]);
      notify((err as Error).message, 'error');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const revoke = async (id: string) => {
    setBusy(id);
    try {
      await revokeDevice(id);
      notify('已下线，那台设备需要重新登录');
      setConfirmId(null);
      await load();
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="sheet__title">在线设备</div>
      <div className="sheet__desc">
        同一个账号登录过的设备都在这里。下线只会让那台设备退出登录，记录仍在云端。
      </div>

      <div className="sheet__body">
        {list === null ? (
          <div className="devices__empty">读取中…</div>
        ) : list.length === 0 ? (
          <div className="devices__empty">还没有可显示的设备。</div>
        ) : (
          <div className="devices">
            {list.map((d) => {
              const isCurrent = d.id === current;
              const armed = confirmId === d.id;
              return (
                <div key={d.id} className="devices__row" data-armed={armed || undefined}>
                  <div className="devices__main">
                    <div className="devices__name">
                      {d.name}
                      {isCurrent ? <span className="devices__badge">本机</span> : null}
                    </div>
                    <div className="devices__sub">
                      {d.platform || '未知平台'} · 最近活跃 {relativeTime(d.lastSeenAt)}
                    </div>
                  </div>
                  {isCurrent ? (
                    <span className="devices__hint">当前设备</span>
                  ) : armed ? (
                    <div className="devices__confirm">
                      <button className="text-link" onClick={() => setConfirmId(null)}>
                        取消
                      </button>
                      <button
                        className="btn btn--danger btn--solid devices__revoke"
                        disabled={busy === d.id}
                        onClick={() => void revoke(d.id)}
                      >
                        {busy === d.id ? '下线中…' : '确认下线'}
                      </button>
                    </div>
                  ) : (
                    <button className="text-link devices__revokeLink" onClick={() => setConfirmId(d.id)}>
                      下线
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="sheet__actions">
        <button className="btn btn--primary" onClick={onClose}>
          完成
        </button>
      </div>
    </>
  );
}
