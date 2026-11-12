import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { FoldersView } from './components/FoldersView';
import { RecordView } from './components/RecordView';
import { TimelineView } from './components/TimelineView';
import { SheetHost } from './components/SheetHost';
import { Sidebar } from './components/Sidebar';
import { SpaceView } from './components/SpaceView';
import { TabBar } from './components/TabBar';
import { Toast } from './components/Toast';
import { sync } from './lib/sync';
import { useRoute } from './lib/router';
import { initBackButton } from './lib/backbutton';
import { LoginPage } from './pages/LoginPage';
import { AccountPage } from './pages/AccountPage';
import { persistNow, useApp } from './lib/store';
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
      if (key === 'n') {
        e.preventDefault();
        useApp.getState().setTab('record');
        requestAnimationFrame(() => window.dispatchEvent(new Event('ssj:focus-composer')));
      }
      if (key === 'k') {
        e.preventDefault();
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

  if (route === '/login') return <LoginPage />;
  if (route === '/account') return <AccountPage />;

  return (
    <div className="app">
      <Sidebar />
      <main className="stage">
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
        <TabBar />
      </main>
      <SheetHost />
      <Toast />
    </div>
  );
}
