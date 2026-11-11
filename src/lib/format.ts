const pad = (n: number) => String(n).padStart(2, '0');

/* 全站统一的时间格式：日期 2026.11.12，时间 14:32，两者拼接用空格 */
export function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDateTime(ts: number): string {
  return `${formatDate(ts)} ${formatTime(ts)}`;
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dayLabel(ts: number): string {
  const now = new Date();
  const target = new Date(ts);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const diffDays = Math.round((startOfToday - startOfTarget) / 86_400_000);
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays === 2) return '前天';
  const sameYear = target.getFullYear() === now.getFullYear();
  return sameYear ? `${target.getMonth() + 1}月${target.getDate()}日` : `${target.getFullYear()}年${target.getMonth() + 1}月`;
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 172_800_000) return '昨天';
  return dayLabel(ts);
}

/** 两段记录之间的间隔，用于时间线上的"空白期"标注 */
export function formatGap(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `间隔 ${min} 分钟`;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) return `间隔 ${hours} 小时`;
  const days = Math.round(ms / 86_400_000);
  if (days < 31) return `间隔 ${days} 天`;
  return `间隔 ${Math.round(days / 30)} 个月`;
}

/** 时间跨度：从最早一条到最新一条 */
export function formatSpan(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${Math.max(min, 1)} 分钟`;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) return `${hours} 小时`;
  const days = Math.round(ms / 86_400_000);
  if (days < 31) return `${days} 天`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} 个月`;
  return `${(months / 12).toFixed(1)} 年`;
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
