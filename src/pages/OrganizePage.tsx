/**
 * 整理页：把一段时间里的记录按主题归类，抽出待办和值得回看的句子。
 *
 * 结果的每个主题都能点回原始记录——归纳不该是一个「看不懂但很高级」的黑盒，
 * 每一句都要能落到具体某一条上。
 */

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { friendlyError, organize, type OrganizeReport } from '../lib/ai';
import { EngineTag } from '../components/EngineTag';
import { useAi } from '../lib/aiui';
import { liveMemos, useApp } from '../lib/store';
import { useUI } from '../lib/ui';
import { IconCheck, IconSpark } from '../components/Icons';
import { LoginGate } from '../components/LoginGate';

const RANGES: Array<{ label: string; days: number | null }> = [
  { label: '最近 7 天', days: 7 },
  { label: '最近 30 天', days: 30 },
  { label: '最近 90 天', days: 90 },
  { label: '全部', days: null },
];

function dayLabel(ts: number) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function OrganizePage() {
  const bucket = useApp((s) => s.viewBucket);
  const auth = useApp((s) => s.auth);
  const activeSpace = useApp((s) => s.activeSpace);
  const groups = useApp((s) => s.groups);
  const memos = useApp((s) => s.memos);
  const notify = useApp((s) => s.notify);
  const openSheet = useUI((s) => s.open);

  const reports = useAi((s) => s.reports);
  const reportId = useAi((s) => s.reportId);
  const load = useAi((s) => s.load);
  const setReport = useAi((s) => s.setReport);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<'space' | 'all'>('space');
  const [days, setDays] = useState<number | null>(30);

  useEffect(() => {
    load(bucket);
  }, [bucket, load]);

  const refreshStatus = useAi((s) => s.refreshStatus);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const report: OrganizeReport | null = useMemo(
    () => reports.find((r) => r.id === reportId) ?? null,
    [reports, reportId],
  );

  const groupName = activeSpace.startsWith('g:') ? groups[activeSpace.slice(2)]?.name : null;
  const localCount = liveMemos(memos).filter((m) => (m.spaceId ?? bucket) === activeSpace).length;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const { report: next } = await organize({
        spaceId: scope === 'space' ? activeSpace : undefined,
        days,
      });
      setReport(next);
    } catch (err) {
      setError(friendlyError((err as Error).message));
    } finally {
      setBusy(false);
    }
  };

  /**
   * 报告里的每一条都要能落到实处。
   *
   * 报告是服务端算的，可能引用到本机还没同步到的记录（换设备、同步游标超前、
   * 刚在别处写成）。以前这里直接 open，一条不在本机的记录就是个空浮层——
   * 点了没反应、也看不出为什么。现在先补取，补不到就明说。
   */
  const openMemo = async (memoId: string, label: string) => {
    if (!memoId) {
      notify('这条没有关联到具体记录', 'error');
      return;
    }
    if (memos[memoId] && !memos[memoId].deleted) {
      openSheet({ kind: 'editor', memoId });
      return;
    }
    const memo = await useApp.getState().ensureMemo(memoId);
    if (!memo) {
      notify(`「${label.slice(0, 12)}」对应的记录取不到——可能已删除，或这条不是本机同步过的`, 'error');
      return;
    }
    openSheet({ kind: 'editor', memoId });
  };

  return (
    <div className="aiPage">
      <header className="aiHead">
        <div className="aiHead__main">
          <h1 className="aiHead__title">整理</h1>
          <p className="aiHead__desc">
            把记录按主题归类，抽出可以立刻去做的事，以及值得回看的句子。
          </p>
        </div>
        <div className="aiHead__side">
          <EngineTag />
        </div>
      </header>

      <div className="orgBar">
        <div className="orgBar__group">
          <span className="orgBar__label">范围</span>
          <div className="seg">
            <button
              className="seg__btn"
              data-active={scope === 'space'}
              onClick={() => setScope('space')}
            >
              {groupName ? `「${groupName}」` : '当前空间'}
            </button>
            <button
              className="seg__btn"
              data-active={scope === 'all'}
              onClick={() => setScope('all')}
            >
              全部（含群）
            </button>
          </div>
        </div>

        <div className="orgBar__group">
          <span className="orgBar__label">时间</span>
          <div className="seg">
            {RANGES.map((r) => (
              <button
                key={r.label}
                className="seg__btn"
                data-active={days === r.days}
                onClick={() => setDays(r.days)}
              >
                {r.label.replace('最近 ', '')}
              </button>
            ))}
          </div>
        </div>

        <button className="btn btn--primary orgBar__run" onClick={() => void run()} disabled={busy}>
          {busy ? '整理中…' : report ? '重新整理' : '开始整理'}
        </button>
      </div>

      <div className="orgBody">
        {!auth ? (
          <div className="aiGateWrap">
            <LoginGate
              title="整理需要登录"
              desc="主题归纳、待办抽取和句子摘选都在服务端算，而且只读你自己（和你所在群）的记录。登录后再点「开始整理」即可。"
              benefits={['只读你的记录', '结果可点回原文', '多设备同步']}
            />
          </div>
        ) : (
          <>
        {error ? <div className="orgError">{error}</div> : null}

        {busy ? <Skeleton /> : report ? <ReportView report={report} onOpen={openMemo} /> : <Intro count={localCount} />}
          </>
        )}
      </div>
    </div>
  );
}

