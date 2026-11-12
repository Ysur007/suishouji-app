/**
 * AI 接入配置。
 *
 * 关键约束：API Key 只在服务端落盘（`data/ai.json`，权限 0600），前端只拿到末四位。
 * 之所以做成服务端配置而不是纯前端，是因为请求是服务端发的——key 放浏览器既没用也不安全。
 */

import { useEffect, useState } from 'react';
import {
  clearAiConfig,
  friendlyError,
  getAiConfig,
  saveAiConfig,
  testAiConfig,
  type AiConfig,
  type ProbeResult,
  type Provider,
} from '../lib/ai';
import { useApp } from '../lib/store';
import { useAi } from '../lib/aiui';
import { IconCheck, IconSpark } from './Icons';

const PROVIDERS: Array<{ key: Provider; label: string; hint: string; base: string; model: string }> = [
  {
    key: 'auto',
    label: '自动',
    hint: '按接口地址识别服务商，不确定时选这个',
    base: '',
    model: '',
  },
  {
    key: 'openai',
    label: 'OpenAI 兼容',
    hint: '/v1/chat/completions，Bearer 鉴权',
    base: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  {
    key: 'anthropic',
    label: 'Anthropic',
    hint: '/v1/messages，x-api-key + anthropic-version',
    base: 'https://api.anthropic.com',
    model: 'claude-3-5-sonnet-latest',
  },
  {
    key: 'gemini',
    label: 'Gemini',
    hint: '/v1beta/models/{model}:generateContent?key=',
    base: 'https://generativelanguage.googleapis.com',
    model: 'gemini-1.5-flash',
  },
];

export function AiSettingsBody({ onClose }: { onClose: () => void }) {
  const user = useApp((s) => s.user);
  const notify = useApp((s) => s.notify);

  const [loaded, setLoaded] = useState<AiConfig | null>(null);
  const [provider, setProvider] = useState<Provider>('auto');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getAiConfig()
      .then(({ config }) => {
        setLoaded(config);
        setProvider(config.provider);
        setBaseUrl(config.baseUrl);
        setModel(config.model);
      })
      .catch((err) => setError(friendlyError((err as Error).message)));
  }, [user]);

  const patch = {
    provider,
    baseUrl: baseUrl.trim(),
    model: model.trim(),
    ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
  };

  const doSave = async () => {
    setBusy('save');
    setError(null);
    setProbe(null);
    try {
      const res = await saveAiConfig(patch);
      setLoaded(res.config);
      setApiKey('');
      void useAi.getState().refreshStatus();
      notify(res.config.hasKey ? '已保存，接下来会用模型处理' : '已保存，当前走本地引擎');
    } catch (err) {
      setError(friendlyError((err as Error).message));
    } finally {
      setBusy(null);
    }
  };

  const doTest = async () => {
    setBusy('test');
    setError(null);
    setProbe(null);
    try {
      // 先落盘再测：测的必须是将要保存的那份配置，否则测通了保存后又不对
      await saveAiConfig(patch);
      setApiKey('');
      const res = await testAiConfig();
      setProbe(res);
      const { config } = await getAiConfig();
      setLoaded(config);
      void useAi.getState().refreshStatus();
    } catch (err) {
      setError(friendlyError((err as Error).message));
    } finally {
      setBusy(null);
    }
  };

  const active = PROVIDERS.find((p) => p.key === provider) ?? PROVIDERS[0];

  if (!user) {
    return (
      <>
        <div className="sheet__title">AI 接入</div>
        <div className="sheet__desc">登录后才能配置：密钥保存在服务端，按账号隔离。</div>
      <div className="sheet__actions">
          <button className="btn btn--ghost" onClick={onClose}>
            关闭
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="sheet__title">AI 接入</div>
      <div className="sheet__desc">
        整理与对话优先用这里的模型；没配就用本地引擎（能归类、摘句、抽待办，但不做生成式推理）。
      </div>

      <div className="sheet__body">
        <div className="aiStatusRow">
          <span className="aiStatusDot" data-on={loaded?.hasKey ? 'true' : 'false'} />
          <div className="aiStatusMain">
            <div className="aiStatusTitle">
              {loaded?.hasKey
                ? `已接入 · ${active.label === '自动' ? labelOf(loaded.resolved) : active.label}`
                : '未接入 · 使用本地引擎'}
            </div>
            <div className="aiStatusSub">
              {loaded?.hasKey
                ? `${loaded.model}${loaded.keyHint ? ` · ${loaded.keyHint}` : ''}${
                    loaded.source === 'env' ? ' · 来自环境变量' : ' · 来自界面配置'
                  }`
                : '配置后会在服务端发起请求，密钥不会下发到浏览器'}
            </div>
          </div>
        </div>

        <div className="field">
          <div className="field__label">服务商</div>
          <div className="seg seg--wide">
            {PROVIDERS.map((p) => (
              <button
                key={p.key}
                className="seg__btn"
                data-active={provider === p.key}
                onClick={() => {
                  setProvider(p.key);
                  // 切到具体服务商时把默认地址/模型带出来，省得用户查文档
                  if (p.key !== 'auto') {
                    if (!baseUrl || PROVIDERS.some((q) => q.base === baseUrl)) setBaseUrl(p.base);
                    if (!model || PROVIDERS.some((q) => q.model === model)) setModel(p.model);
                  }
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="field__hint">{active.hint}</div>
        </div>

        <div className="field">
          <div className="field__label">接口地址</div>
          <input
            className="field__input"
            value={baseUrl}
            placeholder={active.base || 'https://api.openai.com/v1'}
            spellCheck={false}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <div className="field__hint">
            只填到版本号即可，路径由服务端补全（OpenAI 补 chat/completions，Anthropic 补 /v1/messages）。
          </div>
        </div>

        <div className="field">
          <div className="field__label">模型</div>
          <input
            className="field__input"
            value={model}
            placeholder={active.model || 'gpt-4o-mini'}
            spellCheck={false}
            onChange={(e) => setModel(e.target.value)}
          />
        </div>

        <div className="field">
          <div className="field__label">API Key</div>
          <input
            className="field__input"
            type="password"
            value={apiKey}
            placeholder={loaded?.hasKey ? `已保存 ${loaded.keyHint}，留空表示不修改` : 'sk-…'}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>

        {error ? <div className="auth-error">{error}</div> : null}

        {probe ? (
          <div className="aiProbe" data-ok={probe.ok ? 'true' : 'false'}>
            <div className="aiProbe__title">
              {probe.ok ? <IconCheck width={14} height={14} /> : null}
              {probe.ok ? `连接正常 · ${probe.latency} ms` : '连接失败'}
            </div>
            <div className="aiProbe__text">
              {probe.ok
                ? `${labelOf(probe.provider)} · ${probe.model} · 回声「${probe.sample}」`
                : friendlyError(probe.error ?? '未知错误')}
            </div>
          </div>
        ) : null}

        <details className="aiCompat">
          <summary>兼容范围与识别规则</summary>
          <div className="aiCompat__body">
            <p>
              <b>OpenAI 兼容</b>：`POST /v1/chat/completions`，`Authorization: Bearer`。DeepSeek、Kimi、
              通义、OpenRouter、Ollama、vLLM、OneAPI / New API 都属于这一类，只是地址与模型名不同。
            </p>
            <p>
              <b>Anthropic</b>：`POST /v1/messages`，`x-api-key` + `anthropic-version`，system 单独成字段。
            </p>
            <p>
              <b>Gemini</b>：`POST /v1beta/models/{'{model}'}:generateContent?key=`，流式走 `alt=sse`。
            </p>
            <p>
              <b>自动识别</b>：地址含 <code>anthropic</code> → Anthropic；含 <code>generativelanguage</code> 或{' '}
              <code>gemini</code> → Gemini；其余一律按 OpenAI 兼容处理。认错时改「服务商」或地址即可。
            </p>
          </div>
        </details>
      </div>

        {loaded?.hasKey ? (
          <button
            className="text-link"
            style={{ marginTop: 10 }}
            onClick={async () => {
              try {
                await clearAiConfig();
                const { config } = await getAiConfig();
                setLoaded(config);
                setProvider(config.provider);
                setBaseUrl(config.baseUrl);
                setModel(config.model);
                setProbe(null);
                void useAi.getState().refreshStatus();
                notify('已清除配置，回到本地引擎');
              } catch (err) {
                setError(friendlyError((err as Error).message));
              }
            }}
          >
            清除配置，回到本地引擎
          </button>
        ) : null}

      <div className="sheet__actions">
        <button className="btn btn--ghost" onClick={onClose} disabled={busy !== null}>
          取消
        </button>
        <button className="btn btn--ghost" onClick={() => void doTest()} disabled={busy !== null}>
          {busy === 'test' ? '测试中…' : '测试连接'}
        </button>
        <button className="btn btn--primary" onClick={() => void doSave()} disabled={busy !== null}>
          {busy === 'save' ? '保存中…' : '保存'}
        </button>
      </div>

      <div className="aiFoot">
        <IconSpark width={13} height={13} />
        也可以直接用环境变量配置：AI_PROVIDER / AI_BASE_URL / AI_MODEL / AI_API_KEY。
        界面保存的配置优先于环境变量。
      </div>
    </>
  );
}

function labelOf(p: 'openai' | 'anthropic' | 'gemini'): string {
  return p === 'anthropic' ? 'Anthropic' : p === 'gemini' ? 'Gemini' : 'OpenAI 兼容';
}
