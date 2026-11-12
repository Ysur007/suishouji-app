import { useEffect, useRef, useState } from 'react';
import { formatDateTime } from '../lib/format';
import { liveFolders, useApp } from '../lib/store';
import { useUI } from '../lib/ui';
import { IconPlus, IconTrash } from './Icons';

export function MemoEditorBody({ memoId, onClose }: { memoId: string; onClose: () => void }) {
  const memo = useApp((s) => s.memos[memoId]);
  const folders = useApp((s) => s.folders);
  const updateMemo = useApp((s) => s.updateMemo);
  const deleteMemo = useApp((s) => s.deleteMemo);
  const notify = useApp((s) => s.notify);

  const [text, setText] = useState(memo?.text ?? '');
  const [folderId, setFolderId] = useState<string | null>(memo?.folderId ?? null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const addFolder = useApp((s) => s.addFolder);

  useEffect(() => {
    areaRef.current?.focus();
    const len = areaRef.current?.value.length ?? 0;
    areaRef.current?.setSelectionRange(len, len);
  }, []);

  if (!memo || memo.deleted) return null;

  const save = () => {
    if (!text.trim() && memo.images.length === 0) {
      deleteMemo(memoId);
      notify('内容为空，已删除');
      onClose();
      return;
    }
    setSaving(true);
    updateMemo(memoId, { text, folderId });
    notify('已保存，其他设备正在同步');
    onClose();
  };

  const remove = () => {
    deleteMemo(memoId);
    notify('已删除');
    onClose();
  };

  const list = liveFolders(folders);

  return (
    <>
      <div className="sheet__title">编辑记录</div>
      <div className="sheet__desc">
        {formatDateTime(memo.createdAt)}
        {memo.updatedAt !== memo.createdAt ? ` · 修改于 ${formatDateTime(memo.updatedAt)}` : ''}
      </div>

      <div className="sheet__body">
        <textarea
          ref={areaRef}
          className="field__input"
          style={{ minHeight: 148 }}
          value={text}
          placeholder="写点什么…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save();
            }
          }}
        />

        {memo.images.length > 0 && (
          <div className="field">
            <span className="field__label">图片</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {memo.images.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  style={{ width: 62, height: 62, objectFit: 'cover', borderRadius: 10 }}
                  onClick={() => useUI.getState().openLightbox(src)}
                />
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <span className="field__label">归档到</span>
          <div className="row-options">
            <button className="option" data-active={!folderId} onClick={() => setFolderId(null)}>
              未分类
            </button>
            {list.map((f) => (
              <button
                key={f.id}
                className="option"
                data-active={folderId === f.id}
                onClick={() => setFolderId(f.id)}
              >
                <span className="option__dot" style={{ background: `var(--tone-${f.tone})` }} />
                {f.name}
              </button>
            ))}
            {adding ? (
              <input
                className="option"
                autoFocus
                placeholder="新文件夹名"
                value={newName}
                style={{ width: 124 }}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={() => {
                  setAdding(false);
                  setNewName('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setAdding(false);
                    setNewName('');
                    return;
                  }
                  if (e.key === 'Enter' && newName.trim()) {
                    e.preventDefault();
                    const id = addFolder({ name: newName, glyph: 'book', tone: 'sand' });
                    setFolderId(id);
                    setNewName('');
                    setAdding(false);
                  }
                }}
              />
            ) : (
              <button className="option" onClick={() => setAdding(true)} style={{ color: 'var(--accent)' }}>
                <IconPlus width={13} height={13} />
                新建
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="sheet__actions">
        <button className="btn btn--danger" style={{ flex: '0 0 96px' }} onClick={remove} disabled={saving}>
          <IconTrash width={16} height={16} />
          删除
        </button>
        <button className="btn btn--primary" onClick={save} disabled={saving}>
          保存
        </button>
      </div>
    </>
  );
}
