/**
 * 「我的」页上的两个账号级设置：改密码、改设备名。
 *
 * 都是小浮层而不是整页——它们只需要三五个字段，跳页反而绕。
 * 逻辑边界：改密码走服务端 `POST /api/auth/password`（校验原密码、换盐、踢掉其他设备）；
 * 改设备名只改本机标识，重新握手一次让其他设备看到新名字。
 */

import { useState } from 'react';
import { apiChangePassword, readAuth } from '../lib/auth';
import { useApp } from '../lib/store';
import { sync } from '../lib/sync';

export function PasswordBody({ onClose }: { onClose: () => void }) {
  const notify = useApp((s) => s.notify);
  const [oldPassword, setOld] = useState('');
  const [newPassword, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setError(null);
    if (oldPassword.length < 6) return setError('原密码至少 6 位');
    if (newPassword.length < 6) return setError('新密码至少 6 位');
    if (newPassword !== again) return setError('两次输入的新密码不一致');
    const token = readAuth()?.token;
    if (!token) return setError('登录已失效，请重新登录');
    setBusy(true);
    try {
      const { dropped } = await apiChangePassword(token, oldPassword, newPassword);
      notify(dropped > 0 ? `密码已更新，另有 ${dropped} 台设备需要重新登录` : '密码已更新');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="sheet__title">修改密码</div>
      <div className="sheet__desc">改完以后，其它设备上的登录会失效，需要用新密码重新登录。</div>

      <div className="sheet__body">
        <div className="field">
          <span className="field__label">原密码</span>
          <input
            className="field__input"
            type="password"
            autoComplete="current-password"
            value={oldPassword}
            onChange={(e) => setOld(e.target.value)}
          />
        </div>
        <div className="field">
          <span className="field__label">新密码</span>
          <input
            className="field__input"
            type="password"
            autoComplete="new-password"
            placeholder="至少 6 位"
            value={newPassword}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>
        <div className="field">
          <span className="field__label">再输一次</span>
          <input
            className="field__input"
            type="password"
            autoComplete="new-password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
          />
        </div>

        {error ? <div className="auth-error">{error}</div> : null}
      </div>

      <div className="sheet__actions">
        <button className="btn btn--ghost" onClick={onClose} disabled={busy}>
          取消
        </button>
        <button className="btn btn--primary" onClick={() => void submit()} disabled={busy}>
          {busy ? '提交中…' : '确认修改'}
        </button>
      </div>
    </>
  );
}

export function DeviceNameBody({ onClose }: { onClose: () => void }) {
  const deviceName = useApp((s) => s.deviceName);
  const platform = useApp((s) => s.platform);
  const clientId = useApp((s) => s.clientId);
  const setDeviceName = useApp((s) => s.setDeviceName);
  const notify = useApp((s) => s.notify);
  const [name, setName] = useState(deviceName);

  const save = async () => {
    const next = name.trim();
    if (!next) return notify('名字不能为空', 'error');
    setDeviceName(next);
    // 重新握手，让其他设备的「在线设备」立刻看到新名字
    await sync.restart();
    notify('设备名已更新');
    onClose();
  };

  return (
    <>
      <div className="sheet__title">设备名称</div>
      <div className="sheet__desc">只在「在线设备」和群消息的作者标识里出现，不影响数据归属。</div>

      <div className="sheet__body">
        <div className="field">
          <span className="field__label">名称</span>
          <input
            className="field__input"
            autoFocus
            maxLength={24}
            value={name}
            placeholder={`${platform} · 浏览器`}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
            }}
          />
          <div className="field__hint">最多 24 个字。设备 ID {clientId.slice(0, 8)}… 不会变。</div>
        </div>
      </div>

      <div className="sheet__actions">
        <button className="btn btn--ghost" onClick={onClose}>
          取消
        </button>
        <button className="btn btn--primary" onClick={() => void save()}>
          保存
        </button>
      </div>
    </>
  );
}