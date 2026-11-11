import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface MenuAction {
  key: string;
  label: string;
  icon: ReactNode;
  danger?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  actions: MenuAction[];
  onClose: () => void;
}

const WIDTH = 292;

export function ContextMenu({ x, y, actions, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x - WIDTH / 2, top: y + 10, origin: '50% 0%' });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.min(Math.max(10, x - WIDTH / 2), window.innerWidth - WIDTH - 10);
    let top = y + 10;
    let origin = '50% 0%';
    if (top + rect.height > window.innerHeight - 10) {
      top = Math.max(10, y - rect.height - 10);
      origin = '50% 100%';
    }
    setPos({ left, top, origin });
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <motion.div
        className="scrim"
        style={{ background: 'rgba(26,21,16,.14)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <motion.div
        ref={ref}
        className="menu"
        role="menu"
        style={{ left: pos.left, top: pos.top, ['--ox' as string]: pos.origin.split(' ')[0] }}
        initial={{ opacity: 0, scale: 0.88, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: -4 }}
        transition={{ type: 'spring', stiffness: 520, damping: 34, mass: 0.7 }}
      >
        <div className="menu__grid">
          {actions.map((action) => (
            <button
              key={action.key}
              className={`menu__item${action.danger ? ' menu__item--danger' : ''}`}
              role="menuitem"
              onClick={() => {
                onClose();
                action.onClick();
              }}
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </>
  );
}

export function useMenu() {
  const [state, setState] = useState<{ x: number; y: number; memoId: string } | null>(null);
  const open = useCallback((x: number, y: number, memoId: string) => setState({ x, y, memoId }), []);
  const close = useCallback(() => setState(null), []);
  return { menu: state, openMenu: open, closeMenu: close };
}

export function MenuHost({
  menu,
  closeMenu,
  actions,
}: {
  menu: { x: number; y: number } | null;
  closeMenu: () => void;
  actions: MenuAction[];
}) {
  return (
    <AnimatePresence>
      {menu && <ContextMenu key="menu" x={menu.x} y={menu.y} actions={actions} onClose={closeMenu} />}
    </AnimatePresence>
  );
}

/** 长按手势：移动超过阈值即取消，避免和滚动冲突 */
export function useLongPress(onLongPress: (point: { x: number; y: number }) => void, ms = 420) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const longPressed = useRef(false);

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    moved.current = false;
    longPressed.current = false;
    origin.current = { x: e.clientX, y: e.clientY };
    const point = { x: e.clientX, y: e.clientY };
    clear();
    timer.current = window.setTimeout(() => {
      if (!moved.current) {
        longPressed.current = true;
        navigator.vibrate?.(8);
        onLongPress(point);
      }
    }, ms);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!origin.current) return;
    if (Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > 9) {
      moved.current = true;
      clear();
    }
  };

  const onPointerUp = () => {
    clear();
    origin.current = null;
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave: onPointerUp,
    onPointerCancel: onPointerUp,
    longPressed,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      onLongPress({ x: e.clientX, y: e.clientY });
    },
  };
}
