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
  notice?: string;
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

export type Provider = 'auto' | 'openai' | 'anthropic' | 'gemini';

export interface AiStatus {
  engine: Engine;
  configured: boolean;
  provider: Provider;
  resolved: Exclude<Provider, 'auto'>;
  baseUrl: string;
  model: string;
  keyHint: string;
  source: 'file' | 'env' | 'default';
}

export interface AiConfig {
  provider: Provider;
  resolved: Exclude<Provider, 'auto'>;
  baseUrl: string;
  model: string;
  maxTokens: number;
  hasKey: boolean;
  keyHint: string;
  source: 'file' | 'env' | 'default';
}

export interface ProbeResult {
  ok: boolean;
  provider: Exclude<Provider, 'auto'>;
  model: string;
  latency: number;
  sample: string;
  error?: string;
}

/** 把服务端的原始报错翻成人话，尤其是「接口根本不存在」这种升级后常见的情况 */
export function friendlyError(message: string): string {
  const msg = message.trim();
  if (/not found/i.test(msg)) {
    return '服务端没有 AI 接口（/api/ai/* 返回 404）。通常是正在运行的进程还是旧代码：重启服务后再试；本地开发如果是新拉的代码，确认已经重新启动。';
  }
  if (/401|unauthorized/i.test(msg)) return 'API Key 无效或没有权限（401）。检查 Key 是否填错、是否过期。';
  if (/403|forbidden/i.test(msg)) return '接口拒绝访问（403）。可能是 Key 无权访问该模型，或需要开启对应权限。';
  if (/404/.test(msg)) return '接口地址不对（404）。检查 Base URL 与服务商选择是否匹配。';
  if (/429|rate limit/i.test(msg)) return '触发限流（429）。稍后再试，或换一个模型。';
  if (/timeout|aborted/i.test(msg)) return '请求超时。检查网络，或换一个更近的接口地址。';
  return msg;
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

export interface LegacyAiHint {
  available: boolean;
  keyHint: string;
}

export function getAiConfig() {
  return call<{ config: AiConfig; legacy?: LegacyAiHint }>('/api/ai/config');
}

/** 把旧版全站配置领到当前账号名下（只能领一次） */
export function importLegacyAiConfig() {
  return call<{ config: AiConfig; engine: Engine }>('/api/ai/config/import-legacy', {});
}

export function saveAiConfig(patch: {
  provider?: Provider;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}) {
  return call<{ config: AiConfig; resolved: string; engine: Engine }>('/api/ai/config', patch);
}

export function clearAiConfig() {
  return call<{ config: AiConfig; engine: Engine }>('/api/ai/config', { clear: true });
}

export function testAiConfig() {
  return call<ProbeResult>('/api/ai/config/test', {});
}

export interface AiModelOption {
  id: string;
  label: string;
}

export interface AiModelList {
  models: AiModelOption[];
  provider: Exclude<Provider, 'auto'>;
  endpoint: string;
  count: number;
  note?: string;
}

/** 查当前接口有哪些模型。地址/Key 可以传表单里的草稿值，不必先保存。 */
export function listAiModels(draft: { provider?: Provider; baseUrl?: string; apiKey?: string } = {}) {
  return call<AiModelList>('/api/ai/models', draft);
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
