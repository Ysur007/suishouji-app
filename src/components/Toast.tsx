import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '../lib/store';

export function Toast() {
  const toast = useApp((s) => s.toast);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          className="toast"
          data-tone={toast.tone}
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 460, damping: 34 }}
        >
          {toast.text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
