/**
 * 整理报告与对话会话的本地存档。
 *
 * 键按分区（guest / u:<id>）隔离，和记录一样：切账号看不到别人的整理结果。
 * 只存在本机——这些是「看过的东西」，不值得占用同步带宽。
 */

import type { ChatTurn, OrganizeReport } from './ai';

const REPORT_LIMIT = 20;
const CHAT_LIMIT = 30;

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  turns: ChatTurn[];
}

const reportKey = (bucket: string) => `ssj:ai:reports:${bucket}`;
const chatKey = (bucket: string) => `ssj:ai:chats:${bucket}`;

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as T[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(key: string, list: unknown[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* 存不下就算了，不能因为配额把页面搞崩 */
  }
}

export function loadReports(bucket: string): OrganizeReport[] {
  return read<OrganizeReport>(reportKey(bucket)).sort((a, b) => b.createdAt - a.createdAt);
}

export function saveReport(bucket: string, report: OrganizeReport): OrganizeReport[] {
  const list = read<OrganizeReport>(reportKey(bucket)).filter((r) => r.id !== report.id);
  list.unshift(report);
  const trimmed = list.slice(0, REPORT_LIMIT);
  write(reportKey(bucket), trimmed);
  return trimmed;
}

export function removeReport(bucket: string, id: string): OrganizeReport[] {
  const list = read<OrganizeReport>(reportKey(bucket)).filter((r) => r.id !== id);
  write(reportKey(bucket), list);
  return list;
}

export function loadChats(bucket: string): ChatSession[] {
  return read<ChatSession>(chatKey(bucket)).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveChat(bucket: string, session: ChatSession): ChatSession[] {
  const list = read<ChatSession>(chatKey(bucket)).filter((c) => c.id !== session.id);
  list.unshift(session);
  const trimmed = list.slice(0, CHAT_LIMIT);
  write(chatKey(bucket), trimmed);
  return trimmed;
}

export function removeChat(bucket: string, id: string): ChatSession[] {
  const list = read<ChatSession>(chatKey(bucket)).filter((c) => c.id !== id);
  write(chatKey(bucket), list);
  return list;
}

export function titleOf(turns: ChatTurn[]): string {
  const first = turns.find((t) => t.role === 'user')?.content ?? '新的对话';
  const clean = first.replace(/\s+/g, ' ').trim();
  return clean.length > 18 ? `${clean.slice(0, 18)}…` : clean;
}
