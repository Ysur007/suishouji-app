/**
 * 模型接入层：配置、服务商识别、三种主流协议适配。
 *
 * 支持三类接口规范：
 *
 * | provider    | 端点                        | 鉴权                        | 流式                        |
 * | ----------- | --------------------------- | --------------------------- | --------------------------- |
 * | openai      | `POST /v1/chat/completions`  | `Authorization: Bearer`     | SSE `choices[].delta`       |
 * | anthropic   | `POST /v1/messages`          | `x-api-key` + 版本头         | SSE `content_block_delta`   |
 * | gemini      | `POST /v1beta/models/…`      | `?key=`                     | SSE `alt=sse`               |
 *
 * `openai` 这一类同时覆盖所有 OpenAI 兼容网关：DeepSeek、Kimi、通义、OpenRouter、
 * Ollama、vLLM、OneAPI / New API 等，它们只是 base URL 与模型名不同。
 *
 * 配置来源优先级：`DATA_DIR/ai.json`（界面里保存的） > 环境变量 > 默认值。
 * 之所以让文件优先，是因为界面上的「保存」必须真的生效，否则用户会以为配置没起作用。
 */

import fs from 'node:fs';
import path from 'node:path';

export type Provider = 'auto' | 'openai' | 'anthropic' | 'gemini';
export type ResolvedProvider = Exclude<Provider, 'auto'>;

export interface LlmConfig {
  provider: Provider;
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
}

export interface PublicConfig {
  provider: Provider;
  resolved: ResolvedProvider;
  baseUrl: string;
  model: string;
  maxTokens: number;
  hasKey: boolean;
  keyHint: string;
  source: 'file' | 'env' | 'default';
}

const DEFAULTS = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  anthropic: { baseUrl: 'https://api.anthropic.com', model: 'claude-3-5-sonnet-latest' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-1.5-flash' },
};

export const PROVIDER_LABEL: Record<ResolvedProvider, string> = {
  openai: 'OpenAI 兼容',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
};

/* ------------------------------------------------------------------ *
 * 配置读写
 * ------------------------------------------------------------------ */

let cached: { at: number; file: string; cfg: LlmConfig | null } = { at: 0, file: '', cfg: null };

function envConfig(): Partial<LlmConfig> {
  const out: Partial<LlmConfig> = {};
  const p = (process.env.AI_PROVIDER || '').trim().toLowerCase();
  if (p === 'auto' || p === 'openai' || p === 'anthropic' || p === 'gemini') out.provider = p as Provider;
  if (process.env.AI_BASE_URL) out.baseUrl = process.env.AI_BASE_URL.trim();
  if (process.env.AI_API_KEY || process.env.OPENAI_API_KEY) {
    out.apiKey = (process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  }
  if (process.env.AI_MODEL) out.model = process.env.AI_MODEL.trim();
  if (process.env.AI_MAX_TOKENS) out.maxTokens = Number(process.env.AI_MAX_TOKENS) || 1024;
  return out;
}

function filePath(dataDir: string) {
  return path.join(dataDir, 'ai.json');
}

function readFileConfig(dataDir: string): Partial<LlmConfig> | null {
  const file = filePath(dataDir);
  try {
    const stat = fs.statSync(file);
    if (cached.file === file && cached.at === stat.mtimeMs) return cached.cfg as Partial<LlmConfig> | null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<LlmConfig>;
    cached = { at: stat.mtimeMs, file, cfg: parsed as LlmConfig };
    return parsed;
  } catch {
    cached = { at: Date.now(), file, cfg: null };
    return null;
  }
}

/** 合并后的最终配置 */
export function loadConfig(dataDir: string): LlmConfig & { source: 'file' | 'env' | 'default' } {
  const file = readFileConfig(dataDir) ?? {};
  const env = envConfig();
  const merged: LlmConfig = {
    provider: (file.provider ?? env.provider ?? 'auto') as Provider,
    baseUrl: (file.baseUrl ?? env.baseUrl ?? '').trim(),
    apiKey: (file.apiKey ?? env.apiKey ?? '').trim(),
    model: (file.model ?? env.model ?? '').trim(),
    maxTokens: Number(file.maxTokens ?? env.maxTokens ?? 1024) || 1024,
  };
  const source: 'file' | 'env' | 'default' =
    file.apiKey || file.baseUrl ? 'file' : env.apiKey || env.baseUrl ? 'env' : 'default';

  const resolved = resolveProvider(merged);
  // 地址/模型留空时按服务商补默认值，用户只需要填 key
  if (!merged.baseUrl) merged.baseUrl = DEFAULTS[resolved].baseUrl;
  if (!merged.model) merged.model = DEFAULTS[resolved].model;

  return { ...merged, source };
}

export function saveConfig(dataDir: string, patch: Partial<LlmConfig>): LlmConfig {
  const current = loadConfig(dataDir);
  const next: LlmConfig = {
    provider: (patch.provider ?? current.provider) as Provider,
    baseUrl: (patch.baseUrl ?? current.baseUrl).trim(),
    // 空字符串表示「不修改」，避免前端回显掩码时把 key 覆盖掉
    apiKey: patch.apiKey === undefined || patch.apiKey === '' ? current.apiKey : patch.apiKey.trim(),
    model: (patch.model ?? current.model).trim(),
    maxTokens: Number(patch.maxTokens ?? current.maxTokens) || 1024,
  };
  const file = filePath(dataDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2), { mode: 0o600 });
  cached = { at: 0, file, cfg: null };
  return next;
}

