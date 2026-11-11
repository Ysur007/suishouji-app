import { useState } from 'react';
import { useUI } from '../lib/ui';
import { useApp } from '../lib/store';
import { GLYPHS, TONES, type GlyphKey, type ToneKey } from '../lib/types';
import { FolderIcon } from './FolderIcon';
import { GLYPH_MAP } from './Icons';

export function NewFolderBody({ onClose }: { onClose: () => void }) {
  const addFolder = useApp((s) => s.addFolder);
  const setFolderFilter = useApp((s) => s.setFolderFilter);
  const setTab = useApp((s) => s.setTab);
  const notify = useApp((s) => s.notify);

  const [name, setName] = useState('');
  const [glyph, setGlyph] = useState<GlyphKey>('book');
  const [tone, setTone] = useState<ToneKey>('sand');

  const create = () => {
    if (!name.trim()) {
      notify('给文件夹起个名字吧', 'error');
      return;
    }
    const id = addFolder({ name, glyph, tone });
    setFolderFilter(id);
    setTab('space');
    useUI.getState().close();
    notify(`已创建「${name.trim()}」`);
  };

  return (
    <>
      <div className="sheet__title">新建文件夹</div>
      <div className="sheet__desc">文件夹用来把散落的记录收拢，删掉文件夹不会带走里面的内容。</div>

      <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 18px' }}>
        <div style={{ width: 104 }}>
          <FolderIcon tone={tone} glyph={glyph} />
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-3)', marginTop: 8 }}>
            {name.trim() || '未命名'}
          </div>
        </div>
      </div>

      <div className="sheet__body">
        <div className="field">
          <input
            className="field__input"
            autoFocus
            value={name}
            maxLength={18}
            placeholder="比如：周末去处、Dev、旅行"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create();
            }}
          />
        </div>

        <div className="field">
          <span className="field__label">图标</span>
          <div className="row-options">
            {GLYPHS.map((g) => {
              const Glyph = GLYPH_MAP[g];
              return (
                <button
                  key={g}
                  className="option"
                  data-active={glyph === g}
                  style={{ width: 38, height: 38, padding: 0, justifyContent: 'center' }}
                  onClick={() => setGlyph(g)}
                  aria-label={g}
                >
                  <Glyph width={17} height={17} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="field">
          <span className="field__label">颜色</span>
          <div className="row-options">
            {TONES.map((t) => (
              <button
                key={t}
                className="option"
                data-active={tone === t}
                style={{ width: 38, height: 38, padding: 0, justifyContent: 'center' }}
                onClick={() => setTone(t)}
                aria-label={t}
              >
                <span
                  className="option__dot"
                  style={{ width: 16, height: 16, borderRadius: 5, background: `var(--tone-${t})` }}
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="sheet__actions">
        <button className="btn btn--ghost" onClick={onClose}>
          取消
        </button>
        <button className="btn btn--primary" onClick={create}>
          创建
        </button>
      </div>
    </>
  );
}

export function RenameFolderBody({ folderId, onClose }: { folderId: string; onClose: () => void }) {
  const folder = useApp((s) => s.folders[folderId]);
  const updateFolder = useApp((s) => s.updateFolder);
  const notify = useApp((s) => s.notify);

  const [name, setName] = useState(folder?.name ?? '');
  const [glyph, setGlyph] = useState<GlyphKey>(folder?.glyph ?? 'book');
  const [tone, setTone] = useState<ToneKey>(folder?.tone ?? 'sand');

  if (!folder || folder.deleted) return null;

  const save = () => {
    if (!name.trim()) {
      notify('名字不能为空', 'error');
      return;
    }
    updateFolder(folderId, { name, glyph, tone });
    notify('已更新');
    onClose();
  };

  return (
    <>
      <div className="sheet__title">编辑文件夹</div>
      <div className="sheet__desc">改个名字或换个颜色，所有设备会一起更新。</div>

      <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 18px' }}>
        <div style={{ width: 104 }}>
          <FolderIcon tone={tone} glyph={glyph} />
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-3)', marginTop: 8 }}>
            {name.trim() || '未命名'}
          </div>
        </div>
      </div>

      <div className="sheet__body">
        <div className="field">
          <input
            className="field__input"
            autoFocus
            value={name}
            maxLength={18}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
          />
        </div>

        <div className="field">
          <span className="field__label">图标</span>
          <div className="row-options">
            {GLYPHS.map((g) => {
              const Glyph = GLYPH_MAP[g];
              return (
                <button
                  key={g}
                  className="option"
                  data-active={glyph === g}
                  style={{ width: 38, height: 38, padding: 0, justifyContent: 'center' }}
                  onClick={() => setGlyph(g)}
                  aria-label={g}
                >
                  <Glyph width={17} height={17} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="field">
          <span className="field__label">颜色</span>
          <div className="row-options">
            {TONES.map((t) => (
              <button
                key={t}
                className="option"
                data-active={tone === t}
                style={{ width: 38, height: 38, padding: 0, justifyContent: 'center' }}
                onClick={() => setTone(t)}
                aria-label={t}
              >
                <span
                  className="option__dot"
                  style={{ width: 16, height: 16, borderRadius: 5, background: `var(--tone-${t})` }}
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="sheet__actions">
        <button className="btn btn--ghost" onClick={onClose}>
          取消
        </button>
        <button className="btn btn--primary" onClick={save}>
          保存
        </button>
      </div>
    </>
  );
}
