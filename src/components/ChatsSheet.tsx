/**
 * 对话列表。
 *
 * 桌面端在左侧面板里（SidePanel · ChatPanel），但窄屏上面板是藏起来的，
 * 手机上就完全没有「换一个对话」的入口——只能新开，旧对话再也回不去。
 * 这个浮层就是补那个入口，和面板里的行为一致：选中即切换，可删。
 */

import { useState } from 'react';
import { relativeTime } from '../lib/format';
import { useAi } from '../lib/aiui';
import { IconChat, IconPlus, IconTrash } from './Icons';

export function ChatsBody({ onClose }: { onClose: () => void }) {
  const chats = useAi((s) => s.chats);
  const chatId = useAi((s) => s.chatId);
  const newChat = useAi((s) => s.newChat);
  const selectChat = useAi((s) => s.selectChat);
  const dropChat = useAi((s) => s.dropChat);

  // 删除是两段式：第一下变成「确认」，再点才真删（手机上误触代价太大）
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <>
      <div className="sheet__title">对话</div>
      <div className="sheet__desc">每个会话单独保存，换一个接着问不会串。</div>

      <div className="sheet__body">
        <button
          className="chatSess__new"
          onClick={() => {
            newChat();
            onClose();
          }}
        >
          <IconPlus width={16} height={16} />
          新对话
        </button>

        {chats.length === 0 ? (
          <div className="chatSess__empty">
            <IconChat width={16} height={16} />
            还没有对话，问点什么就会出现在这里
          </div>
        ) : (
          <div className="chatSess">
            {chats.map((c) => (
              <div key={c.id} className="chatSess__row" data-active={c.id === chatId}>
                <button
                  className="chatSess__main"
                  onClick={() => {
                    selectChat(c.id);
                    onClose();
                  }}
                >
                  <span className="chatSess__title">{c.title}</span>
                  <span className="chatSess__sub">
                    {c.turns.length ? `${c.turns.length} 轮 · ${relativeTime(c.updatedAt)}` : '还没开始'}
                  </span>
                </button>
                <button
                  className="chatSess__x"
                  data-confirm={confirmId === c.id}
                  aria-label={confirmId === c.id ? '确认删除这个对话' : '删除这个对话'}
                  onClick={() => {
                    if (confirmId === c.id) {
                      dropChat(c.id);
                      setConfirmId(null);
                    } else {
                      setConfirmId(c.id);
                    }
                  }}
                >
                  {confirmId === c.id ? <span className="chatSess__confirm">删除</span> : <IconTrash width={14} height={14} />}
                </button>
              </div>
            ))}
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