function Intro({ count }: { count: number }) {
  return (
    <div className="orgIntro">
      <div className="orgIntro__art">
        <span />
        <span />
        <span />
      </div>
      <div className="orgIntro__title">还没有整理过</div>
      <div className="orgIntro__desc">
        当前空间有 {count} 条记录。整理会做三件事：按主题聚类、抽出待办、挑出值得回看的句子。
        结果只存在这台设备上，随时可以重跑。
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="orgSkeleton">
      <div className="sk sk--stats" />
      <div className="sk sk--line" style={{ width: '58%' }} />
      <div className="sk sk--card" />
      <div className="sk sk--card" style={{ height: 92 }} />
      <div className="sk sk--card" style={{ height: 92 }} />
    </div>
  );
}

function ReportView({
  report,
  onOpen,
}: {
  report: OrganizeReport;
  onOpen: (memoId: string, label: string) => void;
}) {
  const memos = useApp((s) => s.memos);
  const updateMemo = useApp((s) => s.updateMemo);
  const notify = useApp((s) => s.notify);
  const total = report.overview.total;
  const doneCount = report.todos.filter((t) => memos[t.memoId]?.todoDone?.[t.text]).length;

  /** 勾选状态写在记录上（不是 localStorage）：换设备、换浏览器都还在 */
  const toggleTodo = (memoId: string, text: string) => {
    const memo = memos[memoId];
    if (!memo) {
      notify('这条记录已经删除了', 'error');
      return;
    }
    const next = { ...(memo.todoDone ?? {}) };
    if (next[text]) delete next[text];
    else next[text] = Date.now();
    updateMemo(memoId, { todoDone: next });
  };

  if (report.empty) {
    return (
      <div className="orgIntro">
        <div className="orgIntro__title">这个范围里没有可整理的记录</div>
        <div className="orgIntro__desc">换个时间范围，或先写几条文字记录（纯图片不参与整理）。</div>
      </div>
    );
  }

  return (
    <div className="orgReport">
      <div className="orgStats">
        <Stat n={total} label="条记录" />
        <Stat n={report.overview.topics} label="个主题" />
        <Stat n={report.overview.todos} label="条待办" />
        <Stat n={report.overview.spanDays} label="天跨度" />
      </div>

      {report.notice ? <div className="orgNotice">{report.notice}</div> : null}

      <motion.div
        className="orgNote"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <IconSpark width={16} height={16} />
        <p>{report.suggestion}</p>
      </motion.div>

      <section className="orgSection">
        <div className="orgSection__head">
          <h2>主题</h2>
          <span className="orgSection__hint">
            {report.range.label} · {report.engine === 'llm' ? '模型归纳' : '本地聚类'}
          </span>
        </div>

        <div className="topics">
          {report.topics.map((t, i) => {
            // 摘要用的是簇内最靠近质心的两条，这里只补「摘要没提到」的记录，
            // 否则同一句话会在同一张卡片里出现两遍
            const picks = t.memoIds
              .map((id) => memos[id])
              .filter(Boolean)
              .filter((m) => !t.summary.includes(m.text.slice(0, 8)))
              .slice(0, 2);
            return (
              <motion.article
                key={t.id}
                className="topic"
                data-loose={Boolean(t.loose)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.03 * i, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="topic__head">
                  <span className="topic__idx">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="topic__title">{t.title}</h3>
                  <span className="topic__count">{t.count} 条</span>
                </div>

                <div className="topic__share" aria-hidden>
                  <motion.span
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(4, t.share * 100)}%` }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>

                {t.keywords.length ? (
                  <div className="topic__kw">
                    {t.keywords.map((k) => (
                      <span key={k}>{k}</span>
                    ))}
                  </div>
                ) : null}

                {t.summary ? <p className="topic__summary">{t.summary}</p> : null}

                <div className="topic__picks">
                  {picks.map((m) => (
                    <button
                      key={m.id}
                      className="pick"
                      onClick={() => void onOpen(m.id, m.text)}
                    >
                      <span className="pick__date">{dayLabel(m.createdAt)}</span>
                      <span className="pick__text">
                        {m.text.replace(/\s+/g, ' ').slice(0, 44)}
                        {m.text.length > 44 ? '…' : ''}
                      </span>
                    </button>
                  ))}
                </div>
              </motion.article>
            );
          })}
        </div>
      </section>

      {report.todos.length ? (
        <section className="orgSection">
          <div className="orgSection__head">
            <h2>待办</h2>
            <span className="orgSection__hint">
              {doneCount ? `${doneCount}/${report.todos.length} 已完成 · ` : ''}
              勾选即完成，点文字可改原文
            </span>
          </div>
          <div className="todoList">
            {report.todos.map((t) => {
              const done = Boolean(memos[t.memoId]?.todoDone?.[t.text]);
              return (
                <div
                  key={`${t.memoId}-${t.text.slice(0, 8)}`}
                  className={done ? 'todo todo--done' : 'todo'}
                >
                  <button
                    className="todo__box"
                    role="checkbox"
                    aria-checked={done}
                    aria-label={done ? `把「${t.text}」标回未完成` : `把「${t.text}」标为完成`}
                    title={done ? '取消完成' : '标记完成'}
                    onClick={() => toggleTodo(t.memoId, t.text)}
                  >
                    {done ? <IconCheck width={11} height={11} /> : null}
                  </button>
                  <button
                    className="todo__text"
                    onClick={() => void onOpen(t.memoId, t.text)}
                    title="打开这条记录"
                  >
                    {t.text}
                  </button>
                  {t.cue ? <span className="todo__cue">{t.cue}</span> : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {report.quotes.length ? (
        <section className="orgSection">
          <div className="orgSection__head">
            <h2>值得回看</h2>
          </div>
          <div className="quotes">
            {report.quotes.map((q) => (
              <button
                key={`${q.memoId}-q`}
                className="quote"
                onClick={() => void onOpen(q.memoId, q.text)}
              >
                {q.text}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <footer className="orgFoot">
        共 {total} 条 · {report.overview.chars} 字 · 生成于{' '}
        {new Date(report.createdAt).toLocaleString('zh-CN', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </footer>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="stat">
      <div className="stat__n">{n}</div>
      <div className="stat__l">{label}</div>
    </div>
  );
}
