import { useMemo, useState } from 'react';
import { createGroup, inviteMembers, leaveGroup, removeMember, renameGroup } from '../lib/api';
import { useApp } from '../lib/store';
import { IconPlus, IconUsers } from './Icons';

/** 新建群 */
export function NewGroupBody({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const setGroups = useApp((s) => s.setGroups);
  const setActiveSpace = useApp((s) => s.setActiveSpace);
  const notify = useApp((s) => s.notify);

  const submit = async () => {
    if (busy) return;
    const value = name.trim();
    if (!value) {
      setError('给群起个名字');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await createGroup(value);
      setGroups(res.groups);
      setActiveSpace(`g:${res.group.id}`);
      notify(`已创建「${res.group.name}」，现在可以拉人进来`);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="sheet__title">新建群</div>
      <div className="sheet__desc">
        群里的人可以互相看到对方发在这个群的记录。建好后按用户名把人拉进来。
      </div>

      <div className="sheet__body">
        <div className="field">
          <span className="field__label">群名</span>
          <input
            className="field__input"
            autoFocus
            maxLength={24}
            value={name}
            placeholder="比如：装修群、项目组"
            onChange={(e) => setName(e.target.value)}
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
          {busy ? '创建中…' : '创建'}
        </button>
      </div>
    </>
  );
}

/** 群信息：成员、拉人、改名、退群 */
export function GroupBody({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const group = useApp((s) => s.groups[groupId]);
  const me = useApp((s) => s.user);
  const setGroups = useApp((s) => s.setGroups);
  const notify = useApp((s) => s.notify);

  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(group?.name ?? '');
  const [confirmLeave, setConfirmLeave] = useState(false);

  const isOwner = Boolean(group && me && group.ownerId === me.id);
  const names = useMemo(() => group?.members.map((m) => m.username) ?? [], [group]);

  if (!group) {
    return (
      <>
        <div className="sheet__title">群不存在</div>
        <div className="sheet__desc">你可能已经被移出这个群了。</div>
        <div className="sheet__actions">
          <button className="btn btn--primary" onClick={onClose}>
            知道了
          </button>
        </div>
      </>
    );
  }

  const doInvite = async () => {
    if (busy) return;
    const list = invite
      .split(/[,，\s]+/)
      .map((v) => v.trim())
      .filter(Boolean);
    if (!list.length) {
      setError('输入对方的用户名');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await inviteMembers(groupId, list);
      setGroups(res.groups);
      setInvite('');
      notify(`已加入：${list.join('、')}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doRename = async () => {
    const value = draftName.trim();
    if (!value || value === group.name) {
      setRenaming(false);
      return;
    }
    setBusy(true);
    try {
      const res = await renameGroup(groupId, value);
      setGroups(res.groups);
      setRenaming(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doLeave = async () => {
    if (!confirmLeave) {
      setConfirmLeave(true);
      window.setTimeout(() => setConfirmLeave(false), 4000);
      return;
    }
    setBusy(true);
    try {
      const res = await leaveGroup(groupId);
      setGroups(res.groups);
      notify('已退出该群');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doRemove = async (userId: string, username: string) => {
    setBusy(true);
    try {
      const res = await removeMember(groupId, userId);
      setGroups(res.groups);
      notify(`已移出：${username}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="sheet__title">
        {renaming ? (
          <input
            className="group-name-input"
            autoFocus
            value={draftName}
            maxLength={24}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={() => void doRename()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void doRename();
              if (e.key === 'Escape') setRenaming(false);
            }}
          />
        ) : (
          <button className="group-title-btn" onClick={() => setRenaming(true)} title="点击改名">
            {group.name}
          </button>
        )}
      </div>
      <div className="sheet__desc">
        <IconUsers width={13} height={13} style={{ verticalAlign: -2, marginRight: 5 }} />
        {group.members.length} 人 · 群主 {group.members.find((m) => m.id === group.ownerId)?.username ?? '—'}
      </div>

      <div className="sheet__body">
        <div>
          <div className="section-label">成员 · {names.length}</div>
          <div className="member-list">
            {group.members.map((m) => (
              <div className="member" key={m.id}>
                <span className="member__avatar">{m.username.slice(0, 1).toUpperCase()}</span>
                <span className="member__name">
                  {m.username}
                  {m.id === me?.id ? <span className="member__me">（我）</span> : null}
                  {m.id === group.ownerId ? <span className="member__owner">群主</span> : null}
                </span>
                {isOwner && m.id !== me?.id ? (
                  <button
                    className="account-link"
                    onClick={() => void doRemove(m.id, m.username)}
                    disabled={busy}
                  >
                    移出
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="section-label">拉人进群</div>
          <div className="field" style={{ gap: 8 }}>
            <input
              className="field__input"
              value={invite}
              placeholder="输入用户名，多个用逗号或空格分开"
              onChange={(e) => setInvite(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void doInvite();
              }}
            />
            <button
              className="icon-btn icon-btn--bordered"
              aria-label="添加成员"
              onClick={() => void doInvite()}
              disabled={busy}
            >
              <IconPlus />
            </button>
          </div>
          <div className="field__hint">对方需要先注册过账号；拉进来后他能看到群里已有的记录。</div>
        </div>

        {error ? <div className="auth-error">{error}</div> : null}
      </div>

      <div className="sheet__actions">
        <button
          className="btn btn--ghost"
          onClick={() => void doLeave()}
          disabled={busy}
          data-confirm={confirmLeave}
        >
          {confirmLeave ? '确认退出' : '退出群聊'}
        </button>
        <button className="btn btn--primary" onClick={onClose} disabled={busy}>
          完成
        </button>
      </div>
    </>
  );
}
