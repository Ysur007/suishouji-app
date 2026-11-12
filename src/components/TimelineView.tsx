import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatGap, formatSpan, formatTime, relativeTime } from '../lib/format';
import { folderName, liveMemos, useApp } from '../lib/store';
import { buildTimeline } from '../lib/timeline';
import { useUI } from '../lib/ui';
import { IconArrowDown, IconFolder, IconImage, IconPin } from './Icons';
import { SyncBadge } from './SyncBadge';
import { Topbar } from './Topbar';

export function TimelineView() {
  const memos = useApp((s) => s.memos);
  const folders = useApp((s) => s.folders);
  const clientId = useApp((s) => s.clientId);
  const openSheet = useUI((s) => s.open);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(false);

  const viewBucket = useApp((s) => s.viewBucket);
  const list = useMemo(
    () => liveMemos(memos).filter((m) => (m.spaceId ?? viewBucket) === viewBucket),
    [memos, viewBucket],
  );
  const timeline = useMemo(() => buildTimeline(list, clientId), [list, clientId]);
  const todayCount = useMemo(() => {
    const today = new Date();
    return list.filter((m) => {
      const d = new Date(m.createdAt);
      return (
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate()
      );
    }).length;
  }, [list]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [list.length]);

  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  return (
    <>
      <Topbar
        title="时间线"
        sub={
          <>
            <span>{timeline.total} 条</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>跨 {formatSpan(timeline.spanMs)}</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>最近 {relativeTime(timeline.latest)}</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <SyncBadge />
          </>
        }
      />

      <div className="scroll" ref={scrollRef}>
        <div className="column">
          {timeline.total === 0 ? (
            <div className="empty">
              <div className="empty__title">时间线还是空的</div>
              <div className="empty__desc">去「记录」里说一句，它会按发生时间落在这条线上。</div>
            </div>
          ) : (
            <>
              <div className="tl-stats">
                <div className="tl-stat">
                  <span className="tl-stat__value">{timeline.total}</span>
                  <span className="tl-stat__label">条记录</span>
                </div>
                <div className="tl-stat">
                  <span className="tl-stat__value">{formatSpan(timeline.spanMs)}</span>
                  <span className="tl-stat__label">时间跨度</span>
                </div>
                <div className="tl-stat">
                  <span className="tl-stat__value">{todayCount}</span>
                  <span className="tl-stat__label">今天新增</span>
                </div>
                <div className="tl-stat">
                  <span className="tl-stat__value">{formatTime(timeline.latest)}</span>
                  <span className="tl-stat__label">最近一条</span>
                </div>
              </div>

              <div className="timeline">
                {timeline.days.map((day) => (
                  <section className="tl-day" key={day.key}>
                    <div className="tl-day__head">
                      <div className="tl-day__time" />
                      <div className="tl-rail">
                        <span className="tl-day__dot" />
                      </div>
                      <div className="tl-day__body">
                        <span className="tl-day__label">{day.label}</span>
                        <span className="tl-day__date">{day.date}</span>
                        <span className="tl-day__count">{day.nodes.length} 条</span>
                        <span className="tl-day__line" />
                      </div>
                    </div>

                    {day.nodes.map((node) => (
                      <div key={node.memo.id}>
                        {node.gapMs > 0 && (
                          <div className="tl-gap">
                            <div className="tl-gap__time" />
                            <div className="tl-rail tl-rail--gap" />
                            <div className="tl-gap__label">{formatGap(node.gapMs)}</div>
                          </div>
                        )}

                        <motion.div
                          className={`tl-node${node.mine ? ' is-mine' : ' is-them'}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => openSheet({ kind: 'editor', memoId: node.memo.id })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openSheet({ kind: 'editor', memoId: node.memo.id });
                            }
                          }}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                        >
                          <div className="tl-node__time">
                            <span className="tl-node__hh">{formatTime(node.memo.createdAt)}</span>
                          </div>

                          <div className="tl-rail">
                            <span className="tl-node__dot" />
                          </div>

                          <div className="tl-node__body">
                            <p className="tl-node__text">
                              {node.memo.text || (node.memo.images.length ? '（图片）' : '（空记录）')}
                            </p>

                            {node.memo.images.length > 0 && (
                              <div className="tl-node__imgs">
                                {node.memo.images.slice(0, 3).map((src, i) => (
                                  <img key={i} src={src} alt="" loading="lazy" />
                                ))}
                                {node.memo.images.length > 3 && (
                                  <span className="tl-node__more">+{node.memo.images.length - 3}</span>
                                )}
                              </div>
                            )}

                            <div className="tl-node__meta">
                              <span className="tl-pos">
                                #{node.position}
                                <i>/{timeline.total}</i>
                              </span>
                              {folderName(folders, node.memo.folderId) && (
                                <span className="tl-chip">
                                  <IconFolder width={11} height={11} />
                                  {folderName(folders, node.memo.folderId)}
                                </span>
                              )}
                              <span className="tl-chip">{node.mine ? '本机' : '其他设备'}</span>
                              <span className="tl-day-pos">当天第 {node.dayPosition} 条</span>
                              {node.memo.pinned && (
                                <span className="tl-chip">
                                  <IconPin width={10} height={10} />
                                  置顶
                                </span>
                              )}
                              {node.memo.images.length > 0 && (
                                <span className="tl-chip">
                                  <IconImage width={11} height={11} />
                                  {node.memo.images.length}
                                </span>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {!atBottom && timeline.total > 0 && (
        <motion.button
          className="tl-jump"
          onClick={jumpToLatest}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          aria-label="回到最新"
        >
          <IconArrowDown width={14} height={14} />
          最新
        </motion.button>
      )}
    </>
  );
}
