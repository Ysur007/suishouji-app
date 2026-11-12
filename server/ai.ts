/**
 * 服务端 AI 能力：整理（聚类 + 摘要 + 待办抽取）与对话（检索 + 生成）。
 *
 * 两套引擎，同一套出口：
 *
 * - `llm`  ：配置了 AI_API_KEY 时走 OpenAI 兼容接口（/chat/completions），质量更好；
 * - `local`：没有密钥时用确定性算法在本地算，不编造、不假装。界面必须如实标注引擎。
 *
 * 本地引擎的做法（都是可解释的）：
 *   1. 中文按「整段短词 + 二元组」切分，去掉停用词；
 *   2. 每条记录算 TF-IDF 向量；
 *   3. 贪心聚类：与簇质心余弦 ≥ 阈值就并入，否则开新簇，簇数上限 8；
 *   4. 簇名取簇内权重最高的关键词，命中领域词表时优先用领域名；
 *   5. 摘要取簇内最靠近质心的 2 条记录的首句；
 *   6. 待办按句式线索（记得 / 要 / 明天 / 截止 / 预约…）抽取。
 */

import { chatComplete, loadConfig } from './llm.js';

export type Engine = 'llm' | 'local';

export interface AiMemo {
  id: string;
  text: string;
  createdAt: number;
  folderId?: string | null;
  spaceId?: string;
  ownerName?: string;
  pinned?: boolean;
}

