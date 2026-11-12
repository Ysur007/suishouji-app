/**
 * 模型显示名。
 *
 * 接口里的模型 id 是给机器看的：`trae-cn/deepseek-v4.1-flash-max`、
 * `claude-3-5-sonnet-latest`、`gemini-1.5-flash`。直接摆在状态栏和标签里
 * 又长又难认，尤其窄屏会被压成 `trae-cn/deepsee…`——看到的人不知道这是哪个模型。
 *
 * 这里只做「显示」：真实发出去的仍然是原始 id，映射不会影响请求。
 * 先查精确表（常见官方 id），再按词元拼（厂商 / 版本 / 规格），
 * 拼不出来就原样返回，绝不猜成别的模型。
 */

/** 常见完整 id 的写法，跟厂商自己的叫法对齐 */
const EXACT: Record<string, string> = {
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o mini',
  'gpt-4.1': 'GPT-4.1',
  'gpt-4.1-mini': 'GPT-4.1 mini',
  'gpt-4.1-nano': 'GPT-4.1 nano',
  o1: 'o1',
  'o1-mini': 'o1 mini',
  'o3-mini': 'o3 mini',
  'claude-3-5-sonnet-latest': 'Claude 3.5 Sonnet',
  'claude-3-5-haiku-latest': 'Claude 3.5 Haiku',
  'claude-3-7-sonnet-latest': 'Claude 3.7 Sonnet',
  'claude-sonnet-4-20250514': 'Claude Sonnet 4',
  'claude-opus-4-20250514': 'Claude Opus 4',
  'gemini-1.5-flash': 'Gemini 1.5 Flash',
  'gemini-1.5-pro': 'Gemini 1.5 Pro',
  'gemini-2.0-flash': 'Gemini 2.0 Flash',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'deepseek-chat': 'DeepSeek Chat',
  'deepseek-reasoner': 'DeepSeek R1',
  'qwen-plus': '通义千问 Plus',
  'qwen-max': '通义千问 Max',
  'qwen-turbo': '通义千问 Turbo',
  'glm-4': 'GLM-4',
  'glm-4-plus': 'GLM-4 Plus',
  'moonshot-v1-8k': 'Kimi 8K',
};

/** 词元翻译：大小写、厂商缩写、规格后缀 */
const WORD: Record<string, string> = {
  deepseek: 'DeepSeek',
  gpt: 'GPT',
  glm: 'GLM',
  qwen: 'Qwen',
  kimi: 'Kimi',
  moonshot: 'Moonshot',
  llama: 'Llama',
  mistral: 'Mistral',
  claude: 'Claude',
  gemini: 'Gemini',
  doubao: '豆包',
  ernie: '文心',
  yi: 'Yi',
  grok: 'Grok',
  o1: 'o1',
  o3: 'o3',
  r1: 'R1',
  chat: 'Chat',
  instruct: 'Instruct',
  reasoner: 'Reasoner',
  coder: 'Coder',
  thinking: 'Thinking',
  flash: 'Flash',
  pro: 'Pro',
  max: 'Max',
  plus: 'Plus',
  turbo: 'Turbo',
  lite: 'Lite',
  nano: 'nano',
  mini: 'mini',
  small: 'small',
  large: 'large',
  base: 'Base',
  vision: 'Vision',
  preview: 'Preview',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
  opus: 'Opus',
};

/**
 * 把模型 id 变成人看得懂的名字。
 * `trae-cn/deepseek-v4.1-flash-max` → `DeepSeek V4.1 Flash Max`
 */
export function modelAlias(id?: string | null): string {
  const raw = (id ?? '').trim();
  if (!raw) return '';

  const exact = EXACT[raw.toLowerCase()];
  if (exact) return exact;

  // 厂商/命名空间前缀（trae-cn/、openai/、meta-llama/）不进显示名
  const tail = raw.slice(raw.lastIndexOf('/') + 1);
  const parts = tail.split(/[-_\s]+/).filter(Boolean);

  const out: string[] = [];
  for (const p of parts) {
    const low = p.toLowerCase();
    if (low === 'latest') continue;
    if (WORD[low]) out.push(WORD[low]);
    else if (/^v\d/i.test(low)) out.push(`V${low.slice(1)}`);
    // 数字开头的保留原大小写：70B 不能变成 70b，4o 也不能变成 4O
    else if (/^\d/.test(p)) out.push(p);
    else out.push(low.charAt(0).toUpperCase() + low.slice(1));
  }

  return out.join(' ') || raw;
}

/** 显示名和原始 id 是否不同（决定要不要把原始 id 也写出来） */
export function hasAlias(id?: string | null): boolean {
  const raw = (id ?? '').trim();
  return Boolean(raw) && modelAlias(raw) !== raw;
}
