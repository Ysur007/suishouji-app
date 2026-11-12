/** AI 能力的客户端封装：整理走普通 JSON，对话走 SSE 流。 */

import { readAuth } from './auth';
import { apiUrl } from './endpoint';

export type Engine = 'llm' | 'local';

export interface Topic {
  id: string;
  title: string;
  keywords: string[];
  count: number;
  share: number;
  summary: string;
  memoIds: string[];
  lastAt: number;
  loose?: boolean;
}

export interface TodoItem {
  text: string;
  memoId: string;
  cue: string;
}

export interface OrganizeReport {
  id: string;
  createdAt: number;
  engine: Engine;
  model: string | null;
  range: { label: string; days: number | null; count: number; from: number; to: number };
  overview: { total: number; chars: number; topics: number; todos: number; spanDays: number };
  topics: Topic[];
  todos: TodoItem[];
  quotes: Array<{ text: string; memoId: string }>;
  suggestion: string;
  empty?: boolean;
}

export interface ChatRef {
  id: string;
  text: string;
  createdAt: number;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  refs?: ChatRef[];
  engine?: Engine;
}

export interface AiStatus {
  engine: Engine;
  model: string | null;
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const auth = readAuth();
  if (!auth) throw new Error('请先登录');
  const res = await fetch(apiUrl(path), {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${auth.token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

export function aiStatus() {
  return call<AiStatus>('/api/ai/status');
}

export function organize(input: { spaceId?: string; days?: number | null; folderId?: string | null }) {
  return call<{ report: OrganizeReport }>('/api/ai/organize', input);
}

/**
 * 流式对话。
 *
 * 用 fetch + ReadableStream 而不是 EventSource：EventSource 只能 GET，带不了 body 和 Authorization。
 * 返回一个 abort 函数。
 */
export function chatStream(
  input: { messages: Array<{ role: 'user' | 'assistant'; content: string }>; spaceId?: string },
  handlers: {
    onDelta: (text: string) => void;
    onDone: (payload: { refs: ChatRef[]; engine: Engine; model: string | null }) => void;
    onError: (message: string) => void;
  },
): () => void {
  const ctrl = new AbortController();
  const auth = readAuth();

  void (async () => {
    if (!auth) {
      handlers.onError('请先登录');
      return;
    }
    try {
      const res = await fetch(apiUrl('/api/ai/chat'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${auth.token}` },
        body: JSON.stringify(input),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const msg = (await res.json().catch(() => ({}))) as { error?: string };
        handlers.onError(msg.error || `服务端返回 ${res.status}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx = buffer.indexOf('\n\n');
        while (idx >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 2);
          if (line.startsWith('data:')) {
            try {
              const ev = JSON.parse(line.slice(5).trim()) as {
                delta?: string;
                done?: boolean;
                refs?: ChatRef[];
                engine?: Engine;
                model?: string | null;
                error?: string;
              };
              if (ev.error) handlers.onError(ev.error);
              else if (ev.delta) handlers.onDelta(ev.delta);
              else if (ev.done)
                handlers.onDone({
                  refs: ev.refs ?? [],
                  engine: ev.engine ?? 'local',
                  model: ev.model ?? null,
                });
            } catch {
              /* 半包，等下一块 */
            }
          }
          idx = buffer.indexOf('\n\n');
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') handlers.onError((err as Error).message);
    }
  })();

  return () => ctrl.abort();
}