export interface Topic {
  id: string;
  title: string;
  keywords: string[];
  count: number;
  share: number;
  summary: string;
  memoIds: string[];
  /** 最近一条的时间，用于排序展示 */
  lastAt: number;
  /** 没有领域归属的零散簇：排在有主题的簇之后，标题也更保守 */
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
  /** 模型调用失败时回退本地引擎的原因，界面要如实说明 */
  notice?: string;
  empty?: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRef {
  id: string;
  text: string;
  createdAt: number;
}

/* ------------------------------------------------------------------ *
 * 配置
 * ------------------------------------------------------------------ */

/** 有没有可用密钥，决定走模型还是本地引擎 */
export function hasKey(dataDir: string): boolean {
  return Boolean(loadConfig(dataDir).apiKey);
}

/* ------------------------------------------------------------------ *
 * 文本处理
 * ------------------------------------------------------------------ */

const STOP = new Set(
  `的 了 是 在 我 有 和 就 不 人 都 一 一个 上 也 很 到 说 要 去 你 会 着 没有 看 好 自己 这 那 它 他 她 我们 你们 他们
  今天 明天 昨天 后天 前天 现在 时候 时间 一下 一点 一些 什么 怎么 这个 那个 这样 那样 可以 已经 还是 就是 因为 所以 但是 如果
  虽然 然后 而且 并且 以及 或者 不过 只是 还有 感觉 觉得 有点 比较 可能 应该 需要 东西 事情 地方 方式 问题 情况 之后 之前 时候
  一直 还是 真的 其实 反正 大概 差不多 一下 没 有 在 又 再 才 更 最 太 挺 蛮 就 都 也 还 被 把 给 让 对 从 向 往 跟 和 与 及
  收 到 好 的 吧 呢 啊 呀 哦 嗯 哈 么 啦 嘛 噢 唉 这 那 些 个 次 条 天 年 月 日 号 点 分 秒 上 下 里 外 前 后 左 右
  记得 别忘 不忘 下次 这次 上次 每天 每周 之前 之后 之间 已经 时候 起来 觉得 感觉 发现 开始 想做 想学
  下周 本周 上周 月底 月初 年底 一个 一下 有点 还是 可以 需要 应该 可能 比较 已经 一直 真的
  the and for with that this from have has was were are is be been it its of to in on at by as or if but not you we they he she`.split(
    /\s+/,
  ),
);

/** 短句里常见的整词，让「露营」「美术馆」这类词不被二元组淹没 */
const LEXICON = [
  '工作', '项目', '会议', '需求', '上线', '版本', '发布', '客户', '汇报', '周报', '复盘', '方案', '设计', '开发', '测试',
  '学习', '读书', '课程', '笔记', '考试', '论文', '英语', '单词', '复习', '练习', '教程', '技术', '代码', '重构',
  '生活', '周末', '旅行', '露营', '徒步', '爬山', '运动', '健身', '跑步', '游泳', '打球', '做饭', '餐厅', '咖啡',
  '健康', '睡眠', '体检', '医院', '看病', '吃药', '减脂', '体重', '心情', '焦虑', '放松', '冥想',
  '财务', '预算', '记账', '报销', '工资', '房租', '还款', '理财', '基金', '股票', '花销', '省钱',
  '购物', '下单', '快递', '超市', '清单', '买', '退货', '保修',
  '出行', '机票', '高铁', '酒店', '行程', '签证', '打车', '地铁', '驾照',
  '家人', '父母', '孩子', '朋友', '聚会', '生日', '礼物', '约会',
  '想法', '灵感', '点子', '计划', '目标', '习惯', '反思', '总结',
  '装修', '搬家', '房租', '水电', '维修', '家具',
  '电影', '音乐', '展览', '美术馆', '演出', '游戏', '摄影', '相机',
];

const DOMAINS: Array<{ name: string; words: string[] }> = [
  { name: '工作', words: ['工作', '项目', '会议', '需求', '上线', '版本', '客户', '汇报', '周报', '复盘', '方案', '开发', '测试', '排期'] },
  { name: '学习', words: ['学习', '读书', '课程', '笔记', '考试', '论文', '英语', '单词', '复习', '练习', '教程', '技术', '代码', 'rust', '异步', '书', '读'] },
  { name: '生活', words: ['生活', '周末', '旅行', '露营', '徒步', '爬山', '运动', '健身', '跑步', '做饭', '餐厅', '咖啡'] },
  { name: '健康', words: ['健康', '睡眠', '体检', '医院', '看病', '吃药', '减脂', '体重', '心情', '焦虑', '放松', '口腔', '牙', '过敏', '感冒', '运动', '健身', '跑步', '打球'] },
  { name: '财务', words: ['财务', '预算', '记账', '报销', '工资', '房租', '还款', '理财', '基金', '股票', '花销', '省钱'] },
  { name: '购物', words: ['购物', '下单', '快递', '超市', '清单', '退货', '保修', '买'] },
  { name: '出行', words: ['出行', '机票', '高铁', '酒店', '行程', '签证', '打车', '地铁', '驾照'] },
  { name: '人际', words: ['家人', '父母', '孩子', '朋友', '聚会', '生日', '礼物', '约会'] },
  { name: '想法', words: ['想法', '灵感', '点子', '计划', '目标', '习惯', '反思', '总结'] },
  { name: '居所', words: ['装修', '搬家', '水电', '维修', '家具'] },
  { name: '消遣', words: ['电影', '音乐', '展览', '美术馆', '演出', '游戏', '摄影', '相机', '重映', '展', '看展', '剧'] },
];

const LEXICON_SET = new Set(LEXICON);
/** 虚词单字：出现在二元组里就说明这个二元组没有实义 */
const STOP_CHAR = /[的了是在和就不也很都要有我你他她它着过被把给对从向往跟与及吧呢啊呀哦嗯么啦嘛]/;
const STOP_BIGRAM = new Set(['的一', '一个', '这个', '那个', '我们', '他们', '什么', '怎么', '可以', '没有', '就是']);

export function tokenize(text: string): string[] {
  const out: string[] = [];
  const clean = text.replace(/[\u0000-\u001f]/g, ' ').replace(/[，。！？；：、,.!?;:"'“”‘’（）()【】\[\]《》<>…—\-~`|/\\@#$%^&*+=]/g, ' ');
  for (const chunk of clean.split(/\s+/)) {
    if (!chunk) continue;
    if (/^[a-zA-Z][a-zA-Z0-9+#._-]*$/.test(chunk)) {
      const low = chunk.toLowerCase();
      if (low.length > 1 && !STOP.has(low)) out.push(low);
      continue;
    }
    for (const seg of chunk.match(/[\u4e00-\u9fa5]+/g) ?? []) {
      if (seg.length === 1) continue;
      if (seg.length <= 4 && !STOP.has(seg)) out.push(seg);
      for (let i = 0; i < seg.length - 1; i++) {
        const bi = seg.slice(i, i + 2);
        if (STOP.has(bi) || STOP_BIGRAM.has(bi)) continue;
        // 含虚词单字的二元组（「了一」「的是」）没有语义，只会把无关记录连起来
        if (STOP_CHAR.test(bi[0]) || STOP_CHAR.test(bi[1])) continue;
        out.push(bi);
      }
    }
    for (const word of LEXICON) {
      if (chunk.includes(word)) out.push(word);
    }
  }
  return out;
}

type Vec = Map<string, number>;

function cosine(a: Vec, b: Vec): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, v] of a) {
    na += v * v;
    const w = b.get(k);
    if (w) dot += v * w;
  }
  for (const v of b.values()) nb += v * v;
  if (!na || !nb) return 0;
  return dot / Math.sqrt(na * nb);
}

function addTo(target: Vec, other: Vec, weight = 1) {
  for (const [k, v] of other) target.set(k, (target.get(k) ?? 0) + v * weight);
}

/* ------------------------------------------------------------------ *
 * 整理
 * ------------------------------------------------------------------ */

function firstSentence(text: string, max = 46): string {
  const line = text.replace(/\s+/g, ' ').trim();
  const cut = line.split(/[。！？!?\n]/)[0] || line;
  const s = cut.length > max ? `${cut.slice(0, max)}…` : cut;
  return s;
}

/** 直接按原文判领域，比事后看关键词更准 */
function domainOfText(text: string): { name: string; hits: number } | null {
  let best: { name: string; hits: number } | null = null;
  for (const d of DOMAINS) {
    let hits = 0;
    for (const w of d.words) if (text.includes(w)) hits += w.length >= 2 ? 1 : 0.5;
    if (hits && (!best || hits > best.hits)) best = { name: d.name, hits };
  }
  return best;
}

const TODO_CUES = [
  '记得', '别忘了', '别忘', '待办', '要做', '需要', '得去', '一定要', '截止', 'ddl', 'deadline',
  '明天', '后天', '下周', '下个月', '月底', '周五', '周一', '周二', '周三', '周四', '周六', '周日',
  '预约', '安排', '提交', '交一下', '回复', '跟进', '确认', '取', '买', '订', '还', '改', '发',
];

function extractTodos(memos: AiMemo[], topKeywords: string[]): TodoItem[] {
  const out: TodoItem[] = [];
  const seen = new Set<string>();
  for (const m of memos) {
    for (const raw of m.text.split(/[。！？!?\n]/)) {
      const s = raw.trim();
      if (s.length < 4 || s.length > 60) continue;
      const low = s.toLowerCase();
      const cue = TODO_CUES.find((c) => low.includes(c));
      if (!cue) continue;
      // 纯陈述（「明天天气不错」）不要；要求句子里有动作感
      if (!/[去来做买订取交发还改约写看查问备准安提回跟确]/.test(s)) continue;
      const key = s.slice(0, 14);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text: s, memoId: m.id, cue });
      if (out.length >= 12) break;
    }
    if (out.length >= 12) break;
  }
  // 主题关键词相关的待办排前面
  out.sort((a, b) => {
    const sa = topKeywords.filter((k) => a.text.includes(k)).length;
    const sb = topKeywords.filter((k) => b.text.includes(k)).length;
    return sb - sa;
  });
  return out.slice(0, 8);
}

