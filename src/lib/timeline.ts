import { dayKey, dayLabel, formatDate } from './format';
import { memoAuthor } from './store';
import type { Memo } from './types';

export interface TimelineNode {
  memo: Memo;
  /** 在整条时间线中的序号，从 1（最早）开始 */
  position: number;
  /** 当天第几条，从 1 开始 */
  dayPosition: number;
  /** 与上一条的间隔；首条为 0 */
  gapMs: number;
  mine: boolean;
}

export interface TimelineDay {
  key: string;
  label: string;
  date: string;
  nodes: TimelineNode[];
}

export interface Timeline {
  days: TimelineDay[];
  total: number;
  spanMs: number;
  latest: number;
  earliest: number;
}

/** 只有超过这个间隔才在时间线上画"空白期"，否则全是噪声 */
const GAP_THRESHOLD = 90 * 60 * 1000;

export function buildTimeline(memos: Memo[], clientId: string): Timeline {
  const sorted = [...memos].sort((a, b) => a.createdAt - b.createdAt);
  const days: TimelineDay[] = [];
  let prev: Memo | null = null;

  sorted.forEach((memo, i) => {
    const key = dayKey(memo.createdAt);
    let day = days[days.length - 1];
    const newDay = !day || day.key !== key;
    if (!day || newDay) {
      day = { key, label: dayLabel(memo.createdAt), date: formatDate(memo.createdAt), nodes: [] };
      days.push(day);
    }
    // 跨天的间隔由日期节点表达，不再单独画"空白期"
    const gapMs = prev !== null && !newDay ? memo.createdAt - prev.createdAt : 0;
    day.nodes.push({
      memo,
      position: i + 1,
      dayPosition: day.nodes.length + 1,
      gapMs: gapMs >= GAP_THRESHOLD ? gapMs : 0,
      mine: memoAuthor(memo) === clientId,
    });
    prev = memo;
  });

  return {
    days,
    total: sorted.length,
    spanMs: sorted.length > 1 ? sorted[sorted.length - 1].createdAt - sorted[0].createdAt : 0,
    latest: sorted.length ? sorted[sorted.length - 1].createdAt : 0,
    earliest: sorted.length ? sorted[0].createdAt : 0,
  };
}
