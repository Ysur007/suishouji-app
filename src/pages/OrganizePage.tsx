/**
 * 整理页：把一段时间里的记录按主题归类，抽出待办和值得回看的句子。
 *
 * 结果的每个主题都能点回原始记录——归纳不该是一个「看不懂但很高级」的黑盒，
 * 每一句都要能落到具体某一条上。
 */

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { aiStatus, organize, type AiStatus, type OrganizeReport } from '../lib/ai';
import { useAi } from '../lib/aiui';
import { liveMemos, useApp } from '../lib/store';
import { useUI } from '../lib/ui';
import { IconSpark } from '../components/Icons';

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
  const activeSpace = useApp((s) => s.activeSpace);
  const groups = useApp((s) => s.groups);
  const memos = useApp((s) => s.memos);
  const openSheet = useUI((s) => s.open);

  const reports = useAi((s) => s.reports);
  const reportId = useAi((s) => s.reportId);
  const load = useAi((s) => s.load);
  const setReport = useAi((s) => s.setReport);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<'space' | 'all'>('space');
  const [days, setDays] = useState<number | null>(30);
  const [remote, setRemote] = useState<AiStatus | null>(null);

  useEffect(() => {
    load(bucket);
  }, [bucket, load]);

  useEffect(() => {
    aiStatus()
      .then(setRemote)
      .catch(() => setRemote(null));
  }, []);

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
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
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
          <span className="engineTag" data-engine={remote?.engine ?? 'local'}>
            <i />
            {remote?.engine === 'llm' ? `模型 · ${remote.model ?? '默认'}` : '本地分析'}
          </span>
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
        {error ? <div className="orgError">{error}</div> : null}

        {busy ? <Skeleton /> : report ? <ReportView report={report} onOpen={openSheet} /> : <Intro count={localCount} />}
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
  onOpen: (sheet: { kind: 'editor'; memoId: string }) => void;
}) {
  const memos = useApp((s) => s.memos);
  const total = report.overview.total;

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
                      onClick={() => onOpen({ kind: 'editor', memoId: m.id })}
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
            <span className="orgSection__hint">从记录里读出的动作项，点开可改</span>
          </div>
          <div className="todoList">
            {report.todos.map((t) => (
              <button
                key={`${t.memoId}-${t.text.slice(0, 8)}`}
                className="todo"
                onClick={() => t.memoId && onOpen({ kind: 'editor', memoId: t.memoId })}
              >
                <span className="todo__box" aria-hidden />
                <span className="todo__text">{t.text}</span>
                {t.cue ? <span className="todo__cue">{t.cue}</span> : null}
              </button>
            ))}
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
                onClick={() => onOpen({ kind: 'editor', memoId: q.memoId })}
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