function extractQuotes(memos: AiMemo[]): Array<{ text: string; memoId: string }> {
  const out: Array<{ text: string; memoId: string }> = [];
  for (const m of memos) {
    const s = m.text.trim();
    if (s.length < 8) continue;
    const hasMark = /[「」《》"“”]/.test(s);
    const isQuestion = /[?？]\s*$/.test(s);
    if (!hasMark && !isQuestion) continue;
    out.push({ text: firstSentence(s, 54), memoId: m.id });
    if (out.length >= 3) break;
  }
  return out;
}

export function organizeLocal(memos: AiMemo[], label: string, days: number | null): OrganizeReport {
  const docs = memos.filter((m) => m.text.trim().length > 0);
  const now = Date.now();
  const base: OrganizeReport = {
    id: `r${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    createdAt: now,
    engine: 'local',
    model: null,
    range: {
      label,
      days,
      count: docs.length,
      from: docs.length ? Math.min(...docs.map((d) => d.createdAt)) : now,
      to: docs.length ? Math.max(...docs.map((d) => d.createdAt)) : now,
    },
    overview: {
      total: docs.length,
      chars: docs.reduce((n, d) => n + d.text.length, 0),
      topics: 0,
      todos: 0,
      spanDays: 0,
    },
    topics: [],
    todos: [],
    quotes: [],
    suggestion: '',
    empty: docs.length === 0,
  };

  if (!docs.length) {
    base.suggestion = '这个范围里还没有文字记录，先写几条再来整理。';
    return base;
  }

  // 1. 词表与 IDF
  const tokenized = docs.map((d) => tokenize(d.text));
  const df = new Map<string, number>();
  for (const toks of tokenized) {
    for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const N = docs.length;
  const idf = (t: string) => Math.log(1 + N / (df.get(t) ?? 1));

  const freqs = tokenized.map((toks) => {
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    return tf;
  });

  // 只保留有区分度的词：
  //   - 词典词（露营 / 复盘 / 英语…）一律可用；
  //   - 其余要求出现在 ≥2 条且不覆盖超过 1/3 的语料，否则它就是个泛化词，会把不同主题连在一起。
  const usable = new Set<string>();
  for (const [t, n] of df) {
    if (t.length < 2) continue;
    if (LEXICON_SET.has(t)) {
      usable.add(t);
      continue;
    }
    if (n >= 2 && n <= Math.max(2, Math.floor(N / 3))) usable.add(t);
  }

  const vectors: Vec[] = freqs.map((tf) => {
    const v: Vec = new Map();
    for (const [t, f] of tf) {
      if (!usable.has(t)) continue;
      v.set(t, (1 + Math.log(f)) * idf(t));
    }
    return v;
  });

  // 2. 先按领域归桶，剩下的零散记录再用相似度聚类。
  //    短句语料里纯相似度很容易被「约了」「了一」这种巧合词带偏，领域词表是更稳的一层先验。
  const byDomain = new Map<string, number[]>();
  const rest: number[] = [];
  docs.forEach((d, i) => {
    const dom = domainOfText(d.text);
    // 至少要命中一个实词，否则宁可不归类
    if (dom && dom.hits >= 1) {
      const list = byDomain.get(dom.name) ?? [];
      list.push(i);
      byDomain.set(dom.name, list);
    } else {
      rest.push(i);
    }
  });

  type Cluster = { title: string | null; members: number[]; centroid: Vec };
  const centroidOf = (members: number[]): Vec => {
    const c: Vec = new Map();
    for (const i of members) addTo(c, vectors[i]);
    return c;
  };
  const pushCluster = (title: string | null, members: number[], centroid?: Vec) =>
    clusters.push({ title, members, centroid: centroid ?? centroidOf(members) });
  const clusters: Cluster[] = [];

  // 2a. 领域桶：≥8 条时按最高频的实词再切一刀，避免「工作」一个桶装下所有东西
  for (const [name, idxs] of [...byDomain.entries()].sort((a, b) => b[1].length - a[1].length)) {
    if (idxs.length <= 1) {
      rest.push(...idxs);
      continue;
    }
    if (idxs.length >= 8) {
      const freq = new Map<string, number>();
      for (const i of idxs) for (const t of new Set(tokenized[i])) if (usable.has(t)) freq.set(t, (freq.get(t) ?? 0) + 1);
      const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const hit = top ? idxs.filter((i) => tokenized[i].includes(top)) : [];
      if (top && hit.length >= 3 && hit.length < idxs.length) {
        pushCluster(`${name} · ${top}`, hit);
        pushCluster(name, idxs.filter((i) => !hit.includes(i)));
        continue;
      }
    }
    pushCluster(name, idxs);
  }

  // 2b. 没有领域的记录：贪心聚类，但要求更高的相似度
  if (rest.length) {
    const local: Array<{ members: number[]; centroid: Vec }> = [];
    for (const i of rest.sort((a, b) => docs[b].createdAt - docs[a].createdAt)) {
      const v = vectors[i];
      let best = -1;
      let bestScore = 0;
      for (let c = 0; c < local.length; c++) {
        const score = cosine(v, local[c].centroid);
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
      if (best >= 0 && bestScore >= 0.42) {
        local[best].members.push(i);
        addTo(local[best].centroid, v);
      } else if (local.length < 4) {
        const centroid: Vec = new Map();
        addTo(centroid, v);
        local.push({ members: [i], centroid });
      } else {
        local[local.length - 1].members.push(i);
      }
    }
    for (const c of local) pushCluster(null, c.members, c.centroid);
  }

  // 3. 每个簇的关键词 / 标题 / 摘要
  const topics: Topic[] = clusters
    .filter((c) => c.members.length > 0)
    .map((c, idx) => {
      const weight = new Map<string, number>();
      for (const i of c.members) {
        for (const [t, w] of vectors[i]) weight.set(t, (weight.get(t) ?? 0) + w);
      }
      const keywords = [...weight.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([t]) => t)
        .filter((t, _, arr) => !arr.some((o) => o !== t && o.length > t.length && o.includes(t)))
        .slice(0, 5);

      const head = keywords.filter((k) => k.length >= 2);
      const loose = c.title === null;
      const cover = (k: string) => c.members.filter((i) => tokenized[i].includes(k)).length / c.members.length;
      const solid = head.filter((k) => cover(k) >= (c.title === null ? 0.35 : 0));
      const title =
        c.title !== null
          ? c.title
          : solid.length
            ? solid.slice(0, 2).join(' · ')
            : '零散片段';

      const ranked = [...c.members].sort((a, b) => {
        const sa = cosine(vectors[a], c.centroid);
        const sb = cosine(vectors[b], c.centroid);
        if (Math.abs(sa - sb) > 0.02) return sb - sa;
        return docs[b].createdAt - docs[a].createdAt;
      });
      const picks = ranked.slice(0, 2).map((i) => firstSentence(docs[i].text, 30));
      const summary = [...new Set(picks)].join('；');

      return {
        id: `t${idx}`,
        title,
        keywords: (loose ? solid : keywords).slice(0, 4),
        count: c.members.length,
        share: c.members.length / docs.length,
        summary: summary || '（这几条没有可提炼的文字）',
        memoIds: c.members
          .slice()
          .sort((a, b) => docs[b].createdAt - docs[a].createdAt)
          .map((i) => docs[i].id),
        lastAt: Math.max(...c.members.map((i) => docs[i].createdAt)),
        loose,
      };
    })
    .sort((a, b) => Number(a.loose ?? false) - Number(b.loose ?? false) || b.count - a.count || b.lastAt - a.lastAt);

  // 只把「一条记录」的碎簇并起来：按数量砍会把健康、财务这种真实主题也砍掉
  const tiny = topics.filter((t) => t.count === 1);
  if (tiny.length >= 3) {
    const keep = topics.filter((t) => t.count > 1);
    const merged: Topic = {
      id: 'rest',
      title: '零散',
      keywords: [...new Set(tiny.flatMap((t) => t.keywords))].slice(0, 4),
      count: tiny.length,
      share: tiny.length / docs.length,
      summary: tiny
        .map((t) => t.summary)
        .filter(Boolean)
        .slice(0, 2)
        .join('；'),
      memoIds: tiny.flatMap((t) => t.memoIds),
      lastAt: Math.max(...tiny.map((t) => t.lastAt)),
      loose: true,
    };
    topics.length = 0;
    topics.push(...keep, merged);
  }

  const topKeywords = [...topics.flatMap((t) => t.keywords)].slice(0, 8);
  const todos = extractTodos(docs, topKeywords);
  const quotes = extractQuotes(docs);
  const from = base.range.from;
  const to = base.range.to;
  const spanDays = Math.max(1, Math.round((to - from) / 86400000) + 1);

  // 4. 一句话建议：把最集中的主题和待办数量说清楚
  const lead = topics.find((t) => !t.loose);
  const parts: string[] = [];
  if (lead && lead.count >= 2) {
    parts.push(`${lead.count} 条记录都落在「${lead.title}」上，占 ${Math.round(lead.share * 100)}%`);
  }
  if (todos.length) parts.push(`整理出 ${todos.length} 条可以立刻执行的事项`);
  if (topics.length >= 4) parts.push(`内容分散在 ${topics.length} 个主题里，可以拆成几个文件夹分别归档`);
  if (!parts.length) parts.push('记录还比较零散，多写几句再整理会更清楚');

  return {
    ...base,
    overview: { total: docs.length, chars: base.overview.chars, topics: topics.length, todos: todos.length, spanDays },
    topics,
    todos,
    quotes,
    suggestion: `${parts.join('；')}。`,
  };
}

/* ------------------------------------------------------------------ *
 * 对话
 * ------------------------------------------------------------------ */

export function retrieve(memos: AiMemo[], query: string, limit = 5): AiMemo[] {
  const q = tokenize(query);
  if (!q.length) return memos.slice(0, limit);
  const qv: Vec = new Map();
  for (const t of q) qv.set(t, (qv.get(t) ?? 0) + 1);

  const scored = memos.map((m) => {
    const mv: Vec = new Map();
    for (const t of tokenize(m.text)) mv.set(t, (mv.get(t) ?? 0) + 1);
    let score = cosine(qv, mv);
    // 字面命中给一点加权，短查询时更准
    for (const t of new Set(q)) if (m.text.includes(t)) score += 0.12;
    // 轻微的时间衰减：同样相关时优先近的
    const age = (Date.now() - m.createdAt) / 86400000;
    score *= 1 + Math.max(-0.25, Math.min(0.15, (7 - age) / 60));
    return { m, score };
  });

  const hit = scored.filter((s) => s.score > 0.12).sort((a, b) => b.score - a.score);
  return (hit.length ? hit : scored.sort((a, b) => b.m.createdAt - a.m.createdAt)).slice(0, limit).map((s) => s.m);
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

export function chatLocal(memos: AiMemo[], messages: ChatMessage[]): { answer: string; refs: ChatRef[] } {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const q = lastUser.trim();
  const hits = retrieve(memos, q, 5);
  const refs: ChatRef[] = hits.map((m) => ({ id: m.id, text: firstSentence(m.text, 40), createdAt: m.createdAt }));

  if (!memos.length) {
    return {
      answer: '这个范围里还没有记录。先在「记录」里写几条，我就能基于它们回答、归纳了。',
      refs: [],
    };
  }

  const askCount = /(多少|几条|几件|统计|数量|一共)/.test(q);
  const askTodo = /(待办|要做|该做|没做|安排|计划)/.test(q);
  const askRecent = /(最近|上周|这周|本周|今天|昨天)/.test(q);

  const lines: string[] = [];

  if (askCount) {
    lines.push(`这个范围里一共有 ${memos.length} 条文字记录。`);
    const byDay = new Map<string, number>();
    for (const m of memos) {
      const k = fmtDate(m.createdAt);
      byDay.set(k, (byDay.get(k) ?? 0) + 1);
    }
    const top = [...byDay.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (top.length) lines.push(`写得最多的是 ${top.map(([d, n]) => `${d}（${n} 条）`).join('、')}。`);
  }

  if (askTodo) {
    const todos = extractTodos(memos, []);
    if (todos.length) {
      lines.push('从记录里能读出的待办：');
      todos.slice(0, 5).forEach((t, i) => lines.push(`${i + 1}. ${t.text}`));
    } else {
      lines.push('没有找到明显的待办句式（「记得 / 要 / 截止 / 明天」这类）。');
    }
  }

  if (!lines.length) {
    if (askRecent) {
      lines.push(`最近的记录里，这几条和你的问题最接近：`);
    } else if (hits.length) {
      lines.push(`我在记录里找到 ${hits.length} 条相关的内容：`);
    }
    hits.slice(0, 4).forEach((m, i) => {
      lines.push(`${i + 1}. ${fmtDate(m.createdAt)}｜${firstSentence(m.text, 52)}`);
    });
    if (hits.length) {
      const words = [...new Set(hits.flatMap((m) => tokenize(m.text)))]
        .filter((t) => t.length >= 2 && !LEXICON_SET.has(t))
        .slice(0, 3);
      if (words.length) lines.push(`\n这些内容反复出现的词是：${words.join('、')}。`);
    }
  }

  lines.push(
    '\n（这是本地检索式回答，没有调用大模型。配置 AI_API_KEY 后，同样的问题会交给模型做归纳和推理。）',
  );

  return { answer: lines.join('\n'), refs };
}

/* ------------------------------------------------------------------ *
 * LLM（OpenAI 兼容）
 * ------------------------------------------------------------------ */

async function llmCall(
  dataDir: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  opts: { json?: boolean } = {},
): Promise<string> {
  return chatComplete(dataDir, messages, { json: opts.json });
}

function memoDigest(memos: AiMemo[], limit = 120): string {
  return memos
    .slice(0, limit)
    .map((m, i) => `${i + 1}. [${fmtDate(m.createdAt)}] ${m.text.replace(/\s+/g, ' ').slice(0, 160)}`)
    .join('\n');
}

export async function organizeWithLlm(
  dataDir: string,
  memos: AiMemo[],
  label: string,
  days: number | null,
): Promise<OrganizeReport> {
  const local = organizeLocal(memos, label, days);
  if (!memos.length) return local;

  const prompt = `下面是一个人的随手记（${label}，共 ${memos.length} 条）。请归纳成结构化结果。

只输出 JSON，字段：
{"topics":[{"title":"主题名(不超过10字)","keywords":["3-4个关键词"],"summary":"一句概括","memoIndexes":[对应编号]}],"todos":[{"text":"待办原文(不超过40字)","memoIndex":编号}],"suggestion":"一句话建议(不超过60字)"}

要求：主题 3-6 个，覆盖全部记录；todos 只收真正要执行的事；不要编造记录里没有的信息。

记录：
${memoDigest(memos)}`;

  try {
    const raw = await llmCall(
      dataDir,
      [
        { role: 'system', content: '你是中文信息整理助手，只输出合法 JSON。' },
        { role: 'user', content: prompt },
      ],
      { json: true },
    );
    const parsed = JSON.parse(raw) as {
      topics?: Array<{ title?: string; keywords?: string[]; summary?: string; memoIndexes?: number[] }>;
      todos?: Array<{ text?: string; memoIndex?: number }>;
      suggestion?: string;
    };
    const topics: Topic[] = (parsed.topics ?? [])
      .filter((t) => (t.memoIndexes ?? []).length > 0)
      .slice(0, 8)
      .map((t, idx) => {
        const ids = (t.memoIndexes ?? [])
          .map((n) => memos[n - 1])
          .filter(Boolean)
          .map((m) => m.id);
        return {
          id: `t${idx}`,
          title: (t.title ?? '未命名主题').slice(0, 18),
          keywords: (t.keywords ?? []).slice(0, 4),
          count: ids.length,
          share: ids.length / memos.length,
          summary: t.summary ?? '',
          memoIds: ids,
          lastAt: Math.max(
            ...(t.memoIndexes ?? []).map((n) => memos[n - 1]?.createdAt ?? 0),
            0,
          ),
        };
      });

    const todos: TodoItem[] = (parsed.todos ?? [])
      .slice(0, 8)
      .map((t) => {
        const memo = memos[(t.memoIndex ?? 1) - 1] ?? memos[0];
        return { text: (t.text ?? '').slice(0, 60), memoId: memo?.id ?? '', cue: '' };
      })
      .filter((t) => t.text);

    if (!topics.length) return local;

    return {
      ...local,
      engine: 'llm',
      model: loadConfig(dataDir).model,
      topics,
      todos,
      overview: { ...local.overview, topics: topics.length, todos: todos.length },
      suggestion: (parsed.suggestion ?? local.suggestion).slice(0, 80),
    };
  } catch (err) {
    // 模型挂了不能让用户以为「模型算出来的就是这个」——回退本地并说明原因
    return {
      ...local,
      model: null,
      notice: `模型调用失败，已回退本地引擎。原因：${(err as Error).message}`,
    };
  }
}

export async function chatWithLlm(
  dataDir: string,
  memos: AiMemo[],
  messages: ChatMessage[],
): Promise<{ answer: string; refs: ChatRef[] }> {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const hits = retrieve(memos, lastUser, 6);
  const refs: ChatRef[] = hits.map((m) => ({ id: m.id, text: firstSentence(m.text, 40), createdAt: m.createdAt }));

  const context = hits.length
    ? `用户的相关记录（按相关度排序）：\n${memoDigest(hits, 6)}`
    : '用户没有任何相关记录。';

  const dialog = messages
    .slice(-8)
    .map((m) => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`)
    .join('\n');

  const answer = await llmCall(dataDir, [
    {
      role: 'system',
      content: `你是用户私人笔记的助手。只根据下面这些记录回答，记录里没有的就直说没有，不要编造。
回答用中文，简洁，必要时分点。引用记录时写「（见 N 月 N 日那条）」。
${context}`,
    },
    { role: 'user', content: dialog },
  ]);

  return { answer: answer.trim() || '模型没有返回内容。', refs };
}
