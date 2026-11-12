/**
 * AI 相关的界面状态。
 *
 * 整理报告与对话会话都来自本机存档（localStorage），但侧栏面板和主区页面都要读写同一份，
 * 放一个 store 里比事件总线清楚：面板点一下，主区立刻换。
 */

import { create } from 'zustand';
import type { ChatTurn, OrganizeReport } from './ai';
import {
  loadChats,
  loadReports,
  removeChat as removeChatFile,
  removeReport as removeReportFile,
  saveChat,
  saveReport,
  titleOf,
  type ChatSession,
} from './reports';

interface AiState {
  bucket: string;
  reports: OrganizeReport[];
  reportId: string | null;
  chats: ChatSession[];
  chatId: string | null;

  load: (bucket: string) => void;
  selectReport: (id: string | null) => void;
  setReport: (report: OrganizeReport) => void;
  dropReport: (id: string) => void;

  newChat: () => string;
  selectChat: (id: string) => void;
  setTurns: (id: string, turns: ChatTurn[]) => void;
  dropChat: (id: string) => void;
}

export const useAi = create<AiState>((set, get) => ({
  bucket: 'guest',
  reports: [],
  reportId: null,
  chats: [],
  chatId: null,

  load(bucket) {
    if (get().bucket === bucket && (get().reports.length || get().chats.length)) return;
    const reports = loadReports(bucket);
    const chats = loadChats(bucket);
    set({
      bucket,
      reports,
      reportId: reports[0]?.id ?? null,
      chats,
      chatId: chats[0]?.id ?? null,
    });
  },

  selectReport(id) {
    set({ reportId: id });
  },

  setReport(report) {
    const bucket = get().bucket;
    set({ reports: saveReport(bucket, report), reportId: report.id });
  },

  dropReport(id) {
    const bucket = get().bucket;
    const reports = removeReportFile(bucket, id);
    set({ reports, reportId: get().reportId === id ? (reports[0]?.id ?? null) : get().reportId });
  },

  newChat() {
    const now = Date.now();
    const session: ChatSession = {
      id: `c${now.toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      title: '新的对话',
      createdAt: now,
      updatedAt: now,
      turns: [],
    };
    set({ chats: saveChat(get().bucket, session), chatId: session.id });
    return session.id;
  },

  selectChat(id) {
    set({ chatId: id });
  },

  setTurns(id, turns) {
    const exists = get().chats.find((c) => c.id === id);
    const now = Date.now();
    const session: ChatSession = exists
      ? { ...exists, turns, title: titleOf(turns), updatedAt: now }
      : { id, title: titleOf(turns), createdAt: now, updatedAt: now, turns };
    set({ chats: saveChat(get().bucket, session), chatId: id });
  },

  dropChat(id) {
    const bucket = get().bucket;
    const chats = removeChatFile(bucket, id);
    set({ chats, chatId: get().chatId === id ? (chats[0]?.id ?? null) : get().chatId });
  },
}));
