import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { ChatPage } from './pages/ChatPage';
import { OrganizePage } from './pages/OrganizePage';
import { AccountPage } from './pages/AccountPage';
import { LoginPage } from './pages/LoginPage';
import { FoldersView } from './components/FoldersView';
import { Rail } from './components/Rail';
import { RecordView } from './components/RecordView';
import { SheetHost } from './components/SheetHost';
import { SidePanel } from './components/SidePanel';
import { SpaceView } from './components/SpaceView';
import { TabBar } from './components/TabBar';
import { TimelineView } from './components/TimelineView';
import { Toast } from './components/Toast';
import { initBackButton } from './lib/backbutton';
import { navigate, useRoute } from './lib/router';
import { persistNow, useApp } from './lib/store';
import { sync } from './lib/sync';
import type { Tab } from './lib/types';

const ORDER: Record<Tab, number> = { record: 0, timeline: 1, space: 2, folders: 3 };

export default function App() {
  const route = useRoute();
  const tab = useApp((s) => s.tab);
  const hydrate = useApp((s) => s.hydrate);
  const [dir, setDir] = useState(1);
  const prevTab = useRef<Tab>(tab);

  useEffect(() => {
    initBackButton();
    // 必须等 hydrate 把登录态读进来再连同步，否则首帧 auth 为 null 会直接进游客分支、永不重连
    let alive = true;
    void (async () => {
      await hydrate();
      if (alive) sync.start();
    })();
    return () => {
      alive = false;
    };
  }, [hydrate]);

  useEffect(() => {
    if (prevTab.current === tab) return;
    setDir(ORDER[tab] >= ORDER[prevTab.current] ? 1 : -1);
    prevTab.current = tab;
  }, [tab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const key = e.key.toLowerCase();
      if (key === '1') {
        e.preventDefault();
        navigate('/');
      }
      if (key === '2') {
        e.preventDefault();
        navigate('/organize');
      }
      if (key === '3') {
        e.preventDefault();
        navigate('/chat');
      }
      if (key === '4') {
        e.preventDefault();
        navigate('/account');
      }
      if (key === 'n') {
        e.preventDefault();
        navigate('/');
        useApp.getState().setTab('record');
        requestAnimationFrame(() => window.dispatchEvent(new Event('ssj:focus-composer')));
      }
      if (key === 'k') {
        e.preventDefault();
        navigate('/');
        useApp.getState().setTab('space');
        requestAnimationFrame(() => {
          const input = document.querySelector<HTMLInputElement>('.search input');
          input?.focus();
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const flush = () => {
      void persistNow();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) flush();
    });
    return () => {
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  // /login 是独立页；/account 是一级页面，和其他页面共用外壳（Rail / TabBar / Toast 都要在）
  if (route === '/login') return <LoginPage />;

  const isOrganize = route === '/organize';
  const isChat = route === '/chat';
  const isAccount = route === '/account';

  return (
    <div className={`app${isAccount ? ' app--noPanel' : ''}`}>
      <Rail />
      {isAccount ? null : <SidePanel />}
      <main className="stage">
        {isAccount ? (
          <AccountPage />
        ) : isOrganize ? (
          <OrganizePage />
        ) : isChat ? (
          <ChatPage />
        ) : (
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div
              key={tab}
              className="view"
              custom={dir}
              initial={{ opacity: 0, x: dir * 22 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -14 }}
              transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            >
              {tab === 'record' && <RecordView />}
              {tab === 'timeline' && <TimelineView />}
              {tab === 'space' && <SpaceView />}
              {tab === 'folders' && <FoldersView />}
            </motion.div>
          </AnimatePresence>
        )}
        <TabBar />
      </main>
      <SheetHost />
      <Toast />
    </div>
  );
}
