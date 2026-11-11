import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, type ReactNode } from 'react';

/**
 * 只负责「外壳 + 动画 + 关闭手势」。
 * 真正的 AnimatePresence 放在 SheetHost，卸载时才能播完退场动画。
 */
export function SheetFrame({ onClose, children }: { onClose: () => void; children: ReactNode }) {
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
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        onClick={onClose}
      />
      <div className="sheet-dock">
        <motion.div
          className="sheet"
          role="dialog"
          aria-modal="true"
          initial={{ y: '100%', scale: 0.98 }}
          animate={{ y: 0, scale: 1 }}
          exit={{ y: '100%', scale: 0.97, opacity: 0.5 }}
          transition={{ type: 'spring', stiffness: 380, damping: 36, mass: 0.9 }}
          drag="y"
          dragDirectionLock
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.4 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 96 || info.velocity.y > 760) onClose();
          }}
        >
          <div className="sheet__handle" />
          {children}
        </motion.div>
      </div>
    </>
  );
}

export function Lightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {src && (
        <motion.div
          className="lightbox"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.img
            src={src}
            alt=""
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
