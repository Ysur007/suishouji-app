/**
 * 二级导航面板：当前「去处」里有哪些集合。
 *
 * - 记录：视图（流水 / 时间线 / 空间 / 文件夹）+ 共享空间 + 文件夹
 * - 整理：历史报告
 * - 对话：历史会话
 *
 * 面板不承载内容，只负责切换；内容永远在右边的主区。
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  IconChat,
  IconDownload,
  IconFolder,
  IconEdit,
  IconLayers,
  IconLogout,
  IconPlus,
  IconRecord,
  IconSpace,
  IconTimeline,
  IconTrash,
  IconUser,
  IconUsers,
} from './Icons';
import { SyncCard } from './SyncBadge';
import { exportLocalBackup } from '../lib/backup';
import { ConfirmBar } from './ConfirmBar';
import { useAi } from '../lib/aiui';
import { navigate, useRoute } from '../lib/router';
import { liveFolders, liveMemos, useApp } from '../lib/store';
import { useUI } from '../lib/ui';
import type { Tab } from '../lib/types';

const VIEWS: Array<{ key: Tab; label: string; icon: React.ReactNode }> = [
  { key: 'record', label: '流水', icon: <IconRecord /> },
  { key: 'timeline', label: '时间线', icon: <IconTimeline /> },
  { key: 'space', label: '空间', icon: <IconSpace /> },
  { key: 'folders', label: '文件夹', icon: <IconFolder /> },
];

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return `${Math.floor(d / 30)} 个月前`;
}

export function SidePanel() {
  const route = useRoute();

  return (
    <aside className="panel">
      {route === '/organize' ? (
        <OrganizePanel />
      ) : route === '/chat' ? (
        <ChatPanel />
      ) : route === '/account' ? (
        <AccountPanel />
      ) : (
        <RecordPanel />
      )}
      <div className="panel__foot">
        <SyncCard />
      </div>
    </aside>
  );
}

/**
 * 我的：左面板 = 账号 + 常用操作。
 *
 * 之前的「分区目录」删掉了：它只是把右边已经写着的分类再抄一遍，
 * 点过去也只是滚一下——面板应该放「能做成的事」，不是内容的目录。
 *
 * 三个操作按「多久用一次」排：导出（换设备/备份）> 改密码 > 退出登录；
 * 退出登录最危险也最少用，固定压在最后，并且两段确认。
 * 窄屏没有面板，这三项仍在内容区里（用 `.acct-mobileOnly` 控制显隐）。
 */