/** 清掉界面配置，回到环境变量 / 本地引擎 */
export function clearConfig(dataDir: string) {
  const file = filePath(dataDir);
  try {
    fs.unlinkSync(file);
  } catch {
    /* 本来就没有 */
  }
  cached = { at: 0, file, cfg: null };
}

export function publicConfig(dataDir: string): PublicConfig {
  const cfg = loadConfig(dataDir);
  const key = cfg.apiKey;
  return {
    provider: cfg.provider,
    resolved: resolveProvider(cfg),
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    maxTokens: cfg.maxTokens,
    hasKey: Boolean(key),
    keyHint: key ? `${key.slice(0, 3)}…${key.slice(-4)}` : '',
    source: cfg.source,
  };
}

/* ------------------------------------------------------------------ *
 * 服务商识别
 * ------------------------------------------------------------------ */

/**
 * 匹配顺序：
 *   1. 显式指定（provider 不是 auto）优先；
 *   2. 按地址特征识别：含 `anthropic` → Anthropic；含 `generativelanguage` / `gemini` → Gemini；
 *   3. 其余一律按 OpenAI 兼容处理——这是覆盖面最大的一类，认错时的代价也最小
 *      （只是端点路径不同，用户改一下 base URL 即可）。
 */
export function resolveProvider(cfg: Pick<LlmConfig, 'provider' | 'baseUrl'>): ResolvedProvider {
  if (cfg.provider !== 'auto') return cfg.provider;
  const url = (cfg.baseUrl || '').toLowerCase();
  if (url.includes('anthropic')) return 'anthropic';
  if (url.includes('generativelanguage.googleapis.com') || url.includes('gemini')) return 'gemini';
  return 'openai';
}

/* ------------------------------------------------------------------ *
 * 端点拼接
 * ------------------------------------------------------------------ */

function trimEnd(s: string) {
  return s.replace(/\/+$/, '');
}

function openaiEndpoint(base: string): string {
  const b = trimEnd(base);
  if (/\/chat\/completions$/i.test(b)) return b;
  if (/\/v\d+(\.\d+)?$/i.test(b)) return `${b}/chat/completions`;
  return `${b}/v1/chat/completions`;
}

function anthropicEndpoint(base: string): string {
  const b = trimEnd(base);
  if (/\/messages$/i.test(b)) return b;
  if (/\/v\d+$/i.test(b)) return `${b}/messages`;
  return `${b}/v1/messages`;
}

function geminiEndpoint(base: string, model: string, key: string, stream: boolean): string {
  const b = trimEnd(base);
  const root = /\/v1beta$/i.test(b) ? b : `${b}/v1beta`;
  const method = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
  return `${root}/models/${encodeURIComponent(model)}:${method}&key=${encodeURIComponent(key)}`.replace(
    ':generateContent&key=',
    ':generateContent?key=',
  );
}

