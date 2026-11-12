import { useAi } from '../lib/aiui';
import { useApp } from '../lib/store';
import { useUI } from '../lib/ui';

/**
 * 引擎标签：既是状态显示，也是配置入口。
 *
 * 三种状态必须能区分开——「本地分析」是能用的，「未就绪」是打不了分的：
 *   - 已接入模型：模型 · gpt-4o-mini
 *   - 未接入：本地分析
 *   - 接口不存在 / 请求失败：未就绪 · 去配置
 */
export function EngineTag() {
  const status = useAi((s) => s.status);
  const auth = useApp((s) => s.auth);
  const open = useUI((s) => s.open);

  // 未登录时是「没有可用」，不是「接口坏了」——别让用户去查服务端
  const down = Boolean(auth) && !status;
  const llm = Boolean(status?.configured);

  return (
    <button
      className="engineTag"
      data-engine={down ? 'down' : llm ? 'llm' : 'local'}
      title={!auth ? '登录后可用，点此登录' : down ? '服务端 AI 接口不可用，点此查看' : '点击配置 API'}
      onClick={() => open({ kind: 'ai' })}
    >
      <i />
      <span className="engineTag__text">
        {!auth ? '登录后可用' : down ? '未就绪 · 去配置' : llm ? `模型 · ${status?.model}` : '本地分析'}
      </span>
    </button>
  );
}