function AccountPanel() {
  const user = useApp((s) => s.user);
  const lastUser = useApp((s) => s.lastUser);
  const auth = useApp((s) => s.auth);
  const memos = useApp((s) => s.memos);
  const folders = useApp((s) => s.folders);
  const notify = useApp((s) => s.notify);
  const signOut = useApp((s) => s.signOut);
  const openSheet = useUI((s) => s.open);

  const [confirmOut, setConfirmOut] = useState(false);
  const me = user ?? lastUser;
  const count = liveMemos(memos).length;

  return (
    <>
      <PanelHead label="我的" count={count ? `${count} 条` : undefined} />

      <div className="panel__scroll">
        {/* 账号是「我是谁」，不是目录里的一段，所以只展示、不参与选中 */}
        <div className="panel__section">
          <div className="panel__label">账号</div>
          <div className="panel__row">
            <div className="panel__rowMain">
              <span className="panel__name">
                {me ? `@${me.username}` : '未登录'}
                {auth ? '' : me ? ' · 已退出' : ''}
              </span>
              <span className="panel__sub">{auth ? '记录绑定在此账号下' : '记录只在本机'}</span>
            </div>
          </div>
        </div>

        <div className="panel__section">
          <div className="panel__label">操作</div>
          <button
            className="panel__action"
            title="导出一份 JSON 备份到本机下载目录"
            onClick={() => exportLocalBackup(memos, folders, notify)}
          >
            <span className="panel__icon">
              <IconDownload />
            </span>
            <span className="panel__name">导出备份</span>
            <span className="panel__meta">JSON</span>
          </button>

          {auth ? (
            <>
              <button
                className="panel__action"
                title="改完其它设备上的登录会失效"
                onClick={() => openSheet({ kind: 'password' })}
              >
                <span className="panel__icon">
                  <IconEdit />
                </span>
                <span className="panel__name">修改密码</span>
              </button>
              <button
                className="panel__action panel__action--danger"
                data-confirm={confirmOut}
                onClick={() => setConfirmOut(true)}
              >
                <span className="panel__icon">
                  <IconLogout />
                </span>
                <span className="panel__name">退出登录</span>
              </button>
              {confirmOut ? (
                <ConfirmBar
                  text="记录仍留在本机，重新登录同一账号会自动补传。"
                  confirmLabel="退出"
                  onConfirm={() => {
                    setConfirmOut(false);
                    void signOut();
                  }}
                  onCancel={() => setConfirmOut(false)}
                />
              ) : null}
            </>
          ) : (
            <button className="panel__action" onClick={() => navigate('/login?next=/account')}>
              <span className="panel__icon">
                <IconUser />
              </span>
              <span className="panel__name">登录 / 注册</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function PanelHead({ label, count }: { label: string; count?: string }) {
  return (
    <div className="panel__head">
      <div className="panel__title">{label}</div>
      {count ? <div className="panel__count">{count}</div> : null}
    </div>
  );
}

function RecordPanel() {
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  const memos = useApp((s) => s.memos);
  const folders = useApp((s) => s.folders);
  const groups = useApp((s) => s.groups);
  const user = useApp((s) => s.user);
  const activeSpace = useApp((s) => s.activeSpace);
  const viewBucket = useApp((s) => s.viewBucket);
  const setActiveSpace = useApp((s) => s.setActiveSpace);
  const setFolderFilter = useApp((s) => s.setFolderFilter);
  const openSheet = useUI((s) => s.open);

  const all = liveMemos(memos);
  const inBucket = all.filter((m) => (m.spaceId ?? viewBucket) === viewBucket).length;
  const groupList = Object.values(groups).sort((a, b) => a.createdAt - b.createdAt);
  const groupCount = (id: string) => all.filter((m) => m.spaceId === `g:${id}`).length;
  const folderList = liveFolders(folders);
  const mine = activeSpace === viewBucket;

  return (
    <>
      <PanelHead label="记录" count={`${inBucket} 条`} />

      <div className="panel__scroll">
        <div className="panel__section">
          <div className="panel__label">视图</div>
          {VIEWS.map((v) => {
            const active = mine && tab === v.key;
            const count =
              v.key === 'folders' ? folderList.length : v.key === 'record' ? inBucket : undefined;
            return (
              <button
                key={v.key}
                className="panel__item"
                data-active={active}
                onClick={() => {
                  setActiveSpace(viewBucket);
                  setTab(v.key);
                  if (location.pathname !== '/') navigate('/');
                }}
              >
                <span className="panel__icon">{v.icon}</span>
                <span className="panel__name">{v.label}</span>
                {count !== undefined ? <span className="panel__meta">{count}</span> : null}
              </button>
            );
          })}
        </div>

        <div className="panel__section">
          <div className="panel__label">共享空间</div>
          <button
            className="panel__item"
            data-kind="space"
            data-active={mine}
            onClick={() => {
              setActiveSpace(viewBucket);
              setTab('record');
              if (location.pathname !== '/') navigate('/');
            }}
          >
            <span className="panel__icon">
              <IconUser />
            </span>
            <span className="panel__name">我的记录</span>
            <span className="panel__meta">{inBucket}</span>
          </button>

          {groupList.map((g) => (
            <button
              key={g.id}
              className="panel__item"
              data-kind="space"
              data-active={activeSpace === `g:${g.id}`}
              onClick={() => {
                setActiveSpace(`g:${g.id}`);
                setTab('record');
                if (location.pathname !== '/') navigate('/');
              }}
            >
              <span className="panel__icon">
                <IconUsers />
              </span>
              <span className="panel__name">{g.name}</span>
              <span className="panel__meta">{groupCount(g.id)}</span>
            </button>
          ))}

          {user ? (
            <button
              className="panel__item panel__item--ghost"
              onClick={() => openSheet({ kind: 'new-group' })}
            >
              <span className="panel__icon">
                <IconPlus />
              </span>
              <span className="panel__name">新建群</span>
            </button>
          ) : null}
        </div>

        {folderList.length > 0 ? (
          <div className="panel__section">
            <div className="panel__label">文件夹</div>
            {folderList.map((f) => {
              const n = all.filter((m) => m.folderId === f.id).length;
              return (
                <button
                  key={f.id}
                  className="panel__item"
                  data-active={mine && tab === 'space' && false}
                  onClick={() => {
                    setActiveSpace(viewBucket);
                    setFolderFilter(f.id);
                    setTab('space');
                    if (location.pathname !== '/') navigate('/');
                  }}
                >
                  <span
                    className="panel__dot"
                    style={{ background: `var(--tone-${f.tone})` }}
                    aria-hidden
                  />
                  <span className="panel__name">{f.name}</span>
                  <span className="panel__meta">{n}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </>
  );
}

function OrganizePanel() {
  const reports = useAi((s) => s.reports);
  const reportId = useAi((s) => s.reportId);
  const selectReport = useAi((s) => s.selectReport);
  const dropReport = useAi((s) => s.dropReport);

  return (
    <>
      <PanelHead label="整理" count={reports.length ? `${reports.length} 份` : undefined} />

      <div className="panel__scroll">
        <div className="panel__section">
          <button
            className="panel__new"
            onClick={() => {
              selectReport(null);
              if (location.pathname !== '/organize') navigate('/organize');
            }}
          >
            <IconLayers width={16} height={16} />
            <span>新建整理</span>
          </button>
        </div>

        <div className="panel__section">
          <div className="panel__label">历史</div>
          {reports.length === 0 ? (
            <div className="panel__empty">还没有整理过。生成一次，结果会留在这里。</div>
          ) : (
            reports.map((r) => (
              <div key={r.id} className="panel__row" data-active={r.id === reportId}>
                <button
                  className="panel__rowMain"
                  onClick={() => {
                    selectReport(r.id);
                    if (location.pathname !== '/organize') navigate('/organize');
                  }}
                >
                  <span className="panel__name">{r.range.label}</span>
                  <span className="panel__sub">
                    {r.overview.total} 条 · {r.overview.topics} 主题 · {timeAgo(r.createdAt)}
                  </span>
                </button>
                <button
                  className="panel__rowX"
                  aria-label="删除这份整理"
                  onClick={() => dropReport(r.id)}
                >
                  <IconTrash width={13} height={13} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function ChatPanel() {
  const chats = useAi((s) => s.chats);
  const chatId = useAi((s) => s.chatId);
  const newChat = useAi((s) => s.newChat);
  const selectChat = useAi((s) => s.selectChat);
  const dropChat = useAi((s) => s.dropChat);

  return (
    <>
      <PanelHead label="对话" count={chats.length ? `${chats.length} 个` : undefined} />

      <div className="panel__scroll">
        <div className="panel__section">
          <button
            className="panel__new"
            onClick={() => {
              newChat();
              if (location.pathname !== '/chat') navigate('/chat');
            }}
          >
            <IconChat width={16} height={16} />
            <span>新对话</span>
          </button>
        </div>

        <div className="panel__section">
          <div className="panel__label">最近</div>
          {chats.length === 0 ? (
            <div className="panel__empty">问点什么，对话会留在这里。</div>
          ) : (
            chats.map((c) => (
              <div key={c.id} className="panel__row" data-active={c.id === chatId}>
                <button
                  className="panel__rowMain"
                  onClick={() => {
                    selectChat(c.id);
                    if (location.pathname !== '/chat') navigate('/chat');
                  }}
                >
                  <span className="panel__name">{c.title}</span>
                  <span className="panel__sub">
                    {c.turns.length ? `${c.turns.length} 轮 · ${timeAgo(c.updatedAt)}` : '还没开始'}
                  </span>
                </button>
                <button className="panel__rowX" aria-label="删除这个对话" onClick={() => dropChat(c.id)}>
                  <IconTrash width={13} height={13} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

/** 移动端用不到侧栏，但需要同样的集合列表：包一层给抽屉用 */
export function PanelBody({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="panelBody">
      <div onClickCapture={() => onNavigate?.()}>
        <MobileSections />
      </div>
    </motion.div>
  );
}

function MobileSections() {
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  const memos = useApp((s) => s.memos);
  const folders = useApp((s) => s.folders);
  const groups = useApp((s) => s.groups);
  const activeSpace = useApp((s) => s.activeSpace);
  const viewBucket = useApp((s) => s.viewBucket);
  const setActiveSpace = useApp((s) => s.setActiveSpace);
  const setFolderFilter = useApp((s) => s.setFolderFilter);

  const all = liveMemos(memos);
  const inBucket = all.filter((m) => (m.spaceId ?? viewBucket) === viewBucket).length;

  return (
    <>
      <div className="panel__label">视图</div>
      <div className="space-list">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            className="space-item"
            data-active={activeSpace === viewBucket && tab === v.key}
            onClick={() => {
              setActiveSpace(viewBucket);
              setTab(v.key);
              navigate('/');
            }}
          >
            <span className="space-item__icon">{v.icon}</span>
            <span className="space-item__name">{v.label}</span>
          </button>
        ))}
      </div>

      <div className="panel__label" style={{ marginTop: 14 }}>
        共享空间
      </div>
      <div className="space-list">
        <button
          className="space-item"
          data-active={activeSpace === viewBucket && tab === 'record'}
          onClick={() => {
            setActiveSpace(viewBucket);
            setTab('record');
            navigate('/');
          }}
        >
          <span className="space-item__icon">
            <IconUser width={16} height={16} />
          </span>
          <span className="space-item__name">我的记录</span>
          <span className="space-item__count">{inBucket}</span>
        </button>
        {Object.values(groups).map((g) => (
          <button
            key={g.id}
            className="space-item"
            data-active={activeSpace === `g:${g.id}`}
            onClick={() => {
              setActiveSpace(`g:${g.id}`);
              setTab('record');
              navigate('/');
            }}
          >
            <span className="space-item__icon">
              <IconUsers width={16} height={16} />
            </span>
            <span className="space-item__name">{g.name}</span>
          </button>
        ))}
      </div>

      {liveFolders(folders).length ? (
        <>
          <div className="panel__label" style={{ marginTop: 14 }}>
            文件夹
          </div>
          <div className="space-list">
            {liveFolders(folders).map((f) => (
              <button
                key={f.id}
                className="space-item"
                onClick={() => {
                  setActiveSpace(viewBucket);
                  setFolderFilter(f.id);
                  setTab('space');
                  navigate('/');
                }}
              >
                <span
                  className="space-item__icon"
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 3,
                    background: `var(--tone-${f.tone})`,
                    justifySelf: 'center',
                  }}
                />
                <span className="space-item__name">{f.name}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
