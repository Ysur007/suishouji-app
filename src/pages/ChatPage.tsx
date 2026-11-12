/**
 * 对话页：就着自己的记录提问。
 *
 * 和「整理」的区别：整理是一次性的批处理产出；对话是可以追问的连续上下文。
 * 所以它独占一个整页，有自己的会话列表、自己的输入框，不复用底部那个记录输入框——
 * 那个框写下去会变成一条记录，这里写下去只是一句话。
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { chatStream, type ChatRef, type ChatTurn } from '../lib/ai';
import { EngineTag } from '../components/EngineTag';
import { useAi } from '../lib/aiui';
import { liveMemos, useApp } from '../lib/store';
import { useUI } from '../lib/ui';
import { IconChat, IconList, IconPlus, IconSend, IconSpark } from '../components/Icons';
import { LoginGate } from '../components/LoginGate';

const SUGGESTIONS = [
  '这段时间我都在忙什么？',
  '有哪些答应过但还没做的事？',
  '帮我把最近的记录分个类',
  '上周我记了些什么？',
];

export function ChatPage() {
  const bucket = useApp((s) => s.viewBucket);
  const auth = useApp((s) => s.auth);
  const activeSpace = useApp((s) => s.activeSpace);
  const groups = useApp((s) => s.groups);
  const memos = useApp((s) => s.memos);

  const load = useAi((s) => s.load);
  const chatId = useAi((s) => s.chatId);
  const newChat = useAi((s) => s.newChat);
  const setStoredTurns = useAi((s) => s.setTurns);

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const turnsRef = useRef<ChatTurn[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    load(bucket);
  }, [bucket, load]);

  const refreshStatus = useAi((s) => s.refreshStatus);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // 没有会话就补一个空的。
  // 注意要跟着 chatId 走：bucket 从「游客」切到账号时 load() 会把 chatId 置空，
  // 只在挂载时跑一次的话，之后第一条消息会落在「没有会话」的状态里被丢掉。
  useEffect(() => {
    if (!chatId) newChat();
  }, [chatId, newChat]);

  useEffect(() => {
    const session = useAi.getState().chats.find((c) => c.id === chatId);
    const next = session?.turns ?? [];
    setTurns(next);
    turnsRef.current = next;
    setError(null);
  }, [chatId]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  useEffect(() => () => abortRef.current?.(), []);

  const groupName = activeSpace.startsWith('g:') ? groups[activeSpace.slice(2)]?.name : null;
  const scopeLabel = groupName ? `「${groupName}」` : '我的记录';
  const scopeCount = liveMemos(memos).filter((m) => (m.spaceId ?? bucket) === activeSpace).length;

  // 用 ref 作为唯一真相：onDone 里要立刻把 turns 存进 store，
  // 如果只依赖 setState 的 updater，闭包可能还没跑，存下去的就是没有 refs 的旧值
  const apply = (fn: (prev: ChatTurn[]) => ChatTurn[]) => {
    const next = fn(turnsRef.current);
    turnsRef.current = next;
    setTurns(next);
  };

  const send = (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    const id = chatId ?? newChat();
    setError(null);
    setInput('');
    setBusy(true);

    const history: ChatTurn[] = [...turnsRef.current, { role: 'user', content: text }];
    const pending: ChatTurn[] = [...history, { role: 'assistant', content: '' }];
    // 先落 store：新建会话会让 chatId 变化，effect 会按 store 里的 turns 覆盖本地状态，
    // 不先写进去的话，刚发的那句会被空 turns 冲掉（表现为「发出去没反应」）
    setStoredTurns(id, pending);
    turnsRef.current = pending;
    setTurns(pending);

    abortRef.current = chatStream(
      {
        messages: history.map((t) => ({ role: t.role, content: t.content })),
        spaceId: activeSpace,
      },
      {
        onDelta: (delta) => {
          apply((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            copy[copy.length - 1] = { ...last, content: last.content + delta };
            return copy;
          });
        },
        onDone: ({ refs, engine }) => {
          apply((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            copy[copy.length - 1] = { ...last, refs, engine };
            return copy;
          });
          setBusy(false);
          setStoredTurns(id, turnsRef.current);
        },
        onError: (message) => {
          setBusy(false);
          setError(message);
          apply((prev) => prev.slice(0, -1));
        },
      },
    );
  };

  const stop = () => {
    abortRef.current?.();
    abortRef.current = null;
    setBusy(false);
    if (chatId) setStoredTurns(chatId, turnsRef.current);
  };

  const openSheet = useUI((s) => s.open);

  return (
    <div className="chatPage">
      <header className="aiHead aiHead--chat">
        <div className="aiHead__main">
          <h1 className="aiHead__title">
            对话
            <span className="aiHead__scope">基于 {scopeLabel}</span>
          </h1>
          <p className="aiHead__desc">
            {scopeCount} 条记录可用。问它你写过什么、还有什么没做，回答会带引用的原记录。
          </p>
        </div>
        <div className="aiHead__side">
          <EngineTag />
          <button
            className="icon-btn icon-btn--bordered chatHistory"
            aria-label="对话列表"
            title="对话列表"
            onClick={() => openSheet({ kind: 'chats' })}
          >
            <IconList width={17} height={17} />
          </button>
          <button
            className="icon-btn icon-btn--bordered"
            aria-label="新对话"
            title="新对话"
            onClick={() => newChat()}
          >
            <IconPlus width={17} height={17} />
          </button>
        </div>
      </header>

      {!auth ? (
        <div className="aiGateWrap">
          <LoginGate
            title="对话需要登录"
            desc="回答要从你的记录里检索，服务端得先知道这些记录属于谁。登录后回到这里就能直接问，未登录时写的记录也会并进账号。"
            benefits={['检索自己的记录', '多设备同步', '回答带引用原文']}
          />
        </div>
      ) : (
        <>
      <div className="chatScroll" ref={scrollRef}>
        <div className="chatColumn" data-empty={turns.length === 0 ? 'true' : undefined}>
          {turns.length === 0 ? (
            <ChatEmpty onPick={(q) => send(q)} />
          ) : (
            turns.map((t, i) =>
              t.role === 'user' ? (
                <div key={i} className="chatRow chatRow--me">
                  <div className="chatBubble">{t.content}</div>
                </div>
              ) : (
                <AssistantTurn
                  key={i}
                  turn={t}
                  streaming={busy && i === turns.length - 1}
                  onOpenRef={(ref: ChatRef) => openSheet({ kind: 'editor', memoId: ref.id })}
                />
              ),
            )
          )}

          {error ? <div className="orgError">{error}</div> : null}
        </div>
      </div>

      <div className="chatComposer">
        <div className="chatComposer__inner">
          <textarea
            className="chatInput"
            rows={1}
            value={input}
            placeholder={`就 ${scopeLabel} 里的记录提问…`}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(160, e.target.scrollHeight)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button
            className="chatSend"
            aria-label={busy ? '停止' : '发送'}
            data-busy={busy}
            onClick={() => (busy ? stop() : send())}
          >
            {busy ? <span className="chatSend__stop" /> : <IconSend />}
          </button>
        </div>
        <div className="chatHint">
          Enter 发送 · Shift + Enter 换行 · 回答基于你自己的记录，不联网检索
        </div>
      </div>
        </>
      )}
    </div>
  );
}

function ChatEmpty({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="chatEmpty">
      <div className="chatEmpty__mark">
        <IconChat width={20} height={20} />
      </div>
      <div className="chatEmpty__title">问点具体的</div>
      <div className="chatEmpty__desc">
        它只读你的记录，不会编。可以从这几个问题开始：
      </div>
      <div className="chatEmpty__grid">
        {SUGGESTIONS.map((q) => (
          <button key={q} className="chatChip" onClick={() => onPick(q)}>
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function AssistantTurn({
  turn,
  streaming,
  onOpenRef,
}: {
  turn: ChatTurn;
  streaming: boolean;
  onOpenRef: (ref: ChatRef) => void;
}) {
  const lines = turn.content.split('\n');

  return (
    <motion.div
      className="chatRow chatRow--ai"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="chatAva" aria-hidden>
        <IconSpark width={13} height={13} />
      </div>
      <div className="chatAiBody">
        <div className="chatAiText">
          {lines.map((line, i) =>
            line.trim() === '' ? (
              <span key={i} className="chatAiGap" />
            ) : (
              <p key={i} data-list={/^\s*(\d+[.、]|[-•])\s/.test(line) || undefined}>
                {line}
              </p>
            ),
          )}
          {streaming && turn.content === '' ? <span className="chatCursor" /> : null}
          {streaming && turn.content !== '' ? <span className="chatCursor" /> : null}
        </div>

        {turn.refs?.length ? (
          <div className="chatRefs">
            <span className="chatRefs__label">引用</span>
            {turn.refs.slice(0, 4).map((r) => (
              <button key={r.id} className="chatRef" onClick={() => onOpenRef(r)}>
                <span className="chatRef__date">
                  {new Date(r.createdAt).getMonth() + 1}/{new Date(r.createdAt).getDate()}
                </span>
                <span className="chatRef__text">{r.text}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
