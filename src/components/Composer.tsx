import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { filesToImages } from '../lib/image';
import { liveFolders, useApp } from '../lib/store';
import { IconClose, IconFolder, IconImage, IconSend } from './Icons';

export function Composer() {
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false);

  const addMemo = useApp((s) => s.addMemo);
  const loggedIn = useApp((s) => Boolean(s.auth));
  const lastUser = useApp((s) => s.lastUser);
  const activeSpace = useApp((s) => s.activeSpace);
  const groups = useApp((s) => s.groups);
  const inGroup = activeSpace.startsWith('g:');
  const groupName = inGroup ? groups[activeSpace.slice(2)]?.name : null;
  const folders = useApp((s) => s.folders);
  const folderList = liveFolders(folders);
  const target = targetId ? folders[targetId] : null;
  const targetName = target && !target.deleted ? target.name : null;

  const resize = () => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 148)}px`;
  };

  useEffect(() => {
    const focus = () => areaRef.current?.focus();
    window.addEventListener('ssj:focus-composer', focus);
    return () => window.removeEventListener('ssj:focus-composer', focus);
  }, []);

  useEffect(() => {
    resize();
  }, [text]);

  const canSend = (text.trim().length > 0 || images.length > 0) && !busy;

  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    addMemo({ text, images, folderId: targetId });
    setText('');
    setImages([]);
    requestAnimationFrame(() => {
      resize();
      setBusy(false);
    });
  };

  const pickImages = async (files: FileList | File[] | null) => {
    if (!files || !files.length) return;
    const urls = await filesToImages(files);
    if (urls.length) setImages((prev) => [...prev, ...urls].slice(0, 4));
  };

  return (
    <div className="composer-wrap">
      <div className="composer-wrap__inner">
        <AnimatePresence>
          {images.length > 0 && (
            <motion.div
              className="attachments"
              initial={{ opacity: 0, height: 0, marginBottom: 6 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 6 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 34 }}
            >
              {images.map((src, i) => (
                <motion.div
                  key={i}
                  className="attachment"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                >
                  <img src={src} alt="" />
                  <button
                    className="attachment__x"
                    aria-label="移除图片"
                    onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <IconClose />
                  </button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="composer">
          <textarea
            ref={areaRef}
            className="composer__input"
            value={text}
            rows={1}
            placeholder={
              groupName ? `发到「${groupName}」…` : targetName ? `记点什么… 归入「${targetName}」` : '记点什么…'
            }
            onChange={(e) => {
              setText(e.target.value);
              resize();
            }}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={() => {
              composing.current = false;
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              if (e.nativeEvent.isComposing || composing.current) return;
              if (e.metaKey || e.ctrlKey) {
                e.preventDefault();
                void send();
                return;
              }
              if (!e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files);
              if (files.length) {
                e.preventDefault();
                void pickImages(files);
              }
            }}
          />

          <div className="composer__btns">
            {folderList.length > 0 && !inGroup && (
              <button
                className="circle-btn circle-btn--ghost"
                aria-label="选择文件夹"
                data-on={Boolean(targetId)}
                onClick={() => setPicker((v) => !v)}
              >
                <IconFolder />
              </button>
            )}
            <button
              className="circle-btn circle-btn--ghost"
              aria-label="添加图片"
              onClick={() => fileRef.current?.click()}
            >
              <IconImage />
            </button>
            <motion.button
              className="circle-btn circle-btn--send"
              aria-label="记录"
              disabled={!canSend}
              onClick={() => void send()}
              whileTap={{ scale: 0.88 }}
              animate={{ scale: canSend ? 1 : 0.94, opacity: canSend ? 1 : 0.4 }}
              transition={{ type: 'spring', stiffness: 480, damping: 28 }}
            >
              <IconSend />
            </motion.button>
          </div>
        </div>

        <div className="composer__hint" aria-hidden>
          <span>
            <kbd>Enter</kbd> 记录 · <kbd>Shift</kbd>+<kbd>Enter</kbd> 换行
          </span>
          <span>
            {targetName
              ? `新记录将归入 ${targetName}`
              : groupName
                ? `群内 ${groups[activeSpace.slice(2)]?.members.length ?? 0} 人可见`
                : loggedIn
                  ? '所有设备实时同步'
                : lastUser
                  ? '已退出登录 · 只写在本机'
                  : '仅保存在本机，登录后并入账号'}
          </span>
        </div>

        <AnimatePresence>
          {picker && (
            <>
              <div className="pop-scrim" onClick={() => setPicker(false)} />
              <motion.div
                className="folder-pop"
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 480, damping: 34 }}
              >
                <div className="folder-pop__label">新记录归入</div>
                <button
                  className="folder-pop__item"
                  data-active={!targetId}
                  onClick={() => {
                    setTargetId(null);
                    setPicker(false);
                  }}
                >
                  <span className="folder-pop__dot" style={{ background: '#dcdcdc' }} />
                  未分类
                </button>
                {folderList.map((f) => (
                  <button
                    key={f.id}
                    className="folder-pop__item"
                    data-active={targetId === f.id}
                    onClick={() => {
                      setTargetId(f.id);
                      setPicker(false);
                    }}
                  >
                    <span
                      className="folder-pop__dot"
                      style={{ background: `var(--tone-${f.tone})` }}
                    />
                    {f.name}
                  </button>
                ))}
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void pickImages(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