/* ------------------------------------------------------------------ *
 * 消息格式转换
 * ------------------------------------------------------------------ */

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function splitSystem(messages: ChatTurn[]) {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n')
    .trim();
  const rest = messages.filter((m) => m.role !== 'system');
  return { system, rest };
}

/* ------------------------------------------------------------------ *
 * 调用
 * ------------------------------------------------------------------ */

/**
 * 把 HTTP 错误翻译成人能判断的一句话。
 *
 * 5xx 里 520–526 是 Cloudflare 专有的「源站异常」，和 Key、模型无关；
 * 返回 HTML 说明请求根本没到 API（域名错、被网关拦、或者源站挂了），
 * 这两种情况都不能把网页源码丢给用户看。
 */
function describeHttpError(status: number, raw: string): string {
  const text = raw.trim();
  const isHtml = /^<!doctype|^<html|^<head/i.test(text);
  const title = isHtml ? (text.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').trim() : '';

  if (status >= 520 && status <= 526) {
    return `HTTP ${status}：网关（Cloudflare）表示源站没有正常响应。这通常不是 Key 或模型的问题——服务商那边挂了，或者在维护。可以先在浏览器打开该地址看是否同样报错，或换一个服务商。`;
  }
  if (status === 502 || status === 503 || status === 504) {
    return `HTTP ${status}：上游服务暂时不可用或超时，稍后重试；持续如此就联系服务商。`;
  }
  if (isHtml) {
    return `HTTP ${status}：接口返回的是网页而不是 JSON${title ? `（${title}）` : ''}。检查接口地址是否写错（是否少了 /v1），或者这个域名被网关拦截了。`;
  }
  if (status === 401) return `HTTP 401：API Key 无效或没有权限。检查 Key 是否填错、是否过期。`;
  if (status === 403) return `HTTP 403：接口拒绝访问。可能是 Key 无权访问该模型，或需要开通权限。`;
  if (status === 404) return `HTTP 404：接口地址不存在。检查 Base URL 与服务商是否匹配（OpenAI 兼容要带 /v1）。`;
  if (status === 429) return `HTTP 429：触发限流，稍后再试或换模型。`;
  return `HTTP ${status}：${text.replace(/\s+/g, ' ').slice(0, 160) || '（无响应体）'}`;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs = 45000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'suishouji/1.2', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(describeHttpError(res.status, text));
    }
    if (!text) return {};
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      // 200 但返回网页：多半是域名指到了一个门户/登录页
      throw new Error(describeHttpError(res.status, text));
    }
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(url: string, headers: Record<string, string>, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json', 'user-agent': 'suishouji/1.2', ...headers },
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(describeHttpError(res.status, text));
    if (!text) throw new Error('接口返回为空');
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(describeHttpError(res.status, text));
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new Error('请求超时：列模型接口 20 秒没有响应');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ *
 * 模型列表
 * ------------------------------------------------------------------ */

/**
 * 三种协议的「列模型」端点：
 *   openai     `GET {v1}/models`        → `{ data: [{ id }] }`
 *   anthropic  `GET {v1}/models`        → `{ data: [{ id, display_name }], has_more }`
 *   gemini     `GET {v1beta}/models`    → `{ models: [{ name, displayName, supportedGenerationMethods }] }`
 *
 * OpenAI 兼容网关（DeepSeek / Kimi / 通义 / OpenRouter / Ollama / OneAPI…）大多实现了
 * `/v1/models`，但也有只做 chat 的极简网关返回 404——那种情况退回手填即可，不是故障。
 */
function modelsEndpoint(base: string, resolved: ResolvedProvider, key: string): string {
  const b = trimEnd(base);
  if (resolved === 'gemini') {
    const root = /\/v1beta$/i.test(b) ? b : `${b}/v1beta`;
    return `${root}/models?pageSize=200&key=${encodeURIComponent(key)}`;
  }
  if (resolved === 'anthropic') {
    if (/\/models$/i.test(b)) return `${b}?limit=1000`;
    if (/\/v\d+$/i.test(b)) return `${b}/models?limit=1000`;
    return `${b}/v1/models?limit=1000`;
  }
  const root = b.replace(/\/chat\/completions$/i, '');
  if (/\/models$/i.test(root)) return root;
  if (/\/v\d+(\.\d+)?$/i.test(root)) return `${root}/models`;
  return `${root}/v1/models`;
}

export interface ModelOption {
  id: string;
  label: string;
}

/** 去掉 Gemini 的 `models/` 前缀；OpenAI 网关偶尔返回裸数组、或把 id 放在 name 里 */
function pickModels(resolved: ResolvedProvider, data: Record<string, unknown>): ModelOption[] {
  const out: ModelOption[] = [];
  const push = (id: unknown, label?: unknown) => {
    if (typeof id !== 'string' || !id.trim()) return;
    const clean = id.replace(/^models\//, '').trim();
    if (!clean) return;
    out.push({ id: clean, label: typeof label === 'string' && label.trim() ? label.trim() : clean });
  };

  if (resolved === 'gemini') {
    const list = (data.models ?? []) as Array<Record<string, unknown>>;
    for (const m of list) {
      // 只留能对话的：Gemini 的列表里混着 embedding / aqa 等不能 generateContent 的
      const methods = (m.supportedGenerationMethods ?? []) as string[];
      if (methods.length && !methods.includes('generateContent')) continue;
      push(m.name, m.displayName);
    }
    return out;
  }

  const list = (Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : []) as Array<
    Record<string, unknown> | string
  >;
  for (const item of list) {
    if (typeof item === 'string') push(item);
    else push(item.id ?? item.name ?? item.model, item.display_name ?? item.displayName);
  }
  return out;
}

/** 这些模型拿去 chat/completions 一定失败，不该出现在选模型的列表里 */
const NON_CHAT = /embed|whisper|\btts\b|audio|dall-e|moderation|rerank|guard|ocr/;

/** 对话模型排前面：OpenAI 的列表里 60% 是 embedding / tts / whisper / 图像模型 */
function rankModel(id: string): number {
  const s = id.toLowerCase();
  if (NON_CHAT.test(s)) return 2;
  if (/chat|instruct|gpt-4|gpt-3\.5|gpt-5|claude|gemini|deepseek|qwen|kimi|moonshot|glm|llama|mistral|doubao|hunyuan|ernie|yi-/.test(s))
    return 0;
  return 1;
}

export interface ModelListResult {
  models: ModelOption[];
  provider: ResolvedProvider;
  endpoint: string;
  count: number;
  note?: string;
}

/**
 * 查询当前接口的可用模型。
 *
 * `draft` 允许前端传「还没保存」的地址/Key/服务商——用户填完 Key 就想看列表，
 * 不该被迫先保存一次。Key 留空时才回落到已保存的那份。
 */
export async function listModels(
  dataDir: string,
  draft: { provider?: Provider; baseUrl?: string; apiKey?: string } = {},
): Promise<ModelListResult> {
  const saved = loadConfig(dataDir);
  const merged: LlmConfig = {
    provider: (draft.provider ?? saved.provider) as Provider,
    baseUrl: (draft.baseUrl ?? saved.baseUrl ?? '').trim() || saved.baseUrl,
    apiKey: (draft.apiKey ?? '').trim() || saved.apiKey,
    model: saved.model,
    maxTokens: saved.maxTokens,
  };
  const resolved = resolveProvider(merged);
  if (!merged.baseUrl) merged.baseUrl = DEFAULTS[resolved].baseUrl;
  if (!merged.apiKey) {
    throw new Error('还没有 API Key：先填上（或先保存一次）再拉列表');
  }

  const url = modelsEndpoint(merged.baseUrl, resolved, merged.apiKey);
  const headers: Record<string, string> =
    resolved === 'gemini'
      ? {}
      : resolved === 'anthropic'
        ? { 'x-api-key': merged.apiKey, 'anthropic-version': '2023-06-01' }
        : { authorization: `Bearer ${merged.apiKey}` };

  let data: Record<string, unknown>;
  try {
    data = await getJson(url, headers);
  } catch (err) {
    const msg = (err as Error).message;
    // /models 不是 chat 的硬依赖：多数极简网关没实现，退手填即可
    if (/HTTP 40[45]/.test(msg)) {
      const code = msg.match(/HTTP (\d{3})/)?.[1] ?? '404';
      throw new Error(
        `这个接口没有提供模型清单（GET ${safeEndpointOf(url)} 返回 ${code}）。只能手填模型名——服务商文档或控制台里能查到。`,
      );
    }
    throw err;
  }

  const seen = new Set<string>();
  const all = pickModels(resolved, data).filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  // 过滤掉必然不能对话的；万一网关命名不规范把全部筛没了，就保留原样
  const chatOnly = all.filter((m) => !NON_CHAT.test(m.id.toLowerCase()));
  const models = (chatOnly.length ? chatOnly : all).sort(
    (a, b) => rankModel(a.id) - rankModel(b.id) || a.id.localeCompare(b.id),
  );

  return {
    models,
    provider: resolved,
    endpoint: safeEndpointOf(url),
    count: models.length,
    note: models.length ? undefined : '接口返回了空列表，只能手填模型名',
  };
}

/** 端点里可能带 key（Gemini 走 query），回前端前必须洗掉 */
function safeEndpointOf(url: string): string {
  return url.replace(/key=[^&]*/i, 'key=***');
}

async function postStream(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  onText: (delta: string) => void,
  timeoutMs = 60000,
): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream', 'user-agent': 'suishouji/1.2', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) return false;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx = buffer.indexOf('\n');
      while (idx >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (line.startsWith('data:')) {
          const payload = line.slice(5).trim();
          if (payload && payload !== '[DONE]') {
            try {
              onText(extractStreamDelta(JSON.parse(payload)));
            } catch {
              /* 单个坏包忽略 */
            }
          }
        }
        idx = buffer.indexOf('\n');
      }
    }
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** 三种协议的流式增量字段各不相同，统一在这里取 */
function extractStreamDelta(ev: Record<string, unknown>): string {
  // OpenAI / 兼容网关
  const choices = ev.choices as Array<{ delta?: { content?: string } }> | undefined;
  if (choices?.[0]?.delta?.content) return choices[0].delta.content;
  // Anthropic
  const delta = ev.delta as { text?: string } | undefined;
  if (ev.type === 'content_block_delta' && delta?.text) return delta.text;
  // Gemini（alt=sse）
  const candidates = ev.candidates as
    | Array<{ content?: { parts?: Array<{ text?: string }> } }>
    | undefined;
  const parts = candidates?.[0]?.content?.parts;
  if (parts?.length) return parts.map((p) => p.text ?? '').join('');
  return '';
}

function buildOpenAi(cfg: LlmConfig, messages: ChatTurn[], json: boolean, stream: boolean) {
  return {
    url: openaiEndpoint(cfg.baseUrl),
    headers: { authorization: `Bearer ${cfg.apiKey}` },
    body: {
      model: cfg.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: 0.3,
      max_tokens: cfg.maxTokens,
      ...(stream ? { stream: true } : {}),
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    },
  };
}

function buildAnthropic(cfg: LlmConfig, messages: ChatTurn[], _json: boolean, stream: boolean) {
  const { system, rest } = splitSystem(messages);
  return {
    url: anthropicEndpoint(cfg.baseUrl),
    headers: {
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: {
      model: cfg.model,
      max_tokens: cfg.maxTokens,
      ...(system ? { system } : {}),
      messages: rest.map((m) => ({ role: m.role, content: m.content })),
      temperature: 0.3,
      ...(stream ? { stream: true } : {}),
    },
  };
}

function buildGemini(cfg: LlmConfig, messages: ChatTurn[], json: boolean, stream: boolean) {
  const { system, rest } = splitSystem(messages);
  return {
    url: geminiEndpoint(cfg.baseUrl, cfg.model, cfg.apiKey, stream),
    headers: {},
    body: {
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: rest.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: cfg.maxTokens,
        ...(json ? { responseMimeType: 'application/json' } : {}),
      },
    },
  };
}

function build(cfg: LlmConfig, resolved: ResolvedProvider, messages: ChatTurn[], json: boolean, stream: boolean) {
  if (resolved === 'anthropic') return buildAnthropic(cfg, messages, json, stream);
  if (resolved === 'gemini') return buildGemini(cfg, messages, json, stream);
  return buildOpenAi(cfg, messages, json, stream);
}

function extractText(resolved: ResolvedProvider, data: Record<string, unknown>): string {
  if (resolved === 'anthropic') {
    const blocks = data.content as Array<{ type?: string; text?: string }> | undefined;
    return (blocks ?? []).map((b) => b.text ?? '').join('').trim();
  }
  if (resolved === 'gemini') {
    const candidates = data.candidates as
      | Array<{ content?: { parts?: Array<{ text?: string }> } }>
      | undefined;
    return (candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
  }
  const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
  return (choices?.[0]?.message?.content ?? '').trim();
}

export interface LlmStatus {
  configured: boolean;
  provider: Provider;
  resolved: ResolvedProvider;
  model: string;
  baseUrl: string;
  keyHint: string;
  source: PublicConfig['source'];
}

export function statusOf(dataDir: string): LlmStatus {
  const pub = publicConfig(dataDir);
  return {
    configured: pub.hasKey,
    provider: pub.provider,
    resolved: pub.resolved,
    model: pub.model,
    baseUrl: pub.baseUrl,
    keyHint: pub.keyHint,
    source: pub.source,
  };
}

/** 一次性调用，返回纯文本 */
export async function chatComplete(
  dataDir: string,
  messages: ChatTurn[],
  opts: { json?: boolean } = {},
): Promise<string> {
  const cfg = loadConfig(dataDir);
  if (!cfg.apiKey) throw new Error('未配置 API Key');
  const resolved = resolveProvider(cfg);
  const { url, headers, body } = build(cfg, resolved, messages, Boolean(opts.json), false);
  const data = await postJson(url, headers, body);
  const text = extractText(resolved, data);
  if (!text) throw new Error('模型返回为空');
  return text;
}

/**
 * 流式调用。失败时（端点不支持、网关不吐 SSE）自动退回一次性调用再切片，
 * 保证界面上的「流式」在最差情况下仍然能逐句出现，而不是整块蹦出来。
 */
export async function chatStreamText(
  dataDir: string,
  messages: ChatTurn[],
  onDelta: (text: string) => void,
): Promise<string> {
  const cfg = loadConfig(dataDir);
  if (!cfg.apiKey) throw new Error('未配置 API Key');
  const resolved = resolveProvider(cfg);
  const { url, headers, body } = build(cfg, resolved, messages, false, true);

  let acc = '';
  const ok = await postStream(url, headers, body, (delta) => {
    if (!delta) return;
    acc += delta;
    onDelta(delta);
  });
  if (ok && acc) return acc;

  const text = await chatComplete(dataDir, messages);
  for (const chunk of text.match(/[^\n]{1,16}\n?|[\n]/g) ?? [text]) {
    onDelta(chunk);
    await new Promise((r) => setTimeout(r, 12));
  }
  return text;
}

/** 连通性测试：发一句最短的话，返回延迟与回声 */
export async function probe(dataDir: string): Promise<{
  ok: boolean;
  provider: ResolvedProvider;
  model: string;
  latency: number;
  sample: string;
  error?: string;
}> {
  const cfg = loadConfig(dataDir);
  const resolved = resolveProvider(cfg);
  if (!cfg.apiKey) {
    return { ok: false, provider: resolved, model: cfg.model, latency: 0, sample: '', error: '未填写 API Key' };
  }
  const started = Date.now();
  try {
    const text = await chatComplete(dataDir, [
      { role: 'system', content: '只回复 OK 两个字符。' },
      { role: 'user', content: 'ping' },
    ]);
    return { ok: true, provider: resolved, model: cfg.model, latency: Date.now() - started, sample: text.slice(0, 40) };
  } catch (err) {
    return {
      ok: false,
      provider: resolved,
      model: cfg.model,
      latency: Date.now() - started,
      sample: '',
      error: (err as Error).message,
    };
  }
}
